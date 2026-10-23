"""API routes for Neo4j Knowledge Graph construction, indexing, and visualization."""

import logging
import time as _time

logger = logging.getLogger(__name__)

from fastapi import APIRouter, HTTPException, Query, Request
from app.config import get_settings
from app.graph import (
    clear_repository_graph,
    ensure_schema_constraints,
    get_graph_elements,
    get_graph_stats,
    ingest_repository_graph,
)
from app.models import (
    FileParseResult,
    GraphElementsResponse,
    GraphIndexRequest,
    GraphIndexSummary,
    GraphStatsResponse,
)
from app.routes.parse import _parse_and_chunk_content

graph_router = APIRouter(tags=["Knowledge Graph"])


def _get_neo4j_driver(request: Request):
    """Retrieve driver from app.state or lazy-initialize from settings if missing."""
    driver = getattr(request.app.state, "neo4j", None)
    if not driver:
        from neo4j import AsyncGraphDatabase
        from app.config import configure_tls, get_settings
        configure_tls()
        settings = get_settings()
        driver = AsyncGraphDatabase.driver(
            settings.NEO4J_URI,
            auth=(settings.NEO4J_USERNAME, settings.NEO4J_PASSWORD.get_secret_value()),
        )
        request.app.state.neo4j = driver
    return driver


@graph_router.post("/api/repos/{repo_id:path}/graph/index", response_model=GraphIndexSummary)
async def api_index_repo_graph(
    repo_id: str,
    request: Request,
    body: GraphIndexRequest | None = None,
):
    """Index a repository's code files into the Neo4j Knowledge Graph.

    1. Fetches repository default branch file tree via GitHub API.
    2. Filters blobs matching target extensions (e.g. .py, .js, .ts, .tsx).
    3. Parses files into AST symbols and code chunks via Tree-sitter.
    4. Safely prunes existing repository nodes (if clear_existing=True) to avoid stale data.
    5. Ingests Repository, File, Class, Method, Function, Interface, Import, and CodeChunk nodes.
    6. Creates CONTAINS, DEFINES, IMPORTS, HAS_CHUNK, and reliable CALLS relationships.
    """
    import httpx
    import main

    req_body = body or GraphIndexRequest()
    _t0 = _time.monotonic()
    logger.info("[graph/index] START repo_id=%r max_files=%d clear_existing=%s",
                repo_id, req_body.max_files, req_body.clear_existing)
    allowed_exts = {ext.lower() for ext in req_body.extensions}
    settings = get_settings()
    db = settings.NEO4J_DATABASE

    # Resolve repo & access token
    sess = main._get_session_from_request(request)
    token = sess["access_token"] if sess else None
    logger.info("[graph/index] Resolving repo_id=%r (authenticated=%s)", repo_id, bool(token))
    owner, repo, default_branch = await main._resolve_public_repo(
        repo_id, token, sess
    )
    clean_repo_id = repo_id.strip().lower()
    logger.info("[graph/index] Resolved to %s/%s branch=%s (%.1fs)",
                owner, repo, default_branch, _time.monotonic() - _t0)

    # Fetch git tree
    tree_url = f"{main._GITHUB_PUBLIC_REPO_URL}/{owner}/{repo}/git/trees/{default_branch}"
    req_headers = main._get_github_headers(token)

    try:
        async with httpx.AsyncClient(timeout=20.0) as http:
            resp = await http.get(tree_url, params={"recursive": "1"}, headers=req_headers)
    except httpx.TimeoutException:
        raise HTTPException(status_code=502, detail="GitHub API request timed out")
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Could not reach GitHub API")

    if resp.status_code != 200:
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"Failed to fetch repository tree from GitHub (HTTP {resp.status_code})",
        )

    tree_data = resp.json()
    raw_items = tree_data.get("tree", [])

    # Filter to eligible files
    eligible_paths = []
    for item in raw_items:
        if item.get("type") == "blob":
            p = item.get("path", "")
            ext = "." + p.split(".")[-1].lower() if "." in p else ""
            if ext in allowed_exts:
                eligible_paths.append(p)

    def _select_representative_files(paths: list[str], max_cnt: int) -> list[str]:
        if len(paths) <= max_cnt:
            return paths
        groups: dict[str, list[str]] = {}
        for p in paths:
            parts = p.split("/")
            key = parts[0]
            if key in ("app", "src", "packages") and len(parts) > 1:
                key = f"{key}/{parts[1]}"
            groups.setdefault(key, []).append(p)
        selected: list[str] = []
        group_iters = {k: list(v) for k, v in groups.items()}
        while len(selected) < max_cnt and any(group_iters.values()):
            for k in list(group_iters.keys()):
                if group_iters[k]:
                    selected.append(group_iters[k].pop(0))
                    if len(selected) >= max_cnt:
                        break
        return selected

    target_paths = _select_representative_files(eligible_paths, req_body.max_files)
    logger.info("[graph/index] eligible=%d target=%d files to fetch+parse",
                len(eligible_paths), len(target_paths))
    parsed_results: list[FileParseResult] = []
    file_contents: dict[str, str] = {}
    failed_files: list[dict[str, str]] = []

    for idx, file_path in enumerate(target_paths):
        logger.debug("[graph/index] fetching file %d/%d: %s", idx + 1, len(target_paths), file_path)
        try:
            clean_path, text_content, file_size, language = (
                await main._fetch_repo_file_content(repo_id, file_path, request)
            )
            parse_res = _parse_and_chunk_content(
                content=text_content,
                path=clean_path,
                repo_id=clean_repo_id,
                display_language=language,
            )
            parsed_results.append(parse_res)
            file_contents[clean_path] = text_content
        except Exception as _exc:
            logger.warning("[graph/index] skipping %s: %s", file_path, _exc)
            failed_files.append({"path": file_path, "reason": str(_exc)})
            continue

    logger.info("[graph/index] fetch+parse done: %d/%d files OK, %d failed (%.1fs)",
                len(parsed_results), len(target_paths), len(failed_files), _time.monotonic() - _t0)

    # Ingest into Neo4j
    driver = _get_neo4j_driver(request)
    repo_meta = {
        "repo_id": clean_repo_id,
        "repo_name": repo,
        "full_name": f"{owner}/{repo}",
        "owner": owner,
        "default_branch": default_branch,
    }

    logger.info("[graph/index] Starting Neo4j ingestion for %s/%s", owner, repo)
    try:
        summary = await ingest_repository_graph(
            driver=driver,
            repo_info=repo_meta,
            parsed_files=parsed_results,
            file_contents=file_contents,
            database=db,
            clear_existing=req_body.clear_existing,
        )
    except Exception as exc:
        logger.error("[graph/index] Neo4j ingestion FAILED for %s/%s: %s", owner, repo, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Graph ingestion failed: {exc}")

    # Set accurate failures
    summary.files_failed = len(failed_files)
    summary.failed_files = failed_files
    if summary.files_indexed == 0 and len(target_paths) > 0:
        summary.success = False
        summary.error = f"Failed to index any files ({len(failed_files)} files skipped or failed)"

    logger.info("[graph/index] COMPLETE %s/%s — files=%d (failed=%d) nodes=%d rels=%d total=%.1fs",
                owner, repo, summary.files_indexed, summary.files_failed, summary.nodes_created,
                summary.relationships_created, _time.monotonic() - _t0)

    # Update in-memory registry status if present
    for reg_key in (clean_repo_id, repo_id.strip().lower(), f"{owner}-{repo}".lower(), repo.lower()):
        cached = main._PUBLIC_REPOS.get(reg_key)
        if cached and isinstance(cached, dict):
            cached["state"] = "ready"
            cached["stage"] = "Knowledge graph indexed successfully."
            cached["progress"] = 100
            cached["files_done"] = summary.files_indexed
            cached["symbols_count"] = summary.symbols_indexed
            cached["edges_count"] = summary.relationships_created
            break

    return summary


@graph_router.get("/api/repos/{repo_id:path}/graph/stats", response_model=GraphStatsResponse)
async def api_get_repo_graph_stats(
    repo_id: str,
    request: Request,
):
    """Retrieve detailed Knowledge Graph node and relationship counts for a repository."""
    settings = get_settings()
    db = settings.NEO4J_DATABASE
    driver = _get_neo4j_driver(request)
    return await get_graph_stats(driver, repo_id, database=db)


@graph_router.get("/api/repos/{repo_id:path}/graph", response_model=GraphElementsResponse)
async def api_get_repo_graph_elements(
    repo_id: str,
    request: Request,
    limit: int = Query(200, ge=1, le=1000, description="Max relationships to return"),
):
    """Retrieve graph nodes and edges for visualization and traversal."""
    settings = get_settings()
    db = settings.NEO4J_DATABASE
    driver = _get_neo4j_driver(request)
    return await get_graph_elements(driver, repo_id, limit=limit, database=db)


@graph_router.delete("/api/repos/{repo_id:path}/graph")
async def api_delete_repo_graph(
    repo_id: str,
    request: Request,
):
    """Safely delete all knowledge graph entities belonging strictly to a repository."""
    settings = get_settings()
    db = settings.NEO4J_DATABASE
    driver = _get_neo4j_driver(request)

    deleted_count = await clear_repository_graph(
        driver=driver,
        repo_id=repo_id,
        database=db,
        delete_repo_node=True,
    )
    return {
        "repo_id": repo_id.strip().lower(),
        "deleted_nodes": deleted_count,
        "message": f"Successfully cleared graph entities for repository '{repo_id}'.",
    }

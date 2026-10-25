"""API routes for Neo4j Knowledge Graph construction, indexing, visualization, and semantic queries."""

import asyncio
import logging
import time as _time
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from app.agent import run_agent
from app.bm25_index import build_bm25_index, clear_bm25_index, search_bm25
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
from app.neo4j_queries import (
    query_connection,
    query_graph_search,
    query_impact,
    query_node_detail,
    query_repo_files,
)
from app.routes.parse import _parse_and_chunk_content
from app.vector_store import delete_repo_chunks, upsert_chunks

logger = logging.getLogger(__name__)

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


def _get_qdrant_client(request: Request):
    """Retrieve Qdrant client from app.state or lazy-initialize from settings."""
    client = getattr(request.app.state, "qdrant", None)
    if not client:
        from qdrant_client import AsyncQdrantClient
        settings = get_settings()
        client = AsyncQdrantClient(
            url=settings.QDRANT_URL,
            api_key=settings.QDRANT_API_KEY.get_secret_value(),
        )
        request.app.state.qdrant = client
    return client


# ---------------------------------------------------------------------------
# Graph Indexing
# ---------------------------------------------------------------------------


@graph_router.post("/api/repos/{repo_id:path}/graph/index", response_model=GraphIndexSummary)
async def api_index_repo_graph(
    repo_id: str,
    request: Request,
    body: GraphIndexRequest | None = None,
):
    """Index a repository's code files into the Neo4j Knowledge Graph, Qdrant vector store, and BM25 index.

    1. Fetches repository default branch file tree via GitHub API.
    2. Filters blobs matching target extensions (e.g. .py, .js, .ts, .tsx).
    3. Fetches files concurrently (bounded by semaphore) and parses into AST symbols and code chunks.
    4. Safely prunes existing repository nodes (if clear_existing=True) to avoid stale data.
    5. Ingests Repository, File, Class, Method, Function, Interface, Import, and CodeChunk nodes.
    6. Creates CONTAINS, DEFINES, IMPORTS, HAS_CHUNK, INHERITS, and exact CALLS relationships.
    7. Embeds CodeChunks into Qdrant Cloud and constructs an in-memory/disk-cached BM25 index.
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
            if key in ("app", "src", "packages", "lib") and len(parts) > 1:
                key = f"{key}/{parts[1]}"
            groups.setdefault(key, []).append(p)

        def _group_priority(k: str) -> int:
            k_low = k.lower()
            if any(k_low.startswith(p) for p in ("src", "app", "lib", "packages", "core")):
                return 0
            if "test" in k_low:
                return 2
            if any(k_low.startswith(p) for p in ("example", "docs", "doc", "benchmark", "tutorial", "samples")):
                return 3
            return 1

        selected: list[str] = []
        ordered_keys = sorted(groups.keys(), key=_group_priority)
        group_iters = {k: list(groups[k]) for k in ordered_keys}
        while len(selected) < max_cnt and any(group_iters.values()):
            for k in ordered_keys:
                if group_iters[k]:
                    selected.append(group_iters[k].pop(0))
                    if len(selected) >= max_cnt:
                        break
        return selected

    target_paths = _select_representative_files(eligible_paths, req_body.max_files)
    logger.info("[graph/index] eligible=%d target=%d files to fetch+parse concurrently",
                len(eligible_paths), len(target_paths))

    parsed_results: list[FileParseResult] = []
    file_contents: dict[str, str] = {}
    failed_files: list[dict[str, str]] = []

    # Concurrent fetch bounded by Semaphore(10) to respect rate limits while accelerating index
    sem = asyncio.Semaphore(10)

    async def _fetch_and_parse(file_path: str):
        async with sem:
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
                return ("ok", clean_path, text_content, parse_res)
            except Exception as _exc:
                logger.warning("[graph/index] skipping %s: %s", file_path, _exc)
                return ("err", file_path, str(_exc), None)

    fetch_tasks = [_fetch_and_parse(fp) for fp in target_paths]
    fetch_outcomes = await asyncio.gather(*fetch_tasks)

    for outcome, p1, p2, parse_res in fetch_outcomes:
        if outcome == "ok":
            clean_path = p1
            text_content = p2
            parsed_results.append(parse_res)
            file_contents[clean_path] = text_content
        else:
            failed_files.append({"path": p1, "reason": p2})

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

    # Ingest into Qdrant Vector Store and BM25 Okapi Index
    all_chunks = []
    for pr in parsed_results:
        all_chunks.extend(pr.chunks)

    qdrant_client = _get_qdrant_client(request)
    if qdrant_client and all_chunks:
        try:
            if req_body.clear_existing:
                await delete_repo_chunks(qdrant_client, clean_repo_id)
            await upsert_chunks(qdrant_client, clean_repo_id, all_chunks)
            logger.info("[graph/index] Qdrant indexed %d chunks for %s", len(all_chunks), clean_repo_id)
        except Exception as q_exc:
            logger.warning("[graph/index] Qdrant indexing failed: %s", q_exc)

    if all_chunks:
        try:
            if req_body.clear_existing:
                clear_bm25_index(clean_repo_id)
            build_bm25_index(clean_repo_id, all_chunks)
            logger.info("[graph/index] BM25 indexed %d chunks for %s", len(all_chunks), clean_repo_id)
        except Exception as b_exc:
            logger.warning("[graph/index] BM25 indexing failed: %s", b_exc)

    logger.info("[graph/index] COMPLETE %s/%s — files=%d (failed=%d) nodes=%d rels=%d chunks=%d total=%.1fs",
                owner, repo, summary.files_indexed, summary.files_failed, summary.nodes_created,
                summary.relationships_created, len(all_chunks), _time.monotonic() - _t0)

    # Update in-memory registry status and persist
    for reg_key in (clean_repo_id, repo_id.strip().lower(), f"{owner}-{repo}".lower(), repo.lower(), f"{owner}/{repo}".lower()):
        cached = main._PUBLIC_REPOS.get(reg_key)
        if cached and isinstance(cached, dict):
            cached["state"] = "ready"
            cached["stage"] = "Knowledge graph and vectors indexed successfully."
            cached["progress"] = 100
            cached["files_done"] = summary.files_indexed
            cached["files_total"] = summary.files_indexed
            cached["symbols_count"] = summary.symbols_indexed
            cached["edges_count"] = summary.relationships_created
            cached["file_count"] = summary.files_indexed
            cached["symbol_count"] = summary.symbols_indexed
            cached["edge_count"] = summary.relationships_created
            break

    if hasattr(main, "_save_repos_to_disk"):
        main._save_repos_to_disk()

    return summary


# ---------------------------------------------------------------------------
# Graph Visualizations & Stats
# ---------------------------------------------------------------------------


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
    limit: int = Query(500, ge=1, le=2000, description="Max relationships to return"),
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

    # Clear vectors and BM25 index as well
    qdrant = _get_qdrant_client(request)
    if qdrant:
        try:
            await delete_repo_chunks(qdrant, repo_id)
        except Exception:
            pass
    clear_bm25_index(repo_id)

    return {
        "repo_id": repo_id.strip().lower(),
        "deleted_nodes": deleted_count,
        "message": f"Successfully cleared graph entities for repository '{repo_id}'.",
    }


# ---------------------------------------------------------------------------
# Deep Relational Queries: Node Detail, Connection, Impact, Files
# ---------------------------------------------------------------------------


@graph_router.get("/api/repos/{repo_id:path}/node/{node_id:path}")
async def api_get_node_detail(
    repo_id: str,
    node_id: str,
    request: Request,
):
    """Get detailed metadata, callers, callees, imports, and inheritance for a node."""
    settings = get_settings()
    driver = _get_neo4j_driver(request)
    detail = await query_node_detail(driver, repo_id, node_id, database=settings.NEO4J_DATABASE)
    if not detail:
        raise HTTPException(
            status_code=404,
            detail=f"Node '{node_id}' not found in repository '{repo_id}'.",
        )
    return detail


@graph_router.get("/api/repos/{repo_id:path}/connection")
async def api_get_connection(
    repo_id: str,
    source: str = Query(..., description="Source node id or name"),
    target: str = Query(..., description="Target node id or name"),
    request: Request = None,
):
    """Calculate shortest path connectivity between two symbols or files."""
    settings = get_settings()
    driver = _get_neo4j_driver(request)
    return await query_connection(driver, repo_id, source, target, database=settings.NEO4J_DATABASE)


class ImpactRequestBody(BaseModel):
    targets: list[str]
    depth: int = 3


@graph_router.post("/api/repos/{repo_id:path}/impact")
async def api_get_impact(
    repo_id: str,
    body: ImpactRequestBody,
    request: Request,
):
    """Run blast radius impact analysis for modified target symbols."""
    settings = get_settings()
    driver = _get_neo4j_driver(request)
    return await query_impact(
        driver, repo_id, body.targets, depth=body.depth, database=settings.NEO4J_DATABASE
    )


@graph_router.get("/api/repos/{repo_id:path}/files")
async def api_get_repo_files(
    repo_id: str,
    request: Request,
):
    """List indexed files and their defined symbols from the knowledge graph."""
    settings = get_settings()
    driver = _get_neo4j_driver(request)
    return await query_repo_files(driver, repo_id, database=settings.NEO4J_DATABASE)


# ---------------------------------------------------------------------------
# Search: Combined Graph Symbols + BM25 Chunks
# ---------------------------------------------------------------------------


@graph_router.get("/api/repos/{repo_id:path}/search")
async def api_search_repo(
    repo_id: str,
    q: str = Query(..., description="Search query string"),
    request: Request = None,
):
    """Unified search across symbol names, files, and code chunks."""
    settings = get_settings()
    driver = _get_neo4j_driver(request)

    # Search symbols & files in Neo4j
    graph_matches = await query_graph_search(driver, repo_id, q, limit=15, database=settings.NEO4J_DATABASE)

    # Search code chunks via BM25
    bm25_matches = search_bm25(repo_id, q, limit=15)
    code_matches = [
        {
            "id": c.get("chunk_id", ""),
            "type": "code",
            "name": c.get("symbol_name") or c.get("file_path", ""),
            "file_path": c.get("file_path", ""),
            "line": c.get("start_line", 1),
            "match_snippet": c.get("content", "")[:300],
            "score": c.get("score", 0.0),
        }
        for c in bm25_matches
    ]

    all_matches = graph_matches + code_matches
    return {
        "query": q,
        "matches": all_matches,
        "total": len(all_matches),
    }


# ---------------------------------------------------------------------------
# Q&A Agent with Citations & Verification
# ---------------------------------------------------------------------------


class AskRequestBody(BaseModel):
    question: str


@graph_router.post("/api/repos/{repo_id:path}/ask")
async def api_ask_question(
    repo_id: str,
    body: AskRequestBody,
    request: Request,
):
    """Answer questions about the codebase using Hybrid Graph RAG and citation verification."""
    settings = get_settings()
    driver = _get_neo4j_driver(request)
    qdrant = _get_qdrant_client(request)

    return await run_agent(
        question=body.question,
        repo_id=repo_id,
        qdrant_client=qdrant,
        neo4j_driver=driver,
        database=settings.NEO4J_DATABASE,
    )


# ---------------------------------------------------------------------------
# Retry Indexing
# ---------------------------------------------------------------------------


@graph_router.post("/api/repos/{repo_id:path}/retry")
async def api_retry_repo_indexing(
    repo_id: str,
    request: Request,
):
    """Re-trigger indexing for a repository with a clean slate."""
    req_body = GraphIndexRequest(clear_existing=True, max_files=500)
    return await api_index_repo_graph(repo_id=repo_id, request=request, body=req_body)

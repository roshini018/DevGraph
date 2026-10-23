"""API endpoints for Tree-sitter parsing and semantic code chunking."""

from typing import Any
from fastapi import APIRouter, HTTPException, Query, Request
from app.chunker import chunk_file, extract_symbols
from app.models import (
    BatchParseResponse,
    BatchParseSummary,
    CodeChunk,
    FileParseResult,
    ParsedSymbol,
    ParseFileRequest,
    ParseTreeRequest,
)
from app.parser import (
    get_display_language_name,
    is_parsable_path,
    parse_source,
    resolve_canonical_language,
)

parse_router = APIRouter(tags=["Parsing & Chunking"])


def _parse_and_chunk_content(
    content: str,
    path: str,
    repo_id: str = "",
    display_language: str | None = None,
) -> FileParseResult:
    """Internal helper to parse source code text and generate code chunks."""
    lines_count = len(content.splitlines()) if content else 0
    size_bytes = len(content.encode("utf-8"))

    tree, source_bytes, canonical_lang, has_errors, error_msg = parse_source(
        content, path
    )

    if not canonical_lang:
        # Unsupported language
        lang_name = display_language or "Plain Text"
        return FileParseResult(
            path=path,
            language=lang_name,
            analyzed=False,
            symbols=[],
            chunks=chunk_file(content, [], path, repo_id=repo_id, language=lang_name),
            lines_count=lines_count,
            size_bytes=size_bytes,
            has_syntax_errors=False,
            error_message=error_msg or f"Language for '{path}' is not supported for AST parsing",
        )

    lang_name = display_language or get_display_language_name(canonical_lang)
    symbols = extract_symbols(tree, source_bytes, canonical_lang)
    chunks = chunk_file(content, symbols, path, repo_id=repo_id, language=lang_name)

    return FileParseResult(
        path=path,
        language=lang_name,
        analyzed=True,
        symbols=symbols,
        chunks=chunks,
        lines_count=lines_count,
        size_bytes=size_bytes,
        has_syntax_errors=has_errors,
        error_message=error_msg,
    )


@parse_router.post("/api/parse", response_model=FileParseResult)
async def api_parse_direct(body: ParseFileRequest):
    """Directly parse source code provided in request body without requiring GitHub."""
    if body.content is None:
        raise HTTPException(
            status_code=400,
            detail="Field 'content' must be provided for direct parsing.",
        )
    return _parse_and_chunk_content(
        content=body.content,
        path=body.path,
        repo_id="direct",
    )


@parse_router.get("/api/repos/{repo_id:path}/parse-file", response_model=FileParseResult)
async def api_get_parse_repo_file(
    repo_id: str,
    request: Request,
    path: str = Query(..., description="File path within repository"),
):
    """Fetch a file from GitHub, parse its AST with Tree-sitter, and return symbols & chunks."""
    import main  # Lazy import to avoid circular dependencies

    clean_path, text_content, file_size, language = (
        await main._fetch_repo_file_content(repo_id, path, request)
    )

    return _parse_and_chunk_content(
        content=text_content,
        path=clean_path,
        repo_id=repo_id,
        display_language=language,
    )


@parse_router.post("/api/repos/{repo_id:path}/parse-file", response_model=FileParseResult)
async def api_post_parse_repo_file(
    repo_id: str,
    request: Request,
    body: ParseFileRequest | None = None,
    path: str | None = Query(None, description="Optional file path as query param"),
):
    """Parse a file from a repository with optional provided content or via GitHub fetch."""
    target_path = (body.path if body and body.path else path)
    if not target_path:
        raise HTTPException(
            status_code=400,
            detail="File path must be provided in request body or as a query parameter.",
        )

    # If content was provided directly in request body, use it
    if body and body.content is not None:
        import main
        language = main._detect_language(target_path)
        return _parse_and_chunk_content(
            content=body.content,
            path=target_path,
            repo_id=repo_id,
            display_language=language,
        )

    # Otherwise fetch from GitHub
    import main
    clean_path, text_content, file_size, language = (
        await main._fetch_repo_file_content(repo_id, target_path, request)
    )

    return _parse_and_chunk_content(
        content=text_content,
        path=clean_path,
        repo_id=repo_id,
        display_language=language,
    )


@parse_router.post("/api/repos/{repo_id:path}/parse-tree", response_model=BatchParseResponse)
async def api_parse_repo_tree(
    repo_id: str,
    request: Request,
    body: ParseTreeRequest | None = None,
):
    """Batch-parse eligible code files in a repository default branch tree."""
    import httpx
    import main

    req_body = body or ParseTreeRequest()
    allowed_exts = {ext.lower() for ext in req_body.extensions}

    sess = main._get_session_from_request(request)
    token = sess["access_token"] if sess else None
    owner, repo, default_branch = await main._resolve_public_repo(
        repo_id, token, sess
    )

    tree_url = f"{main._GITHUB_PUBLIC_REPO_URL}/{owner}/{repo}/git/trees/{default_branch}"
    req_headers = {"Accept": "application/vnd.github.v3+json"}
    if token:
        req_headers["Authorization"] = f"token {token}"

    try:
        async with httpx.AsyncClient(timeout=20.0) as http:
            resp = await http.get(
                tree_url,
                params={"recursive": "1"},
                headers=req_headers,
            )
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

    # Filter to blobs matching requested extensions
    eligible_files = []
    for item in raw_items:
        if item.get("type") == "blob":
            p = item.get("path", "")
            ext = "." + p.split(".")[-1].lower() if "." in p else ""
            if ext in allowed_exts:
                eligible_files.append(p)

    target_files = eligible_files[: req_body.max_files]
    results: list[FileParseResult] = []
    skipped = 0

    for file_path in target_files:
        try:
            clean_path, text_content, file_size, language = (
                await main._fetch_repo_file_content(repo_id, file_path, request)
            )
            parse_res = _parse_and_chunk_content(
                content=text_content,
                path=clean_path,
                repo_id=repo_id,
                display_language=language,
            )
            results.append(parse_res)
        except Exception:
            skipped += 1

    total_symbols = sum(len(r.symbols) for r in results)
    total_chunks = sum(len(r.chunks) for r in results)

    summary = BatchParseSummary(
        total_files_in_tree=len(raw_items),
        eligible_files=len(eligible_files),
        parsed_files=len(results),
        skipped_files=skipped + max(0, len(eligible_files) - req_body.max_files),
        total_symbols=total_symbols,
        total_chunks=total_chunks,
    )

    return BatchParseResponse(
        repo_id=repo_id,
        summary=summary,
        results=results,
    )

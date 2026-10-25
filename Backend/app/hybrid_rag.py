"""Hybrid Graph RAG: Dense vector + BM25 keyword search with Reciprocal Rank Fusion and 1-hop Neo4j expansion."""

import logging
from typing import Any

from neo4j import AsyncDriver
from qdrant_client import AsyncQdrantClient

from app.bm25_index import search_bm25
from app.graph import get_candidate_repo_ids
from app.vector_store import search_chunks

logger = logging.getLogger(__name__)


def reciprocal_rank_fusion(
    ranked_lists: list[list[dict[str, Any]]],
    id_key: str = "chunk_id",
    k: int = 60,
) -> list[dict[str, Any]]:
    """Merge multiple ranked result lists using Reciprocal Rank Fusion (RRF).

    Each result list is a ranked sequence of dicts containing at least `id_key`.
    Returns a single merged list sorted by fused RRF score descending.
    The constant k=60 is the standard RRF smoothing parameter.
    """
    scores: dict[str, float] = {}
    items: dict[str, dict[str, Any]] = {}

    for ranked_list in ranked_lists:
        for rank, item in enumerate(ranked_list):
            item_id = item.get(id_key, "")
            if not item_id:
                continue
            rrf_score = 1.0 / (k + rank + 1)
            scores[item_id] = scores.get(item_id, 0.0) + rrf_score
            if item_id not in items:
                items[item_id] = dict(item)

    # Attach fused score and sort
    result = []
    for item_id, fused_score in sorted(scores.items(), key=lambda x: x[1], reverse=True):
        entry = items[item_id]
        entry["rrf_score"] = fused_score
        result.append(entry)

    return result


async def _one_hop_expansion(
    driver: AsyncDriver,
    chunk_ids: list[str],
    repo_id: str,
    database: str | None = None,
) -> list[dict[str, Any]]:
    """Expand retrieved chunks with 1-hop Neo4j graph context (callers, callees, definitions)."""
    repo_ids = get_candidate_repo_ids(repo_id)
    kwargs = {"database": database} if database else {}

    # Extract symbol names and file paths from chunk IDs
    symbols: set[str] = set()
    file_paths: set[str] = set()
    for cid in chunk_ids:
        parts = cid.split(":")
        if len(parts) >= 3:
            file_paths.add(parts[1] if len(parts) > 1 else "")
            # Last part is often the symbol name
            if len(parts) >= 4:
                symbols.add(parts[-1])

    if not symbols:
        return []

    expansion_query = """
    MATCH (n)
    WHERE n.repo_id IN $repo_ids AND n.name IN $symbols
    OPTIONAL MATCH (n)-[:CALLS]->(callee)
    OPTIONAL MATCH (caller)-[:CALLS]->(n)
    OPTIONAL MATCH (n)-[:INHERITS]->(parent)
    WITH n, collect(DISTINCT callee.name) AS callees, collect(DISTINCT caller.name) AS callers, collect(DISTINCT parent.name) AS parents
    RETURN n.id AS id, n.name AS name, n.file_path AS file_path,
           n.signature AS signature, labels(n) AS labels,
           callees, callers, parents
    LIMIT 30
    """

    expanded = []
    try:
        async with driver.session(**kwargs) as session:
            res = await session.run(
                expansion_query,
                {"repo_ids": repo_ids, "symbols": list(symbols)},
            )
            async for rec in res:
                expanded.append({
                    "id": rec["id"],
                    "name": rec["name"],
                    "file_path": rec["file_path"] or "",
                    "signature": rec["signature"] or "",
                    "labels": rec["labels"],
                    "callees": [c for c in rec["callees"] if c],
                    "callers": [c for c in rec["callers"] if c],
                    "parents": [p for p in rec["parents"] if p],
                })
    except Exception as exc:
        logger.warning("1-hop Neo4j expansion failed: %s", exc)

    return expanded


def _build_structured_context(
    fused_chunks: list[dict[str, Any]],
    graph_context: list[dict[str, Any]],
    max_chunks: int = 8,
) -> str:
    """Assemble structured context string from fused retrieval chunks and graph expansion."""
    parts: list[str] = []

    # Primary retrieved chunks
    parts.append("## Retrieved Code Chunks\n")
    for i, chunk in enumerate(fused_chunks[:max_chunks]):
        file_path = chunk.get("file_path", "unknown")
        symbol = chunk.get("symbol_name", "")
        kind = chunk.get("kind", "code")
        start = chunk.get("start_line", "?")
        end = chunk.get("end_line", "?")
        content = chunk.get("content", "")
        score = chunk.get("rrf_score", chunk.get("score", 0))

        header = f"### [{i+1}] {file_path}"
        if symbol:
            header += f" :: {symbol}"
        header += f" ({kind}, L{start}-L{end}, score={score:.4f})"
        parts.append(header)
        parts.append(f"```\n{content[:2000]}\n```\n")

    # Graph expansion context
    if graph_context:
        parts.append("\n## Graph Relationships\n")
        for ctx in graph_context[:10]:
            name = ctx.get("name", "?")
            sig = ctx.get("signature", "")
            callers = ctx.get("callers", [])
            callees = ctx.get("callees", [])
            parents = ctx.get("parents", [])
            line = f"- **{name}**"
            if sig:
                line += f": `{sig}`"
            details = []
            if callers:
                details.append(f"called by: {', '.join(callers[:5])}")
            if callees:
                details.append(f"calls: {', '.join(callees[:5])}")
            if parents:
                details.append(f"inherits: {', '.join(parents[:3])}")
            if details:
                line += f" ({'; '.join(details)})"
            parts.append(line)

    return "\n".join(parts)


async def hybrid_retrieve(
    qdrant_client: AsyncQdrantClient,
    neo4j_driver: AsyncDriver,
    repo_id: str,
    query: str,
    top_k: int = 10,
    database: str | None = None,
) -> dict[str, Any]:
    """Execute full hybrid retrieval pipeline:
    1. Dense vector search via Qdrant
    2. BM25 keyword search
    3. Reciprocal Rank Fusion merge
    4. 1-hop Neo4j graph expansion
    5. Structured context assembly

    Returns dict with keys: context, chunks, graph_context, fused_results
    """
    # Step 1: Dense vector search
    vector_results = await search_chunks(qdrant_client, repo_id, query, limit=top_k)

    # Step 2: BM25 keyword search
    bm25_results = search_bm25(repo_id, query, limit=top_k)

    # Step 3: Reciprocal Rank Fusion
    fused = reciprocal_rank_fusion([vector_results, bm25_results], id_key="chunk_id")

    # Step 4: 1-hop Neo4j graph expansion on top fused chunks
    top_chunk_ids = [c["chunk_id"] for c in fused[:6] if c.get("chunk_id")]
    graph_context: list[dict[str, Any]] = []
    if top_chunk_ids and neo4j_driver:
        graph_context = await _one_hop_expansion(
            neo4j_driver, top_chunk_ids, repo_id, database=database
        )

    # Step 5: Build structured context
    context_text = _build_structured_context(fused, graph_context)

    return {
        "context": context_text,
        "chunks": fused[:top_k],
        "graph_context": graph_context,
        "fused_results": fused,
        "vector_count": len(vector_results),
        "bm25_count": len(bm25_results),
    }

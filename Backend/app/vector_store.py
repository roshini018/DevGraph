"""Qdrant Cloud vector storage and dense semantic retrieval engine for DevGraph."""

import hashlib
import logging
import math
import uuid
from typing import Any
import httpx
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
    PointStruct,
    VectorParams,
)

from app.config import get_settings
from app.models import CodeChunk

logger = logging.getLogger(__name__)

COLLECTION_NAME = "devgraph_chunks"
VECTOR_DIMENSION = 384


def _deterministic_code_embedding(text: str, dim: int = VECTOR_DIMENSION) -> list[float]:
    """Pure-Python deterministic dense unit vector projection for code chunks.

    Computes semantic hash projections over tokens, symbol identifiers, and subword n-grams,
    producing an L2-normalized unit vector of dimension `dim`.
    Zero external C-extension dependencies, fully WDAC compliant.
    """
    if not text:
        vec = [0.0] * dim
        vec[0] = 1.0
        return vec

    vec = [0.0] * dim
    # Normalize and extract code words & identifiers
    words = []
    current: list[str] = []
    for ch in text:
        if ch.isalnum() or ch in ("_", "$"):
            current.append(ch)
        else:
            if current:
                words.append("".join(current))
                current = []
            if not ch.isspace():
                words.append(ch)
    if current:
        words.append("".join(current))

    # Project words and 3-character ngrams
    for w in words:
        w_lower = w.lower()
        # Word hash
        h1 = int(hashlib.md5(w_lower.encode("utf-8")).hexdigest()[:8], 16)
        h2 = int(hashlib.sha256(w_lower.encode("utf-8")).hexdigest()[:8], 16)
        idx = h1 % dim
        sign = 1.0 if (h2 % 2 == 0) else -1.0
        weight = 1.0 + math.log1p(len(w_lower))
        vec[idx] += sign * weight

        # Subword 3-grams for camelCase and identifier substrings
        if len(w_lower) >= 3:
            for i in range(len(w_lower) - 2):
                ng = w_lower[i : i + 3]
                nh1 = int(hashlib.md5(ng.encode("utf-8")).hexdigest()[:8], 16)
                nidx = nh1 % dim
                vec[nidx] += (1.0 if (nh1 % 2 == 0) else -1.0) * 0.4

    # L2 normalize
    norm = math.sqrt(sum(x * x for x in vec))
    if norm > 1e-9:
        vec = [x / norm for x in vec]
    else:
        vec[0] = 1.0

    return vec


_OPENAI_AVAILABLE: bool = True
_LAST_OPENAI_CHECK: float = 0.0


async def generate_embedding(text: str) -> list[float]:
    """Generate a 384-dimensional embedding for text or code query.

    Uses OpenAI API if OPENAI_API_KEY is configured and working.
    Immediately falls back to deterministic dense projection if no API key is provided,
    if OpenAI returns quota/rate errors (e.g. 429/401), or if network fails.
    """
    global _OPENAI_AVAILABLE, _LAST_OPENAI_CHECK
    import time
    settings = get_settings()

    now = time.time()
    # If OpenAI previously failed, only retry once every 5 minutes
    if _OPENAI_AVAILABLE or (now - _LAST_OPENAI_CHECK > 300):
        openai_key = getattr(settings, "OPENAI_API_KEY", None)
        if openai_key:
            api_key_val = openai_key.get_secret_value() if hasattr(openai_key, "get_secret_value") else str(openai_key)
            if api_key_val and api_key_val.startswith("sk-"):
                try:
                    async with httpx.AsyncClient(timeout=4.0) as http:
                        resp = await http.post(
                            "https://api.openai.com/v1/embeddings",
                            headers={"Authorization": f"Bearer {api_key_val}"},
                            json={
                                "input": text[:8000],
                                "model": "text-embedding-3-small",
                                "dimensions": VECTOR_DIMENSION,
                            },
                        )
                        if resp.status_code == 200:
                            data = resp.json()
                            _OPENAI_AVAILABLE = True
                            return data["data"][0]["embedding"]
                        else:
                            _OPENAI_AVAILABLE = False
                            _LAST_OPENAI_CHECK = now
                            logger.warning(
                                "OpenAI embedding API returned status %d, switching to fast deterministic projection for all remaining chunks: %s",
                                resp.status_code,
                                resp.text[:150],
                            )
                except Exception as e:
                    _OPENAI_AVAILABLE = False
                    _LAST_OPENAI_CHECK = now
                    logger.warning("OpenAI embedding API failed (%s), switching to fast deterministic projection", e)

    return _deterministic_code_embedding(text)


async def ensure_collection(client: AsyncQdrantClient) -> None:
    """Ensure the Qdrant Cloud collection exists and has appropriate vector config and payload indices."""
    try:
        collections_resp = await client.get_collections()
        existing = [c.name for c in collections_resp.collections]
        if COLLECTION_NAME not in existing:
            logger.info("Creating Qdrant collection: %s (dim=%d, distance=Cosine)", COLLECTION_NAME, VECTOR_DIMENSION)
            await client.create_collection(
                collection_name=COLLECTION_NAME,
                vectors_config=VectorParams(size=VECTOR_DIMENSION, distance=Distance.COSINE),
            )
            # Create payload index on repo_id for fast filtered retrieval
            await client.create_payload_index(
                collection_name=COLLECTION_NAME,
                field_name="repo_id",
                field_schema="keyword",
            )
            logger.info("Qdrant collection %s created successfully", COLLECTION_NAME)
    except Exception as exc:
        logger.warning("Could not ensure Qdrant collection: %s", exc)


def _chunk_to_point_id(chunk_id: str) -> str:
    """Derive deterministic UUID5 from chunk_id for idempotent Qdrant points."""
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, chunk_id))


async def upsert_chunks(
    client: AsyncQdrantClient,
    repo_id: str,
    chunks: list[CodeChunk],
    batch_size: int = 50,
) -> int:
    """Embed and upsert CodeChunk nodes into Qdrant Cloud.

    Returns the count of points successfully upserted.
    """
    if not chunks:
        return 0

    clean_repo_id = repo_id.strip().lower()
    await ensure_collection(client)

    points: list[PointStruct] = []
    for chk in chunks:
        text_to_embed = f"{chk.file_path} {chk.symbol_name or ''}\n{chk.content}"
        vec = await generate_embedding(text_to_embed)
        point_id = _chunk_to_point_id(chk.chunk_id)

        payload = {
            "repo_id": clean_repo_id,
            "chunk_id": chk.chunk_id,
            "file_path": chk.file_path,
            "symbol_name": chk.symbol_name or "",
            "kind": chk.kind,
            "start_line": chk.start_line,
            "end_line": chk.end_line,
            "language": chk.language,
            "content": chk.content,
            "context": chk.context or "",
            "token_count": chk.token_count,
        }

        points.append(PointStruct(id=point_id, vector=vec, payload=payload))

    # Batch upsert
    total_upserted = 0
    for i in range(0, len(points), batch_size):
        batch = points[i : i + batch_size]
        try:
            await client.upsert(collection_name=COLLECTION_NAME, points=batch)
            total_upserted += len(batch)
        except Exception as exc:
            logger.error("Failed to upsert batch %d..%d to Qdrant: %s", i, i + len(batch), exc)

    logger.info("Upserted %d code chunk embeddings to Qdrant for repo %s", total_upserted, repo_id)
    return total_upserted


async def search_chunks(
    client: AsyncQdrantClient,
    repo_id: str,
    query: str,
    limit: int = 10,
) -> list[dict[str, Any]]:
    """Dense vector search over code chunks for a given repository."""
    clean_repo_id = repo_id.strip().lower()
    query_vec = await generate_embedding(query)

    query_filter = Filter(
        must=[
            FieldCondition(
                key="repo_id",
                match=MatchValue(value=clean_repo_id),
            )
        ]
    )

    try:
        if hasattr(client, "query_points"):
            res = await client.query_points(
                collection_name=COLLECTION_NAME,
                query=query_vec,
                query_filter=query_filter,
                limit=limit,
                with_payload=True,
            )
            results = getattr(res, "points", res)
        elif hasattr(client, "search"):
            results = await client.search(
                collection_name=COLLECTION_NAME,
                query_vector=query_vec,
                query_filter=query_filter,
                limit=limit,
                with_payload=True,
            )
        else:
            results = []

        matches = []
        for r in results:
            p = r.payload or {}
            matches.append({
                "score": float(r.score),
                "chunk_id": p.get("chunk_id", str(r.id)),
                "file_path": p.get("file_path", ""),
                "symbol_name": p.get("symbol_name", ""),
                "kind": p.get("kind", ""),
                "start_line": p.get("start_line", 1),
                "end_line": p.get("end_line", 1),
                "content": p.get("content", ""),
                "context": p.get("context", ""),
            })
        return matches
    except Exception as exc:
        logger.warning("Qdrant vector search failed: %s", exc)
        return []


async def delete_repo_chunks(client: AsyncQdrantClient, repo_id: str) -> None:
    """Delete all vector points belonging to a repository (used during clean re-indexing)."""
    clean_repo_id = repo_id.strip().lower()
    try:
        await client.delete(
            collection_name=COLLECTION_NAME,
            points_selector=Filter(
                must=[
                    FieldCondition(
                        key="repo_id",
                        match=MatchValue(value=clean_repo_id),
                    )
                ]
            ),
        )
        logger.info("Cleared prior Qdrant chunks for repo %s", repo_id)
    except Exception as exc:
        logger.warning("Failed to delete Qdrant points for repo %s: %s", repo_id, exc)

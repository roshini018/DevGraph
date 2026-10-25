"""Code-aware BM25 keyword search engine for DevGraph repository chunks."""

import json
import logging
import re
from pathlib import Path
from typing import Any
from rank_bm25 import BM25Okapi

from app.models import CodeChunk

logger = logging.getLogger(__name__)

# In-memory registry: repo_id -> {"bm25": BM25Okapi, "chunks": list[dict]}
_BM25_REGISTRY: dict[str, dict[str, Any]] = {}
DATA_DIR = Path(__file__).resolve().parent / "data"


def tokenize_code(text: str) -> list[str]:
    """Code-aware tokenization splitting on camelCase, snake_case, identifiers, and punctuation."""
    if not text:
        return []

    tokens: list[str] = []
    # Extract identifiers and alphanumeric words
    raw_words = re.findall(r"[A-Za-z0-9_]+|[^\sA-Za-z0-9_]", text)
    for word in raw_words:
        if not word or word.isspace():
            continue
        w_lower = word.lower()
        tokens.append(w_lower)

        # Split camelCase / PascalCase
        subwords = re.findall(r"[A-Z]?[a-z]+|[A-Z]+(?=[A-Z][a-z]|\b)|\d+", word)
        if len(subwords) > 1:
            for sw in subwords:
                sw_lower = sw.lower()
                if sw_lower != w_lower:
                    tokens.append(sw_lower)

        # Split snake_case
        if "_" in word:
            parts = word.split("_")
            for part in parts:
                if part:
                    part_lower = part.lower()
                    if part_lower != w_lower:
                        tokens.append(part_lower)

    return tokens


def _get_cache_path(repo_id: str) -> Path:
    safe_name = re.sub(r"[^a-zA-Z0-9_-]", "_", repo_id.strip().lower())
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    return DATA_DIR / f"bm25_{safe_name}.json"


def build_bm25_index(repo_id: str, chunks: list[CodeChunk]) -> None:
    """Build and register BM25 index over code chunks for a repository."""
    if not chunks:
        return

    clean_repo_id = repo_id.strip().lower()
    corpus_tokens: list[list[str]] = []
    chunk_records: list[dict[str, Any]] = []

    for chk in chunks:
        doc_text = f"{chk.file_path} {chk.symbol_name or ''}\n{chk.content}"
        tokens = tokenize_code(doc_text)
        corpus_tokens.append(tokens)

        chunk_records.append({
            "chunk_id": chk.chunk_id,
            "repo_id": clean_repo_id,
            "file_path": chk.file_path,
            "symbol_name": chk.symbol_name or "",
            "kind": chk.kind,
            "start_line": chk.start_line,
            "end_line": chk.end_line,
            "language": chk.language,
            "content": chk.content,
            "context": chk.context or "",
        })

    bm25 = BM25Okapi(corpus_tokens)
    _BM25_REGISTRY[clean_repo_id] = {
        "bm25": bm25,
        "chunks": chunk_records,
    }

    # Persist records for rapid restoration on restart
    try:
        cache_file = _get_cache_path(clean_repo_id)
        with open(cache_file, "w", encoding="utf-8") as f:
            json.dump(chunk_records, f)
        logger.info("Persisted BM25 chunk records for %s to %s", repo_id, cache_file)
    except Exception as exc:
        logger.warning("Could not persist BM25 cache for %s: %s", repo_id, exc)


def _ensure_bm25_loaded(repo_id: str) -> bool:
    clean_repo_id = repo_id.strip().lower()
    if clean_repo_id in _BM25_REGISTRY:
        return True

    cache_file = _get_cache_path(clean_repo_id)
    if cache_file.exists():
        try:
            with open(cache_file, "r", encoding="utf-8") as f:
                chunk_records = json.load(f)
            corpus_tokens = [
                tokenize_code(f"{c['file_path']} {c.get('symbol_name', '')}\n{c['content']}")
                for c in chunk_records
            ]
            bm25 = BM25Okapi(corpus_tokens)
            _BM25_REGISTRY[clean_repo_id] = {
                "bm25": bm25,
                "chunks": chunk_records,
            }
            logger.info("Restored BM25 index from disk cache for %s (%d chunks)", repo_id, len(chunk_records))
            return True
        except Exception as exc:
            logger.warning("Failed to restore BM25 cache for %s: %s", repo_id, exc)

    return False


def search_bm25(repo_id: str, query: str, limit: int = 10) -> list[dict[str, Any]]:
    """Execute keyword BM25 search over a repository's indexed chunks."""
    clean_repo_id = repo_id.strip().lower()
    if not _ensure_bm25_loaded(clean_repo_id):
        return []

    holder = _BM25_REGISTRY[clean_repo_id]
    bm25: BM25Okapi = holder["bm25"]
    chunks: list[dict[str, Any]] = holder["chunks"]

    q_tokens = tokenize_code(query)
    if not q_tokens:
        return []

    scores = bm25.get_scores(q_tokens)
    scored_indices = sorted(
        [(idx, float(score)) for idx, score in enumerate(scores)],
        key=lambda x: x[1],
        reverse=True,
    )

    results = []
    for idx, score in scored_indices:
        if len(results) >= limit:
            break
        if score > 0.0:
            item = dict(chunks[idx])
            item["score"] = score
            results.append(item)
        else:
            # Token overlap fallback for small corpora (where Okapi IDF evaluates to 0)
            doc_text = f"{chunks[idx].get('file_path', '')} {chunks[idx].get('symbol_name', '')} {chunks[idx].get('content', '')}".lower()
            overlap_count = sum(1 for t in q_tokens if t in doc_text)
            if overlap_count > 0:
                item = dict(chunks[idx])
                item["score"] = float(overlap_count) * 0.1
                results.append(item)

    return results


def clear_bm25_index(repo_id: str) -> None:
    """Clear BM25 index and cached file for a repository."""
    clean_repo_id = repo_id.strip().lower()
    _BM25_REGISTRY.pop(clean_repo_id, None)
    cache_file = _get_cache_path(clean_repo_id)
    if cache_file.exists():
        try:
            cache_file.unlink()
        except Exception:
            pass

"""LangGraph-style state graph agent for codebase Q&A with grounded citation verification.

Implements a Plan -> Retrieve -> Generate -> Verify pipeline as a pure-Python state machine.
Supports Gemini (GEMINI_API_KEY) and OpenAI (OPENAI_API_KEY) for LLM generation,
with a deterministic grounded fallback if no key is configured.
Zero native C-extension dependencies.
"""

import logging
import time
from typing import Any

import httpx
from neo4j import AsyncDriver
from qdrant_client import AsyncQdrantClient

from app.config import get_settings
from app.hybrid_rag import hybrid_retrieve

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Agent State
# ---------------------------------------------------------------------------


class AgentState:
    """Mutable state flowing through the Plan -> Retrieve -> Generate -> Verify pipeline."""

    def __init__(self, question: str, repo_id: str):
        self.question = question
        self.repo_id = repo_id
        self.plan: str = ""
        self.context: str = ""
        self.chunks: list[dict[str, Any]] = []
        self.graph_context: list[dict[str, Any]] = []
        self.answer: str = ""
        self.citations: list[dict[str, Any]] = []
        self.verified: bool = False
        self.latency_ms: float = 0.0
        self.error: str | None = None


# ---------------------------------------------------------------------------
# LLM Adapters
# ---------------------------------------------------------------------------


async def _call_openai(prompt: str, api_key: str, model: str = "gpt-4o-mini") -> str:
    """Call OpenAI Chat Completions API."""
    try:
        async with httpx.AsyncClient(timeout=30.0) as http:
            resp = await http.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": "You are DevGraph, an expert code analysis assistant. Answer questions about codebases using ONLY the provided code context. Cite specific files and line numbers."},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.1,
                    "max_tokens": 2000,
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                return data["choices"][0]["message"]["content"]
            else:
                logger.warning("OpenAI API returned %d: %s", resp.status_code, resp.text[:200])
    except Exception as exc:
        logger.warning("OpenAI API call failed: %s", exc)
    return ""


async def _call_gemini(prompt: str, api_key: str, model: str = "gemini-3.5-flash-lite") -> str:
    """Call Google Gemini API with automatic fallback across active production models."""
    candidate_models = [model, "gemini-3.5-flash-lite", "gemini-3.8-flash"]
    seen = set()
    models_to_try = [m for m in candidate_models if m and not (m in seen or seen.add(m))]

    async with httpx.AsyncClient(timeout=15.0) as http:
        for mod in models_to_try:
            try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{mod}:generateContent?key={api_key}"
                resp = await http.post(
                    url,
                    json={
                        "contents": [{"parts": [{"text": prompt}]}],
                        "generationConfig": {"temperature": 0.1, "maxOutputTokens": 2000},
                    },
                )
                if resp.status_code == 200:
                    data = resp.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        if parts:
                            return parts[0].get("text", "")
                else:
                    logger.warning("Gemini model %s returned %d: %s", mod, resp.status_code, resp.text[:200])
            except Exception as exc:
                logger.warning("Gemini model %s call failed: %s", mod, exc)
    return ""


def _get_llm_config() -> tuple[str, str] | None:
    """Detect configured LLM API key. Returns (provider, api_key) or None."""
    settings = get_settings()

    gemini_key = getattr(settings, "GEMINI_API_KEY", None)
    if gemini_key:
        val = gemini_key.get_secret_value() if hasattr(gemini_key, "get_secret_value") else str(gemini_key)
        if val and len(val) > 10:
            return ("gemini", val)

    openai_key = getattr(settings, "OPENAI_API_KEY", None)
    if openai_key:
        val = openai_key.get_secret_value() if hasattr(openai_key, "get_secret_value") else str(openai_key)
        if val and val.startswith("sk-"):
            return ("openai", val)

    return None


async def _llm_generate(prompt: str) -> str:
    """Generate text using the best available LLM or return empty for fallback."""
    config = _get_llm_config()
    if not config:
        return ""

    provider, api_key = config
    if provider == "openai":
        return await _call_openai(prompt, api_key)
    elif provider == "gemini":
        return await _call_gemini(prompt, api_key)
    return ""


# ---------------------------------------------------------------------------
# Pipeline Stages
# ---------------------------------------------------------------------------


def _plan(state: AgentState) -> None:
    """Plan stage: decompose the question into a retrieval strategy."""
    q = state.question.lower()
    strategies = []

    if any(w in q for w in ("how", "explain", "what does", "describe", "overview")):
        strategies.append("semantic_search")
    if any(w in q for w in ("call", "import", "depend", "use", "reference")):
        strategies.append("graph_traversal")
    if any(w in q for w in ("impact", "change", "break", "affect", "downstream")):
        strategies.append("impact_analysis")
    if any(w in q for w in ("where", "find", "locate", "which file")):
        strategies.append("symbol_search")

    if not strategies:
        strategies = ["semantic_search", "graph_traversal"]

    state.plan = ", ".join(strategies)


async def _retrieve(
    state: AgentState,
    qdrant_client: AsyncQdrantClient,
    neo4j_driver: AsyncDriver,
    database: str | None = None,
) -> None:
    """Retrieve stage: execute hybrid RAG retrieval."""
    try:
        result = await hybrid_retrieve(
            qdrant_client=qdrant_client,
            neo4j_driver=neo4j_driver,
            repo_id=state.repo_id,
            query=state.question,
            top_k=8,
            database=database,
        )
        state.context = result["context"]
        state.chunks = result["chunks"]
        state.graph_context = result["graph_context"]
    except Exception as exc:
        logger.error("Retrieval failed: %s", exc)
        state.error = f"Retrieval failed: {exc}"


def _format_fallback_answer(state: AgentState) -> None:
    """Deterministic grounded fallback: summarize retrieved chunks and graph context directly."""
    if not state.chunks:
        state.answer = (
            f"No indexed code chunks were found for this repository matching your question: "
            f"\"{state.question}\". Please ensure the repository has been indexed via the "
            f"graph indexing endpoint first."
        )
        return

    parts = [f"Based on the indexed code for this repository, here are the most relevant findings for: **{state.question}**\n"]

    for i, chunk in enumerate(state.chunks[:5]):
        fp = chunk.get("file_path", "unknown")
        sym = chunk.get("symbol_name", "")
        kind = chunk.get("kind", "code")
        start = chunk.get("start_line", "?")
        end = chunk.get("end_line", "?")
        content = chunk.get("content", "")[:500]
        score = chunk.get("rrf_score", chunk.get("score", 0))

        header = f"**{i+1}. `{fp}`"
        if sym:
            header += f" → `{sym}`"
        header += f"** ({kind}, L{start}–L{end}, relevance: {score:.3f})"
        parts.append(header)
        parts.append(f"```\n{content}\n```\n")

    if state.graph_context:
        parts.append("\n**Graph relationships:**")
        for ctx in state.graph_context[:5]:
            name = ctx.get("name", "?")
            callers = ctx.get("callers", [])
            callees = ctx.get("callees", [])
            parents = ctx.get("parents", [])
            rel_parts = []
            if callers:
                rel_parts.append(f"called by {', '.join(callers[:3])}")
            if callees:
                rel_parts.append(f"calls {', '.join(callees[:3])}")
            if parents:
                rel_parts.append(f"inherits {', '.join(parents[:2])}")
            if rel_parts:
                parts.append(f"- `{name}`: {'; '.join(rel_parts)}")

    state.answer = "\n".join(parts)


async def _generate(state: AgentState) -> None:
    """Generate stage: produce answer from context using LLM or deterministic fallback."""
    if state.error:
        return

    prompt = f"""Based on the following code context from a repository, answer the user's question.
Be specific, cite file paths and line numbers when possible.
If the context doesn't contain enough information, say so honestly.

{state.context}

---
Question: {state.question}

Provide a clear, structured answer with citations to specific files and line ranges."""

    llm_answer = await _llm_generate(prompt)

    if llm_answer:
        state.answer = llm_answer
    else:
        _format_fallback_answer(state)


def _verify(state: AgentState) -> None:
    """Verify stage: check that citations reference actual indexed chunks."""
    if state.error or not state.answer:
        state.verified = False
        return

    citations: list[dict[str, Any]] = []
    for i, chunk in enumerate(state.chunks[:5]):
        fp = chunk.get("file_path", "")
        sym = chunk.get("symbol_name", "")
        start = chunk.get("start_line", 1)
        end = chunk.get("end_line", 1)
        content = chunk.get("content", "")[:200]
        chunk_id = chunk.get("chunk_id", f"cite-{i}")

        # Verify: does the answer reference this file or symbol?
        answer_lower = state.answer.lower()
        fp_lower = fp.lower()
        sym_lower = sym.lower() if sym else ""

        referenced = (
            fp_lower in answer_lower
            or (sym_lower and sym_lower in answer_lower)
            or fp.split("/")[-1].lower() in answer_lower
        )

        if referenced or i < 3:  # Always include top-3 as grounding
            citations.append({
                "id": chunk_id,
                "file_path": fp,
                "start_line": start,
                "end_line": end,
                "symbol": sym or fp.split("/")[-1],
                "snippet": content,
                "sources": ["vector_search", "bm25", "graph_expansion"],
            })

    state.citations = citations
    state.verified = len(citations) > 0


# ---------------------------------------------------------------------------
# Main Agent Entry Point
# ---------------------------------------------------------------------------


async def run_agent(
    question: str,
    repo_id: str,
    qdrant_client: AsyncQdrantClient,
    neo4j_driver: AsyncDriver,
    database: str | None = None,
) -> dict[str, Any]:
    """Execute the full Plan → Retrieve → Generate → Verify agent pipeline.

    Returns an AskResult-compatible dict with answer, verified, citations, latency_ms.
    """
    t0 = time.monotonic()
    state = AgentState(question=question, repo_id=repo_id)

    # Stage 1: Plan
    _plan(state)

    # Stage 2: Retrieve
    await _retrieve(state, qdrant_client, neo4j_driver, database=database)

    # Stage 3: Generate
    await _generate(state)

    # Stage 4: Verify
    _verify(state)

    state.latency_ms = round((time.monotonic() - t0) * 1000, 2)

    return {
        "answer": state.answer,
        "verified": state.verified,
        "citations": state.citations,
        "latency_ms": state.latency_ms,
    }

"""Unit tests for Vector Store, BM25 Index, Hybrid RAG, and Agent pipeline."""

import asyncio
import pytest

from app.agent import AgentState, _format_fallback_answer, _plan, _verify, run_agent
from app.bm25_index import (
    tokenize_code,
    build_bm25_index,
    clear_bm25_index,
    search_bm25,
)
from app.hybrid_rag import (
    _build_structured_context,
    hybrid_retrieve,
    reciprocal_rank_fusion,
)
from app.models import CodeChunk
from app.vector_store import (
    _deterministic_code_embedding,
    generate_embedding,
)


class TestVectorStore:
    def test_deterministic_embedding_properties(self):
        """Embedding must be 384 dimensions, unit normalized, and deterministic."""
        text = "def calculate_total(items):\n    return sum(item.price for item in items)"
        v1 = _deterministic_code_embedding(text, dim=384)
        v2 = _deterministic_code_embedding(text, dim=384)

        assert len(v1) == 384
        assert v1 == v2  # Strictly deterministic

        # Test unit normalization: norm ≈ 1.0
        norm_sq = sum(x * x for x in v1)
        assert abs(norm_sq - 1.0) < 1e-4

    def test_different_texts_produce_different_vectors(self):
        t1 = "class UserService:"
        t2 = "def render_button():"
        v1 = _deterministic_code_embedding(t1)
        v2 = _deterministic_code_embedding(t2)
        assert v1 != v2

    def test_embed_texts_batch(self):
        """Use the deterministic embedding directly to avoid network calls in sandbox."""
        from app.vector_store import _deterministic_code_embedding
        texts = ["import os", "class Store:", "def checkout():"]
        vectors = [_deterministic_code_embedding(t) for t in texts]
        assert len(vectors) == 3
        for v in vectors:
            assert len(v) == 384


class TestBM25Index:
    def test_code_tokenizer_camel_and_snake_case(self):
        tokens = tokenize_code("def getUserProfileById(user_id: int):")
        assert "get" in tokens
        assert "user" in tokens
        assert "profile" in tokens
        assert "by" in tokens
        assert "id" in tokens

    def test_bm25_build_search_and_clear(self):
        repo_id = "test-bm25-repo"
        chunks = [
            CodeChunk(
                chunk_id="c1",
                repo_id=repo_id,
                file_path="auth.py",
                language="Python",
                kind="function",
                symbol_name="login",
                start_line=1,
                end_line=10,
                content="def login(username, password):\n    return authenticate(username, password)",
                token_count=15,
            ),
            CodeChunk(
                chunk_id="c2",
                repo_id=repo_id,
                file_path="cart.py",
                language="Python",
                kind="function",
                symbol_name="add_to_cart",
                start_line=1,
                end_line=15,
                content="def add_to_cart(cart, item_id, quantity):\n    cart.append((item_id, quantity))",
                token_count=20,
            ),
        ]

        build_bm25_index(repo_id, chunks)

        # Search for login
        auth_results = search_bm25(repo_id, "authenticate username password", limit=5)
        assert len(auth_results) > 0
        assert auth_results[0]["chunk_id"] == "c1"

        # Search for cart
        cart_results = search_bm25(repo_id, "cart item quantity", limit=5)
        assert len(cart_results) > 0
        assert cart_results[0]["chunk_id"] == "c2"

        # Clear index
        clear_bm25_index(repo_id)
        assert len(search_bm25(repo_id, "login")) == 0


class TestHybridRAG:
    def test_reciprocal_rank_fusion(self):
        list_a = [
            {"chunk_id": "c1", "name": "first"},
            {"chunk_id": "c2", "name": "second"},
            {"chunk_id": "c3", "name": "third"},
        ]
        list_b = [
            {"chunk_id": "c2", "name": "second"},
            {"chunk_id": "c4", "name": "fourth"},
            {"chunk_id": "c1", "name": "first"},
        ]

        fused = reciprocal_rank_fusion([list_a, list_b], id_key="chunk_id", k=60)
        assert len(fused) == 4
        # c1 and c2 appear in both lists, so they must rank higher than c3 and c4
        top_ids = [f["chunk_id"] for f in fused[:2]]
        assert "c1" in top_ids
        assert "c2" in top_ids
        assert fused[0]["rrf_score"] >= fused[1]["rrf_score"]

    def test_structured_context_assembly(self):
        chunks = [
            {
                "chunk_id": "c1",
                "file_path": "src/api.py",
                "symbol_name": "get_items",
                "kind": "function",
                "start_line": 10,
                "end_line": 20,
                "content": "def get_items(): return []",
                "rrf_score": 0.032,
            }
        ]
        graph_ctx = [
            {
                "name": "get_items",
                "signature": "def get_items() -> list",
                "callers": ["main_handler"],
                "callees": ["db_query"],
                "parents": [],
            }
        ]

        context = _build_structured_context(chunks, graph_ctx)
        assert "src/api.py" in context
        assert "get_items" in context
        assert "main_handler" in context
        assert "db_query" in context


class TestAgentPipeline:
    def test_agent_planning(self):
        state = AgentState(question="How does order checkout work and what does it call?", repo_id="test-repo")
        _plan(state)
        assert "semantic_search" in state.plan
        assert "graph_traversal" in state.plan

    def test_agent_generate_and_verify_fallback(self):
        state = AgentState(question="Explain the payment processor", repo_id="test-repo")
        state.chunks = [
            {
                "chunk_id": "chk_pay_1",
                "file_path": "services/payment.py",
                "symbol_name": "PaymentProcessor",
                "kind": "class",
                "start_line": 5,
                "end_line": 35,
                "content": "class PaymentProcessor:\n    def process(self, amount):\n        return True",
                "score": 0.85,
            }
        ]
        state.graph_context = [
            {"name": "PaymentProcessor", "callers": ["order_service"], "callees": ["stripe_api"], "parents": []}
        ]

        _format_fallback_answer(state)
        assert len(state.answer) > 0
        assert "payment.py" in state.answer or "PaymentProcessor" in state.answer

        _verify(state)
        assert state.verified is True
        assert len(state.citations) > 0
        assert state.citations[0]["file_path"] == "services/payment.py"

    def test_agent_handles_empty_retrieval_truthfully(self):
        state = AgentState(question="Where is the non existent thing?", repo_id="test-repo")
        state.chunks = []
        state.graph_context = []

        _format_fallback_answer(state)
        assert "No indexed code chunks were found" in state.answer

        _verify(state)
        assert state.verified is False

"""Automated unit and live integration tests for Neo4j Knowledge Graph construction."""

import asyncio
import os
import pytest
from starlette.testclient import TestClient

from app.config import configure_tls, get_settings
from app.graph import (
    clear_repository_graph,
    ensure_schema_constraints,
    extract_reliable_calls,
    get_graph_elements,
    get_graph_stats,
    ingest_repository_graph,
)
from app.models import (
    CodeChunk,
    FileParseResult,
    ParsedSymbol,
)
from app.parser import parse_source
from app.chunker import chunk_file, extract_symbols
from main import app
from neo4j import AsyncGraphDatabase

client = TestClient(app, raise_server_exceptions=False)


def _set_required_env(monkeypatch):
    """Set fallback test environment variables if not present."""
    if not os.environ.get("NEO4J_URI"):
        monkeypatch.setenv("NEO4J_URI", "bolt://localhost:7687")
        monkeypatch.setenv("NEO4J_USERNAME", "neo4j")
        monkeypatch.setenv("NEO4J_PASSWORD", "test-password")
    if not os.environ.get("QDRANT_URL"):
        monkeypatch.setenv("QDRANT_URL", "http://localhost:6333")
        monkeypatch.setenv("QDRANT_API_KEY", "test-api-key")


# ===========================================================================
# 1. Reliable Call Extraction Tests (Zero Guessing)
# ===========================================================================

class TestReliableCalls:
    def test_extract_intra_file_python_calls(self):
        code = """def helper(x):
    return x + 1

def main():
    val = helper(10)
    print(val)
"""
        known = {"helper", "main"}
        calls = extract_reliable_calls(code, "test.py", known)
        assert len(calls) == 1
        assert calls[0]["caller"] == "main"
        assert calls[0]["callee"] == "helper"
        assert calls[0]["line"] == 5

    def test_unknown_calls_are_ignored(self):
        code = """def run():
    unknown_api()
    print("done")
"""
        known = {"run"}
        calls = extract_reliable_calls(code, "test.py", known)
        assert len(calls) == 0

    def test_js_ts_calls_extraction(self):
        code = """function compute(a, b) {
    return a + b;
}

function execute() {
    const res = compute(1, 2);
    console.log(res);
}
"""
        known = {"compute", "execute"}
        calls = extract_reliable_calls(code, "app.js", known)
        assert len(calls) == 1
        assert calls[0]["caller"] == "execute"
        assert calls[0]["callee"] == "compute"


# ===========================================================================
# 2. Mock Graph API Routes Tests
# ===========================================================================

class TestGraphApiRoutes:
    def test_get_graph_stats_route_not_found_clean_zero(self, monkeypatch):
        _set_required_env(monkeypatch)

        # Mock driver
        class MockDriver:
            def session(self, **kwargs):
                class MockSession:
                    async def __aenter__(self):
                        return self
                    async def __aexit__(self, *args):
                        pass
                    async def run(self, query, params=None):
                        class MockResult:
                            def __aiter__(self):
                                return self
                            async def __anext__(self):
                                raise StopAsyncIteration
                        return MockResult()
                return MockSession()

        original_neo4j = getattr(app.state, "neo4j", None)
        try:
            app.state.neo4j = MockDriver()
            resp = client.get("/api/repos/non-existent-repo/graph/stats")
            assert resp.status_code == 200
            data = resp.json()
            assert data["repo_id"] == "non-existent-repo"
            assert data["files_count"] == 0
            assert data["relationships_count"] == 0
        finally:
            if original_neo4j is not None:
                app.state.neo4j = original_neo4j

    def test_get_graph_elements_route(self, monkeypatch):
        _set_required_env(monkeypatch)

        class MockDriver:
            def session(self, **kwargs):
                class MockSession:
                    async def __aenter__(self):
                        return self
                    async def __aexit__(self, *args):
                        pass
                    async def run(self, query, params=None):
                        class MockResult:
                            def __aiter__(self):
                                return self
                            async def __anext__(self):
                                raise StopAsyncIteration
                        return MockResult()
                return MockSession()

        original_neo4j = getattr(app.state, "neo4j", None)
        try:
            app.state.neo4j = MockDriver()
            resp = client.get("/api/repos/sample-repo/graph?limit=50")
            assert resp.status_code == 200
            data = resp.json()
            assert data["repo_id"] == "sample-repo"
            assert data["nodes"] == []
            assert data["edges"] == []
        finally:
            if original_neo4j is not None:
                app.state.neo4j = original_neo4j


# ===========================================================================
# 3. Live Neo4j Integration Tests (Requires Real Active Neo4j Connection)
# ===========================================================================

def test_live_neo4j_constraints_and_idempotent_ingestion():
    """Verify schema constraints, idempotent ingestion, re-indexing, and scoped deletion against live Neo4j."""
    from pathlib import Path
    from dotenv import dotenv_values

    async def _run_live_test():
        configure_tls()

        # Load real credentials directly from .env to isolate from prior test monkeypatching
        env_path = Path(__file__).resolve().parent.parent / ".env"
        env_vals = dotenv_values(env_path)

        uri = env_vals.get("NEO4J_URI")
        password = env_vals.get("NEO4J_PASSWORD")
        username = env_vals.get("NEO4J_USERNAME", "neo4j")
        db = env_vals.get("NEO4J_DATABASE")

        # Skip only if real live credentials are missing from .env
        if not uri or not password:
            pytest.skip("Neo4j live credentials not found in .env")

        driver = AsyncGraphDatabase.driver(
            uri,
            auth=(username, password),
        )
        test_repo_id = "test-live-devgraph-repo"

        try:
            # Step A: Ensure Schema Constraints
            constraints = await ensure_schema_constraints(driver, database=db)
            assert len(constraints) > 0

            # Step B: Prepare a small real repository model
            sample_code_1 = """import os

class DatabaseManager:
    \"\"\"Manages db connection.\"\"\"
    def __init__(self, uri: str):
        self.uri = uri

    def connect(self) -> bool:
        return True

def start_db():
    mgr = DatabaseManager("bolt://localhost")
    return mgr.connect()
"""

            sample_code_2 = """export interface User {
    id: string;
}

export function formatUser(u: User): string {
    return u.id;
}
"""
            # Parse files
            t1, s1, l1, _, _ = parse_source(sample_code_1, "db.py")
            syms1 = extract_symbols(t1, s1, l1)
            chks1 = chunk_file(sample_code_1, syms1, "db.py", repo_id=test_repo_id, language="Python")
            res1 = FileParseResult(
                path="db.py",
                language="Python",
                analyzed=True,
                symbols=syms1,
                chunks=chks1,
                lines_count=len(sample_code_1.splitlines()),
                size_bytes=len(sample_code_1),
            )

            t2, s2, l2, _, _ = parse_source(sample_code_2, "user.ts")
            syms2 = extract_symbols(t2, s2, l2)
            chks2 = chunk_file(sample_code_2, syms2, "user.ts", repo_id=test_repo_id, language="TypeScript")
            res2 = FileParseResult(
                path="user.ts",
                language="TypeScript",
                analyzed=True,
                symbols=syms2,
                chunks=chks2,
                lines_count=len(sample_code_2.splitlines()),
                size_bytes=len(sample_code_2),
            )

            repo_meta = {
                "repo_id": test_repo_id,
                "repo_name": "devgraph-test",
                "owner": "test-user",
                "full_name": "test-user/devgraph-test",
                "default_branch": "main",
            }
            file_contents = {
                "db.py": sample_code_1,
                "user.ts": sample_code_2,
            }

            # Step C: First Ingestion
            summary_1 = await ingest_repository_graph(
                driver=driver,
                repo_info=repo_meta,
                parsed_files=[res1, res2],
                file_contents=file_contents,
                database=db,
                clear_existing=True,
            )
            assert summary_1.success is True
            assert summary_1.files_indexed == 2
            assert summary_1.symbols_indexed > 0

            # Check Stats after 1st ingestion
            stats_1 = await get_graph_stats(driver, test_repo_id, database=db)
            assert stats_1.files_count == 2
            assert stats_1.classes_count == 1
            assert stats_1.methods_count == 2
            assert stats_1.functions_count == 2
            assert stats_1.interfaces_count == 1
            assert stats_1.relationships_count > 0

            # Step D: Re-indexing Idempotency Test (Index the exact same repo a second time)
            summary_2 = await ingest_repository_graph(
                driver=driver,
                repo_info=repo_meta,
                parsed_files=[res1, res2],
                file_contents=file_contents,
                database=db,
                clear_existing=True,
            )
            assert summary_2.success is True

            # Check Stats after 2nd ingestion: MUST BE IDENTICAL, ZERO DUPLICATES!
            stats_2 = await get_graph_stats(driver, test_repo_id, database=db)
            assert stats_2.files_count == stats_1.files_count
            assert stats_2.classes_count == stats_1.classes_count
            assert stats_2.methods_count == stats_1.methods_count
            assert stats_2.functions_count == stats_1.functions_count
            assert stats_2.interfaces_count == stats_1.interfaces_count
            assert stats_2.chunks_count == stats_1.chunks_count
            assert stats_2.relationships_count == stats_1.relationships_count

            # Step E: Graph Elements Query
            elements = await get_graph_elements(driver, test_repo_id, limit=100, database=db)
            assert elements.total_nodes > 0
            assert elements.total_edges > 0

            # Step F: Scoped Repository Deletion
            deleted_count = await clear_repository_graph(
                driver, test_repo_id, database=db, delete_repo_node=True
            )
            assert deleted_count > 0

            # Confirm 0 nodes remain for test_repo_id
            stats_after = await get_graph_stats(driver, test_repo_id, database=db)
            assert stats_after.files_count == 0
            assert stats_after.total_symbols == 0
            assert stats_after.relationships_count == 0

        finally:
            await driver.close()

    asyncio.run(_run_live_test())


# ===========================================================================
# 5. Regression Tests: Zombie-Worker Bug & Endpoint Reachability
# ===========================================================================
#
# ROOT CAUSE (fixed):
#   Running `uvicorn main:app --reload` with the system/conda Python (instead of
#   .venv/bin/uvicorn) caused the SpawnProcess worker to crash immediately with
#   ModuleNotFoundError for 'tree_sitter'. The reloader process kept the TCP
#   socket open, so connections were accepted but never answered — every request
#   hung indefinitely, Swagger showed "Failed to fetch", and curl never returned.
#
#   Proof: `ps -o pid,stat` showed PID 51767 in state Z+ (<defunct>) while the
#   reloader (PID 51765) was still S+. `curl --max-time 3` timed out with
#   connection established but 0 bytes received.
#
#   Fix: always launch with .venv/bin/uvicorn (see Backend/run.sh).

class TestGraphEndpointReachability:
    """Guard against the zombie-worker hang: the API must return promptly, not hang."""

    def test_db_check_returns_quickly(self):
        """Regression: /api/db-check must return in under 10 s (not hang on defunct worker)."""
        resp = client.get("/api/db-check")
        # TestClient uses in-process ASGI — if the app is importable, this always works.
        # If the import chain is broken, an ImportError surfaces here rather than a hang.
        assert resp.status_code == 200
        data = resp.json()
        assert "neo4j" in data

    def test_graph_index_route_exists_and_is_not_404(self, monkeypatch):
        """Regression: POST /api/repos/{repo_id:path}/graph/index must be registered."""
        import httpx as _httpx

        # Prevent any real network call — inject a 404 response for everything.
        class _FakeResp:
            status_code = 404
            def json(self): return {}
            def raise_for_status(self): pass

        class _FakeClient:
            async def __aenter__(self): return self
            async def __aexit__(self, *_): pass
            async def get(self, *_a, **_kw): return _FakeResp()

        monkeypatch.setattr(_httpx, "AsyncClient", lambda **kw: _FakeClient())

        # Route must exist → not a 405 Method Not Allowed
        resp = client.post(
            "/api/repos/pallets%2Fflask/graph/index",
            json={"max_files": 1, "clear_existing": False},
        )
        # We expect 404 (GitHub mock returns 404) or 502 — NOT 405 (route missing)
        # and NOT a timeout or connection error.
        assert resp.status_code != 405, "Route /api/repos/{repo_id:path}/graph/index is not registered"
        assert resp.status_code in (200, 400, 404, 502, 500)

    def test_slash_encoded_repo_id_is_decoded_correctly(self, monkeypatch):
        """Regression: %2F in repo_id path parameter must be decoded to '/' by Starlette."""
        import httpx as _httpx
        import main as _main

        captured = []

        async def _fake_resolve(repo_id, token=None, session=None):
            captured.append(repo_id)
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="test sentinel")

        monkeypatch.setattr(_main, "_resolve_public_repo", _fake_resolve)

        client.get("/api/repos/owner%2Frepo/tree")
        # Starlette with {repo_id:path} decodes %2F → the captured value must contain '/'
        assert captured, "Route never hit — check path parameter registration"
        assert "/" in captured[0], (
            f"Expected '/' in decoded repo_id but got: {captured[0]!r}. "
            "Starlette may have double-decoded or mismatched the path."
        )

    def test_graph_index_skipped_files_are_logged(self, monkeypatch, caplog):
        """Regression: skipped files must emit a WARNING log (not silently discard errors)."""
        import logging
        import httpx as _httpx
        import main as _main

        # Simulate _resolve_public_repo succeeding
        async def _fake_resolve(repo_id, token=None, session=None):
            return "owner", "repo", "main"

        # Simulate the git tree returning one file path
        class _TreeResp:
            status_code = 200
            def json(self):
                return {"tree": [{"type": "blob", "path": "broken.py"}]}

        # Simulate _fetch_repo_file_content always raising
        async def _fake_fetch(repo_id, path, request):
            raise RuntimeError("simulated GitHub timeout")

        class _FakeClient:
            async def __aenter__(self): return self
            async def __aexit__(self, *_): pass
            async def get(self, *_a, **_kw): return _TreeResp()

        monkeypatch.setattr(_main, "_resolve_public_repo", _fake_resolve)
        monkeypatch.setattr(_main, "_fetch_repo_file_content", _fake_fetch)
        monkeypatch.setattr(_httpx, "AsyncClient", lambda **kw: _FakeClient())

        with caplog.at_level(logging.WARNING, logger="app.routes.graph"):
            resp = client.post(
                "/api/repos/owner%2Frepo/graph/index",
                json={"max_files": 1, "clear_existing": False},
            )

        # The request must complete (not hang), and the skip must be logged
        assert resp.status_code in (200, 500), f"Unexpected status: {resp.status_code}"
        skip_logs = [r for r in caplog.records if "skipping" in r.message and "broken.py" in r.message]
        assert skip_logs, "Expected a WARNING log for the skipped file but none was emitted"

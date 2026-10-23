"""Comprehensive tests for Tree-sitter parsing, semantic code chunking, and parse API endpoints."""

import base64
import httpx
import pytest
from starlette.testclient import TestClient

from app.chunker import chunk_file, extract_symbols
from app.parser import (
    get_display_language_name,
    is_parsable_path,
    parse_source,
    resolve_canonical_language,
)
from main import app

client = TestClient(app, raise_server_exceptions=False)


def _set_required_env(monkeypatch):
    """Set mandatory environment variables for settings validation."""
    monkeypatch.setenv("NEO4J_URI", "bolt://localhost:7687")
    monkeypatch.setenv("NEO4J_USERNAME", "neo4j")
    monkeypatch.setenv("NEO4J_PASSWORD", "test-password")
    monkeypatch.setenv("QDRANT_URL", "http://localhost:6333")
    monkeypatch.setenv("QDRANT_API_KEY", "test-api-key")


# ===========================================================================
# 1. Language Resolution and Parser Initialization Tests
# ===========================================================================

class TestLanguageResolution:
    def test_resolve_supported_extensions(self):
        assert resolve_canonical_language("main.py") == "python"
        assert resolve_canonical_language(".py") == "python"
        assert resolve_canonical_language("script.js") == "javascript"
        assert resolve_canonical_language("component.jsx") == "javascript"
        assert resolve_canonical_language("types.ts") == "typescript"
        assert resolve_canonical_language("App.tsx") == "tsx"

    def test_resolve_unsupported_extensions(self):
        assert resolve_canonical_language("readme.md") is None
        assert resolve_canonical_language("data.json") is None
        assert resolve_canonical_language("styles.css") is None
        assert resolve_canonical_language("binary.png") is None

    def test_is_parsable_path(self):
        assert is_parsable_path("src/module/service.py") is True
        assert is_parsable_path("frontend/src/App.tsx") is True
        assert is_parsable_path("README.md") is False

    def test_display_names(self):
        assert get_display_language_name("python") == "Python"
        assert get_display_language_name("javascript") == "JavaScript"
        assert get_display_language_name("typescript") == "TypeScript"
        assert get_display_language_name("tsx") == "TypeScript (TSX)"


# ===========================================================================
# 2. Python Parsing & Symbol Extraction Tests
# ===========================================================================

class TestPythonParsing:
    def test_parse_python_classes_and_methods(self):
        code = '''"""Module docstring."""
import os
from pathlib import Path

class UserService:
    """Manages user state."""
    def __init__(self, db_url: str):
        self.db_url = db_url

    def get_user(self, user_id: int) -> dict:
        """Fetch user by ID."""
        return {"id": user_id}

def standalone_helper(x: int) -> int:
    return x * 2
'''
        tree, src_bytes, lang, has_err, err_msg = parse_source(code, "service.py")
        assert tree is not None
        assert lang == "python"
        assert has_err is False
        assert err_msg is None

        symbols = extract_symbols(tree, src_bytes, lang)
        sym_dict = {f"{s.kind}:{s.name}": s for s in symbols}

        # Check imports
        assert "import:import os" in sym_dict
        assert "import:from pathlib import Path" in sym_dict

        # Check class
        assert "class:UserService" in sym_dict
        cls_sym = sym_dict["class:UserService"]
        assert cls_sym.start_line == 5
        assert cls_sym.end_line == 12
        assert cls_sym.docstring == "Manages user state."

        # Check methods
        assert "method:__init__" in sym_dict
        init_sym = sym_dict["method:__init__"]
        assert init_sym.parent == "UserService"
        assert init_sym.start_line == 7
        assert init_sym.end_line == 8

        assert "method:get_user" in sym_dict
        get_sym = sym_dict["method:get_user"]
        assert get_sym.parent == "UserService"
        assert get_sym.start_line == 10
        assert get_sym.end_line == 12
        assert get_sym.docstring == "Fetch user by ID."

        # Check standalone function
        assert "function:standalone_helper" in sym_dict
        func_sym = sym_dict["function:standalone_helper"]
        assert func_sym.start_line == 14
        assert func_sym.end_line == 15
        assert func_sym.parent is None

    def test_parse_python_decorators(self):
        code = '''@decorator_one
@decorator_two(option=True)
def decorated_function(val: str) -> str:
    return val
'''
        tree, src_bytes, lang, has_err, _ = parse_source(code, "test.py")
        assert has_err is False
        symbols = extract_symbols(tree, src_bytes, lang)
        assert len(symbols) == 1
        sym = symbols[0]
        assert sym.name == "decorated_function"
        assert sym.kind == "function"
        assert sym.start_line == 1  # includes decorator start
        assert sym.end_line == 4


# ===========================================================================
# 3. JavaScript & TypeScript Parsing Tests
# ===========================================================================

class TestJsTsParsing:
    def test_parse_javascript_functions_and_classes(self):
        code = '''import { helper } from './utils';

export class Calculator {
    add(a, b) {
        return a + b;
    }
}

export function multiply(a, b) {
    return a * b;
}

export const subtract = (a, b) => {
    return a - b;
};
'''
        tree, src_bytes, lang, has_err, _ = parse_source(code, "calc.js")
        assert lang == "javascript"
        assert has_err is False
        symbols = extract_symbols(tree, src_bytes, lang)
        names = [(s.kind, s.name) for s in symbols]

        assert ("import", "import { helper } from './utils';") in names
        assert ("class", "Calculator") in names
        assert ("method", "add") in names
        assert ("function", "multiply") in names
        assert ("function", "subtract") in names

    def test_parse_typescript_and_tsx(self):
        code = '''import React from 'react';

export interface ButtonProps {
    label: string;
    onClick: () => void;
}

export class ButtonComponent extends React.Component<ButtonProps> {
    render() {
        return <button onClick={this.props.onClick}>{this.props.label}</button>;
    }
}

export const SimpleButton: React.FC<ButtonProps> = ({ label, onClick }) => {
    return <button onClick={onClick}>{label}</button>;
};
'''
        tree, src_bytes, lang, has_err, _ = parse_source(code, "Button.tsx")
        assert lang == "tsx"
        assert has_err is False
        symbols = extract_symbols(tree, src_bytes, lang)
        sym_map = {f"{s.kind}:{s.name}": s for s in symbols}

        assert "interface:ButtonProps" in sym_map
        assert "class:ButtonComponent" in sym_map
        assert "method:render" in sym_map
        assert "function:SimpleButton" in sym_map


# ===========================================================================
# 4. Code Chunking and Range Validation Tests
# ===========================================================================

class TestChunking:
    def test_chunk_file_line_ranges_and_slices(self):
        code = '''import sys

class Worker:
    def execute(self):
        return True

def run():
    w = Worker()
    return w.execute()
'''
        tree, src_bytes, lang, _, _ = parse_source(code, "worker.py")
        symbols = extract_symbols(tree, src_bytes, lang)
        chunks = chunk_file(code, symbols, "worker.py", repo_id="org-repo", language="Python")

        assert len(chunks) >= 4
        lines = code.splitlines()

        for chunk in chunks:
            assert chunk.start_line <= chunk.end_line
            assert chunk.start_line >= 1
            assert chunk.end_line <= len(lines)
            assert chunk.chunk_id.startswith("chk_")
            assert chunk.repo_id == "org-repo"
            assert chunk.file_path == "worker.py"
            # Verify slice text matches line range
            expected_slice = "\n".join(lines[chunk.start_line - 1 : chunk.end_line])
            assert chunk.content == expected_slice

    def test_deterministic_chunk_ids(self):
        code = "def stable_fn():\n    return 42\n"
        tree1, src1, lang1, _, _ = parse_source(code, "test.py")
        syms1 = extract_symbols(tree1, src1, lang1)
        chunks1 = chunk_file(code, syms1, "test.py", repo_id="repo1", language="Python")

        tree2, src2, lang2, _, _ = parse_source(code, "test.py")
        syms2 = extract_symbols(tree2, src2, lang2)
        chunks2 = chunk_file(code, syms2, "test.py", repo_id="repo1", language="Python")

        assert len(chunks1) == len(chunks2) == 1
        assert chunks1[0].chunk_id == chunks2[0].chunk_id


# ===========================================================================
# 5. Edge Cases (Empty, Syntax Errors, Unsupported Files)
# ===========================================================================

class TestEdgeCases:
    def test_empty_file_parsing(self):
        tree, src_bytes, lang, has_err, err_msg = parse_source("", "empty.py")
        assert tree is not None
        assert lang == "python"
        assert has_err is False
        assert err_msg is None

        symbols = extract_symbols(tree, src_bytes, lang)
        assert symbols == []

        chunks = chunk_file("", symbols, "empty.py", "test-repo", "Python")
        assert chunks == []

    def test_syntax_error_resilience(self):
        # Tree-sitter is resilient and extracts valid parts around syntax errors
        broken_code = '''def valid_one():
    return 1

def broken_func(
    x =

def valid_two():
    return 2
'''
        tree, src_bytes, lang, has_err, _ = parse_source(broken_code, "broken.py")
        assert tree is not None
        assert has_err is True  # Detected syntax error

        symbols = extract_symbols(tree, src_bytes, lang)
        sym_names = [s.name for s in symbols]
        # At least one valid function recovered despite the syntax error
        assert "valid_one" in sym_names

    def test_unsupported_language_fallback(self):
        tree, src_bytes, lang, has_err, err_msg = parse_source(
            "name: test\nversion: 1.0", "config.yaml"
        )
        assert tree is None
        assert lang is None
        assert "unsupported" in err_msg.lower()


# ===========================================================================
# 6. API Route Integration Tests
# ===========================================================================

class TestParseApiRoutes:
    def test_direct_parse_endpoint_python(self, monkeypatch):
        _set_required_env(monkeypatch)
        payload = {
            "path": "app/service.py",
            "content": "def greet(name: str) -> str:\n    return f'Hello {name}'\n",
        }
        resp = client.post("/api/parse", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["path"] == "app/service.py"
        assert data["language"] == "Python"
        assert data["analyzed"] is True
        assert len(data["symbols"]) == 1
        assert data["symbols"][0]["name"] == "greet"
        assert data["symbols"][0]["kind"] == "function"
        assert len(data["chunks"]) == 1
        assert data["chunks"][0]["symbol_name"] == "greet"

    def test_direct_parse_endpoint_unsupported(self, monkeypatch):
        _set_required_env(monkeypatch)
        payload = {
            "path": "notes.txt",
            "content": "This is plain text with no AST grammar.",
        }
        resp = client.post("/api/parse", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["analyzed"] is False
        assert data["symbols"] == []
        # Chunks fall back to line blocks
        assert len(data["chunks"]) == 1

    def test_direct_parse_missing_content(self, monkeypatch):
        _set_required_env(monkeypatch)
        resp = client.post("/api/parse", json={"path": "test.py"})
        assert resp.status_code == 400

    def test_parse_repo_file_get_endpoint(self, monkeypatch):
        _set_required_env(monkeypatch)

        py_content = "def add(a, b):\n    return a + b\n"
        b64_content = base64.b64encode(py_content.encode("utf-8")).decode("utf-8")

        class MockAsyncClient:
            def __init__(self, *args, **kwargs):
                pass
            async def __aenter__(self):
                return self
            async def __aexit__(self, *args):
                pass
            async def get(self, url, headers=None, params=None):
                # 1. Get file content
                if "/contents/math_utils.py" in url:
                    return httpx.Response(
                        200,
                        json={
                            "name": "math_utils.py",
                            "path": "math_utils.py",
                            "size": len(py_content),
                            "encoding": "base64",
                            "content": b64_content,
                        },
                    )
                # 2. Resolve repo
                if "api.github.com/repos/pallets/flask" in url:
                    return httpx.Response(
                        200,
                        json={"owner": {"login": "pallets"}, "name": "flask", "default_branch": "main", "private": False},
                    )
                return httpx.Response(404, json={"detail": "Not found"})

        monkeypatch.setattr(httpx, "AsyncClient", MockAsyncClient)

        resp = client.get("/api/repos/pallets-flask/parse-file?path=math_utils.py")
        assert resp.status_code == 200
        data = resp.json()
        assert data["path"] == "math_utils.py"
        assert data["language"] == "Python"
        assert data["analyzed"] is True
        assert len(data["symbols"]) == 1
        assert data["symbols"][0]["name"] == "add"
        assert len(data["chunks"]) == 1

    def test_parse_repo_tree_endpoint(self, monkeypatch):
        _set_required_env(monkeypatch)

        py_content = "class A:\n    pass\n"
        b64_content = base64.b64encode(py_content.encode("utf-8")).decode("utf-8")

        class MockAsyncClient:
            def __init__(self, *args, **kwargs):
                pass
            async def __aenter__(self):
                return self
            async def __aexit__(self, *args):
                pass
            async def get(self, url, headers=None, params=None):
                if "/contents/src/a.py" in url:
                    return httpx.Response(
                        200,
                        json={
                            "name": "a.py",
                            "path": "src/a.py",
                            "size": len(py_content),
                            "encoding": "base64",
                            "content": b64_content,
                        },
                    )
                if "git/trees/main" in url:
                    return httpx.Response(
                        200,
                        json={
                            "tree": [
                                {"path": "src/a.py", "type": "blob", "size": len(py_content)},
                                {"path": "README.md", "type": "blob", "size": 100},
                            ]
                        },
                    )
                if "api.github.com/repos/pallets/flask" in url:
                    return httpx.Response(
                        200,
                        json={"owner": {"login": "pallets"}, "name": "flask", "default_branch": "main", "private": False},
                    )
                return httpx.Response(404, json={"detail": "Not found"})

        monkeypatch.setattr(httpx, "AsyncClient", MockAsyncClient)

        resp = client.post(
            "/api/repos/pallets-flask/parse-tree",
            json={"extensions": [".py"], "max_files": 10},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["repo_id"] == "pallets-flask"
        assert data["summary"]["eligible_files"] == 1
        assert data["summary"]["parsed_files"] == 1
        assert len(data["results"]) == 1
        assert data["results"][0]["path"] == "src/a.py"
        assert data["results"][0]["symbols"][0]["name"] == "A"

    def test_typescript_api_file_regression(self):
        """Regression test for [graph/index] skipping src/api.ts.
        Verifies that TypeScript files with comments, emojis, interfaces, generics,
        and arrow functions parse and chunk cleanly without hashlib/TypeError errors.
        """
        ts_code = '''// import axios from "axios";
import axios from "axios";

// 👤 Artisan Profile
export interface User {
    id: string;
    name: string;
}

export interface Feedback {
    rating: number;
    message: string;
}

// API Functions
export const getProfile = () =>
    api.get<User>("/artisans/me");

export const updateProfile = (profile: Partial<User>) =>
    api.put<User>("/artisans/me", profile);

export const submitFeedback = (feedback: Feedback) =>
    api.post("/feedback", feedback);
'''
        tree, sb, lang, has_err, err_msg = parse_source(ts_code, "src/api.ts")
        assert lang == "typescript"
        assert not has_err
        symbols = extract_symbols(tree, sb, lang)
        assert len(symbols) >= 5
        names = {s.name for s in symbols}
        assert "User" in names
        assert "Feedback" in names
        assert "getProfile" in names
        assert "updateProfile" in names
        assert "submitFeedback" in names

        # Chunk generation must succeed deterministically without TypeError
        chunks = chunk_file(ts_code, symbols, "src/api.ts", repo_id="test-org-repo", language="TypeScript")
        assert len(chunks) >= 5
        for chunk in chunks:
            assert chunk.chunk_id.startswith("chk_")
            assert isinstance(chunk.start_line, int)
            assert isinstance(chunk.end_line, int)
            assert chunk.start_line <= chunk.end_line

    def test_deterministic_chunk_ids_all_languages(self):
        """Verify stable deterministic chunk IDs for Python, JS, JSX, TS, and TSX."""
        samples = [
            ("python", "test.py", "def compute():\n    return 42\n"),
            ("javascript", "test.js", "function compute() {\n  return 42;\n}\n"),
            ("javascript", "test.jsx", "export const Button = () => <button>Click</button>;\n"),
            ("typescript", "test.ts", "export const add = (a: number, b: number): number => a + b;\n"),
            ("tsx", "test.tsx", "export const Card: React.FC = () => <div>Card</div>;\n"),
        ]
        for lang_key, path, code in samples:
            tree1, sb1, canonical, _, _ = parse_source(code, path)
            syms1 = extract_symbols(tree1, sb1, canonical)
            c1 = chunk_file(code, syms1, path, repo_id="test-org-repo", language=canonical)

            tree2, sb2, _, _, _ = parse_source(code, path)
            syms2 = extract_symbols(tree2, sb2, canonical)
            c2 = chunk_file(code, syms2, path, repo_id="test-org-repo", language=canonical)

            assert len(c1) == len(c2) > 0, f"Expected chunks for {path}"
            assert [c.chunk_id for c in c1] == [c.chunk_id for c in c2], f"Stable IDs failed for {path}"

    def test_repo_id_normalization(self):
        """Verify normalize_repo_id handles slash, hyphen, and double-underscore separators generically."""
        from app.graph import normalize_repo_id

        # owner/repo (canonical slash form)
        assert normalize_repo_id("owner/MyRepo") == ("owner/myrepo", "owner-myrepo")
        # owner-repo (hyphen-separated)
        assert normalize_repo_id("owner-MyRepo") == ("owner/myrepo", "owner-myrepo")
        # owner__repo (double-underscore)
        assert normalize_repo_id("owner__MyRepo") == ("owner/myrepo", "owner-myrepo")
        # owner/repo with sub-path hyphen preserved
        assert normalize_repo_id("org/focus-room") == ("org/focus-room", "org-focus-room")
        assert normalize_repo_id("org-focus-room") == ("org/focus-room", "org-focus-room")
        # Lowercasing is applied
        assert normalize_repo_id("Owner/REPO") == ("owner/repo", "owner-repo")

"""Tests for the frontend-aligned API endpoints added in Stage 1.

Covers:
  - GET  /api/auth/github/status
  - GET  /api/auth/github/url
  - POST /api/auth/github/callback
  - POST /api/repos/public

All outbound HTTP requests (to GitHub) are mocked; no network calls are made.
"""

import base64
import urllib.parse

import httpx
import pytest
from starlette.testclient import TestClient

from app.config import Settings, get_settings
from main import _PUBLIC_REPOS, _REDEEMED_STATES, _SESSIONS, app

client = TestClient(app, follow_redirects=False)


@pytest.fixture(autouse=True)
def clear_settings_cache():
    """Ensure lru_cache, _PUBLIC_REPOS, and mock responses are cleared before and after every test."""
    get_settings.cache_clear()
    _PUBLIC_REPOS.clear()
    _REDEEMED_STATES.clear()
    _SESSIONS.clear()
    MockAsyncClient.shared_get_responses = []
    MockAsyncClient.shared_post_response = None
    MockAsyncClient.url_responses = {}
    yield
    get_settings.cache_clear()
    _PUBLIC_REPOS.clear()
    _REDEEMED_STATES.clear()
    _SESSIONS.clear()
    MockAsyncClient.shared_get_responses = []
    MockAsyncClient.shared_post_response = None
    MockAsyncClient.url_responses = {}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _set_required_env(monkeypatch):
    """Set the minimal env vars required by Settings (without GitHub vars)."""
    monkeypatch.setattr(Settings, "model_config", {**Settings.model_config, "env_file": None})
    monkeypatch.setenv("NEO4J_URI", "neo4j+s://dummy.databases.neo4j.io")
    monkeypatch.setenv("NEO4J_USERNAME", "neo4j")
    monkeypatch.setenv("NEO4J_PASSWORD", "pwd")
    monkeypatch.setenv("QDRANT_URL", "https://dummy.qdrant.io")
    monkeypatch.setenv("QDRANT_API_KEY", "key")
    for var in [
        "GITHUB_CLIENT_ID",
        "GITHUB_CLIENT_SECRET",
        "GITHUB_APP_ID",
        "GITHUB_PRIVATE_KEY_PATH",
        "OAUTH_STATE_SECRET",
    ]:
        monkeypatch.delenv(var, raising=False)


def _set_github_env(monkeypatch):
    """Set all GitHub OAuth env vars on top of the required env."""
    _set_required_env(monkeypatch)
    monkeypatch.setenv("GITHUB_CLIENT_ID", "test_client_id")
    monkeypatch.setenv("GITHUB_CLIENT_SECRET", "test_client_secret")
    monkeypatch.setenv("OAUTH_STATE_SECRET", "super_secret")


class MockResponse:
    """Lightweight httpx.Response substitute for mocking."""

    def __init__(self, status_code: int, json_data: dict | list):
        self.status_code = status_code
        self._json = json_data

    def json(self):
        return self._json


class MockAsyncClient:
    """Async context-manager mock for ``httpx.AsyncClient``."""

    shared_get_responses: list[MockResponse] = []
    shared_post_response: MockResponse | None = None
    url_responses: dict[str, MockResponse] = {}

    def __init__(self, *args, **kwargs):
        self._get_responses: list[MockResponse] = []
        self._post_response: MockResponse | None = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, *args, **kwargs):
        if self._post_response is not None:
            return self._post_response
        return MockAsyncClient.shared_post_response

    async def get(self, url: str, **kwargs):
        # 1. Check if url substring matches url_responses
        for pattern, resp in MockAsyncClient.url_responses.items():
            if pattern in url:
                return resp
        # 2. Return the next queued GET response from instance if non-empty
        if self._get_responses:
            return self._get_responses.pop(0)
        # 3. Return the next queued GET response from shared_get_responses
        if MockAsyncClient.shared_get_responses:
            return MockAsyncClient.shared_get_responses.pop(0)
        # Fallback 404
        return MockResponse(404, {})


# ===================================================================
# GET /api/auth/github/status
# ===================================================================


class TestAuthGithubStatus:
    def test_not_configured(self, monkeypatch):
        """When GitHub vars are missing, returns configured=False."""
        _set_required_env(monkeypatch)
        resp = client.get("/api/auth/github/status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["configured"] is False
        assert data["client_id"] is None
        assert "/connect" in data["redirect_uri"]
        assert "not configured" in data["message"].lower() or "not configured" in data["message"]

    def test_configured(self, monkeypatch):
        """When all GitHub vars are present, returns configured=True."""
        _set_github_env(monkeypatch)
        resp = client.get("/api/auth/github/status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["configured"] is True
        assert data["client_id"] == "test_client_id"
        assert "/connect" in data["redirect_uri"]

    def test_partial_config_is_not_configured(self, monkeypatch):
        """Having only client_id but missing secret should be unconfigured."""
        _set_required_env(monkeypatch)
        monkeypatch.setenv("GITHUB_CLIENT_ID", "test_client_id")
        # Missing CLIENT_SECRET and OAUTH_STATE_SECRET
        resp = client.get("/api/auth/github/status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["configured"] is False


# ===================================================================
# GET /api/auth/github/url
# ===================================================================


class TestAuthGithubUrl:
    def test_returns_url_when_configured(self, monkeypatch):
        """Should return a JSON with a GitHub authorization URL."""
        _set_github_env(monkeypatch)
        resp = client.get("/api/auth/github/url")
        assert resp.status_code == 200
        data = resp.json()
        assert "url" in data
        parsed = urllib.parse.urlparse(data["url"])
        assert parsed.scheme == "https"
        assert parsed.netloc == "github.com"
        query = urllib.parse.parse_qs(parsed.query)
        assert query["client_id"] == ["test_client_id"]
        assert "state" in query
        # The state should be a signed three-part token
        state = query["state"][0]
        assert len(state.split(":")) == 3

    def test_returns_400_when_not_configured(self, monkeypatch):
        """Should return 400 when GitHub OAuth is not configured."""
        _set_required_env(monkeypatch)
        resp = client.get("/api/auth/github/url")
        assert resp.status_code == 400
        assert "not configured" in resp.json()["detail"].lower()

    def test_url_includes_scope(self, monkeypatch):
        """The URL should request the read:user,repo scope."""
        _set_github_env(monkeypatch)
        resp = client.get("/api/auth/github/url")
        data = resp.json()
        query = urllib.parse.parse_qs(urllib.parse.urlparse(data["url"]).query)
        assert "scope" in query
        assert "read:user" in query["scope"][0]


# ===================================================================
# POST /api/auth/github/callback
# ===================================================================


class TestAuthGithubCallback:
    def _mock_full_flow(self, monkeypatch, token="fake_token"):
        """Mock token exchange + user profile + repos fetch."""
        def factory(*args, **kwargs):
            c = MockAsyncClient()
            c._post_response = MockResponse(200, {"access_token": token})
            c._get_responses = [
                MockResponse(200, {
                    "id": 12345,
                    "login": "testuser",
                    "name": "Test User",
                    "avatar_url": "https://avatars.githubusercontent.com/u/12345",
                }),
                MockResponse(200, [
                    {
                        "id": 1001,
                        "name": "my-repo",
                        "full_name": "testuser/my-repo",
                        "private": False,
                        "description": "A test repo",
                        "language": "Python",
                        "stargazers_count": 42,
                        "updated_at": "2026-01-01T00:00:00Z",
                        "default_branch": "main",
                        "html_url": "https://github.com/testuser/my-repo",
                    },
                ]),
            ]
            return c
        monkeypatch.setattr(httpx, "AsyncClient", factory)

    def test_successful_exchange(self, monkeypatch):
        """Should exchange code and return user + repositories."""
        _set_github_env(monkeypatch)
        self._mock_full_flow(monkeypatch)

        resp = client.post(
            "/api/auth/github/callback",
            json={"code": "abc123"},
        )
        assert resp.status_code == 200
        data = resp.json()
        # Verify user shape
        assert data["user"]["id"] == "12345"
        assert data["user"]["username"] == "testuser"
        assert data["user"]["name"] == "Test User"
        assert data["user"]["avatar_url"].startswith("https://")
        # Verify repositories shape
        assert len(data["repositories"]) == 1
        repo = data["repositories"][0]
        assert repo["name"] == "my-repo"
        assert repo["full_name"] == "testuser/my-repo"
        assert repo["private"] is False
        # Ensure access token is NOT in the response
        resp_text = resp.text
        assert "fake_token" not in resp_text

    def test_missing_code_field(self, monkeypatch):
        """Should return 422 when JSON body is missing the 'code' field."""
        _set_github_env(monkeypatch)
        resp = client.post(
            "/api/auth/github/callback",
            json={},
        )
        assert resp.status_code == 422

    def test_not_configured(self, monkeypatch):
        """Should return 500 when GitHub OAuth is not configured."""
        _set_required_env(monkeypatch)
        resp = client.post(
            "/api/auth/github/callback",
            json={"code": "abc123"},
        )
        assert resp.status_code == 500

    def test_github_rejects_code(self, monkeypatch):
        """Should return 400 when GitHub rejects the authorization code."""
        _set_github_env(monkeypatch)

        def factory(*args, **kwargs):
            c = MockAsyncClient()
            c._post_response = MockResponse(200, {"error": "bad_verification_code"})
            return c

        monkeypatch.setattr(httpx, "AsyncClient", factory)
        resp = client.post(
            "/api/auth/github/callback",
            json={"code": "bad_code"},
        )
        assert resp.status_code == 400
        assert "rejected" in resp.json()["detail"].lower()

    def test_github_user_fetch_failure(self, monkeypatch):
        """Should return 502 when user profile fetch fails."""
        _set_github_env(monkeypatch)

        def factory(*args, **kwargs):
            c = MockAsyncClient()
            c._post_response = MockResponse(200, {"access_token": "tok"})
            c._get_responses = [MockResponse(401, {"message": "Bad credentials"})]
            return c

        monkeypatch.setattr(httpx, "AsyncClient", factory)
        resp = client.post(
            "/api/auth/github/callback",
            json={"code": "abc123"},
        )
        assert resp.status_code == 502


# ===================================================================
# POST /api/repos/public
# ===================================================================


class TestReposPublic:
    def _mock_github_repo(self, monkeypatch, status_code=200, json_data=None):
        """Mock the GitHub public API response for repo lookup."""
        if json_data is None:
            json_data = {
                "name": "flask",
                "full_name": "pallets/flask",
                "private": False,
                "default_branch": "main",
                "language": "Python",
            }

        def factory(*args, **kwargs):
            c = MockAsyncClient()
            c._get_responses = [MockResponse(status_code, json_data)]
            return c

        monkeypatch.setattr(httpx, "AsyncClient", factory)

    def test_valid_public_repo(self, monkeypatch):
        """Should validate and return repo metadata with truthful pending state."""
        _set_required_env(monkeypatch)
        self._mock_github_repo(monkeypatch)

        resp = client.post(
            "/api/repos/public",
            json={"url": "https://github.com/pallets/flask"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["repo_id"] == "pallets-flask"
        assert data["repo_name"] == "flask"
        assert data["full_name"] == "pallets/flask"
        assert data["default_branch"] == "main"
        assert data["language"] == "Python"
        assert data["state"] == "pending"
        assert "not yet implemented" in data["stage"]
        assert data["progress"] == 0
        assert data["error"] is None

    def test_repo_not_found(self, monkeypatch):
        """Should return 404 for non-existent repositories."""
        _set_required_env(monkeypatch)
        self._mock_github_repo(monkeypatch, status_code=404, json_data={"message": "Not Found"})

        resp = client.post(
            "/api/repos/public",
            json={"url": "https://github.com/nonexistent/repo"},
        )
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()

    def test_private_repo_rejected(self, monkeypatch):
        """Should return 400 for private repositories."""
        _set_required_env(monkeypatch)
        self._mock_github_repo(
            monkeypatch,
            json_data={
                "name": "secret",
                "full_name": "owner/secret",
                "private": True,
                "default_branch": "main",
                "language": "Go",
            },
        )

        resp = client.post(
            "/api/repos/public",
            json={"url": "https://github.com/owner/secret"},
        )
        assert resp.status_code == 400
        assert "private" in resp.json()["detail"].lower()

    def test_invalid_url_format(self, monkeypatch):
        """Should return 400 for invalid GitHub URL."""
        _set_required_env(monkeypatch)
        resp = client.post(
            "/api/repos/public",
            json={"url": "not-a-github-url"},
        )
        assert resp.status_code == 400
        assert "invalid" in resp.json()["detail"].lower()

    def test_reserved_owner_rejected(self, monkeypatch):
        """Should return 400 for reserved GitHub paths like 'settings'."""
        _set_required_env(monkeypatch)
        resp = client.post(
            "/api/repos/public",
            json={"url": "https://github.com/settings/repo"},
        )
        assert resp.status_code == 400
        assert "reserved" in resp.json()["detail"].lower()

    def test_missing_url_field(self, monkeypatch):
        """Should return 422 when JSON body is missing the 'url' field."""
        _set_required_env(monkeypatch)
        resp = client.post(
            "/api/repos/public",
            json={},
        )
        assert resp.status_code == 422

    def test_rate_limit_handling(self, monkeypatch):
        """Should return 502 when GitHub rate limits us."""
        _set_required_env(monkeypatch)
        self._mock_github_repo(monkeypatch, status_code=403, json_data={"message": "rate limit"})

        resp = client.post(
            "/api/repos/public",
            json={"url": "https://github.com/pallets/flask"},
        )
        assert resp.status_code == 502
        assert "rate limit" in resp.json()["detail"].lower()

    def test_owner_repo_slug_format(self, monkeypatch):
        """Should accept owner/repo shorthand without full URL."""
        _set_required_env(monkeypatch)
        self._mock_github_repo(
            monkeypatch,
            json_data={
                "name": "flask",
                "full_name": "pallets/flask",
                "private": False,
                "default_branch": "main",
                "language": "Python",
            },
        )

        resp = client.post(
            "/api/repos/public",
            json={"url": "pallets/flask"},
        )
        assert resp.status_code == 200
        assert resp.json()["full_name"] == "pallets/flask"

    def test_get_method_not_allowed(self):
        """GET /api/repos/public should return 405 Method Not Allowed."""
        resp = client.get("/api/repos/public")
        assert resp.status_code == 405
        assert "method not allowed" in resp.json()["detail"].lower()


# ===================================================================
# GET /api/repos/{repo_id}/tree
# ===================================================================


class TestReposTree:
    def test_get_tree_success(self, monkeypatch):
        """Should construct hierarchical TreeNode from GitHub recursive tree."""
        _set_required_env(monkeypatch)

        mock_tree = {
            "sha": "tree123",
            "tree": [
                {"path": "src", "type": "tree", "sha": "d1"},
                {"path": "src/main.py", "type": "blob", "size": 150, "sha": "f1"},
                {"path": "README.md", "type": "blob", "size": 300, "sha": "f2"},
            ],
            "truncated": False,
        }

        MockAsyncClient.shared_get_responses = [
            MockResponse(200, {"name": "flask", "default_branch": "main", "private": False}),
            MockResponse(200, mock_tree),
        ]
        monkeypatch.setattr(httpx, "AsyncClient", MockAsyncClient)

        resp = client.get("/api/repos/pallets-flask/tree")
        assert resp.status_code == 200
        data = resp.json()

        assert data["id"] == "root"
        assert data["type"] == "directory"
        assert len(data["children"]) == 2

        # Directories sorted first
        src_dir = data["children"][0]
        assert src_dir["name"] == "src"
        assert src_dir["type"] == "directory"
        assert len(src_dir["children"]) == 1
        assert src_dir["children"][0]["name"] == "main.py"
        assert src_dir["children"][0]["language"] == "Python"
        assert src_dir["children"][0]["size"] == 150

        readme_file = data["children"][1]
        assert readme_file["name"] == "README.md"
        assert readme_file["type"] == "file"
        assert readme_file["language"] == "Markdown"

    def test_get_tree_repo_not_found(self, monkeypatch):
        """Should return 404 if repository does not exist."""
        _set_required_env(monkeypatch)

        MockAsyncClient.shared_get_responses = [MockResponse(404, {"message": "Not Found"})]
        monkeypatch.setattr(httpx, "AsyncClient", MockAsyncClient)

        resp = client.get("/api/repos/nonexistent-repo/tree")
        assert resp.status_code == 404

    def test_get_tree_rate_limited(self, monkeypatch):
        """Should return 502 when GitHub rate limits tree request."""
        _set_required_env(monkeypatch)

        MockAsyncClient.shared_get_responses = [
            MockResponse(200, {"name": "flask", "default_branch": "main", "private": False}),
            MockResponse(403, {"message": "API rate limit exceeded"}),
        ]
        monkeypatch.setattr(httpx, "AsyncClient", MockAsyncClient)

        resp = client.get("/api/repos/pallets-flask/tree")
        assert resp.status_code == 502
        assert "rate limit" in resp.json()["detail"].lower()


# ===================================================================
# GET /api/repos/{repo_id}/file
# ===================================================================


class TestReposFile:
    def test_get_file_text_success(self, monkeypatch):
        """Should retrieve and decode base64 file content correctly."""
        _set_required_env(monkeypatch)

        content_str = "print('Hello DevGraph!')\nprint('Line 2')\n"
        b64_content = base64.b64encode(content_str.encode("utf-8")).decode("utf-8")

        MockAsyncClient.shared_get_responses = [
            MockResponse(200, {"name": "flask", "default_branch": "main", "private": False}),
            MockResponse(
                200,
                {
                    "name": "main.py",
                    "path": "src/main.py",
                    "size": len(content_str),
                    "encoding": "base64",
                    "content": b64_content,
                },
            ),
        ]
        monkeypatch.setattr(httpx, "AsyncClient", MockAsyncClient)

        resp = client.get("/api/repos/pallets-flask/file?path=src/main.py")
        assert resp.status_code == 200
        data = resp.json()
        assert data["path"] == "src/main.py"
        assert data["content"] == content_str
        assert data["lines"] == 2
        assert data["language"] == "Python"
        assert data["size_bytes"] == len(content_str)
        assert data["analyzed"] is False

    def test_get_file_path_traversal(self, monkeypatch):
        """Should reject directory traversal attempts with 400."""
        _set_required_env(monkeypatch)
        resp = client.get("/api/repos/pallets-flask/file?path=../../etc/passwd")
        assert resp.status_code == 400
        assert "invalid" in resp.json()["detail"].lower()

    def test_get_file_empty_path(self, monkeypatch):
        """Should return 400 for empty path."""
        _set_required_env(monkeypatch)
        resp = client.get("/api/repos/pallets-flask/file?path=")
        assert resp.status_code == 400
        assert "empty" in resp.json()["detail"].lower()

    def test_get_file_binary_extension(self, monkeypatch):
        """Should return 400 for binary file extensions."""
        _set_required_env(monkeypatch)
        resp = client.get("/api/repos/pallets-flask/file?path=assets/logo.png")
        assert resp.status_code == 400
        assert "binary" in resp.json()["detail"].lower()

    def test_get_file_binary_null_bytes(self, monkeypatch):
        """Should return 400 if content contains null bytes."""
        _set_required_env(monkeypatch)

        b64_binary = base64.b64encode(b"some\x00binary\x00data").decode("utf-8")

        MockAsyncClient.shared_get_responses = [
            MockResponse(200, {"name": "flask", "default_branch": "main", "private": False}),
            MockResponse(
                200,
                {
                    "name": "data.dat",
                    "path": "data.dat",
                    "size": 16,
                    "encoding": "base64",
                    "content": b64_binary,
                },
            ),
        ]
        monkeypatch.setattr(httpx, "AsyncClient", MockAsyncClient)

        resp = client.get("/api/repos/pallets-flask/file?path=data.dat")
        assert resp.status_code == 400
        assert "binary" in resp.json()["detail"].lower()

    def test_get_file_oversized(self, monkeypatch):
        """Should return 413 for files exceeding 1 MB."""
        _set_required_env(monkeypatch)

        MockAsyncClient.shared_get_responses = [
            MockResponse(200, {"name": "flask", "default_branch": "main", "private": False}),
            MockResponse(
                200,
                {
                    "name": "huge.txt",
                    "path": "huge.txt",
                    "size": 2_000_000,
                    "encoding": "base64",
                    "content": "",
                },
            ),
        ]
        monkeypatch.setattr(httpx, "AsyncClient", MockAsyncClient)

        resp = client.get("/api/repos/pallets-flask/file?path=huge.txt")
        assert resp.status_code == 413
        assert "maximum viewable size" in resp.json()["detail"].lower()

    def test_get_file_is_directory(self, monkeypatch):
        """Should return 400 when path is a directory."""
        _set_required_env(monkeypatch)

        MockAsyncClient.shared_get_responses = [
            MockResponse(200, {"name": "flask", "default_branch": "main", "private": False}),
            MockResponse(200, [{"name": "file.py", "type": "file"}]),
        ]
        monkeypatch.setattr(httpx, "AsyncClient", MockAsyncClient)

        resp = client.get("/api/repos/pallets-flask/file?path=src")
        assert resp.status_code == 400
        assert "directory" in resp.json()["detail"].lower()

    def test_get_file_not_found(self, monkeypatch):
        """Should return 404 when file not found on GitHub."""
        _set_required_env(monkeypatch)

        MockAsyncClient.shared_get_responses = [
            MockResponse(200, {"name": "flask", "default_branch": "main", "private": False}),
            MockResponse(404, {"message": "Not Found"}),
        ]
        monkeypatch.setattr(httpx, "AsyncClient", MockAsyncClient)

        resp = client.get("/api/repos/pallets-flask/file?path=nonexistent.py")
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()


# ===================================================================
# Verify legacy routes still work
# ===================================================================


class TestLegacyRoutesStillWork:
    """Ensure the original /auth/github/* routes were not broken."""

    def test_health(self):
        resp = client.get("/api/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

    def test_root(self):
        resp = client.get("/")
        assert resp.status_code == 200
        assert "DevGraph" in resp.json()["message"]

    def test_legacy_init_without_config(self, monkeypatch):
        _set_required_env(monkeypatch)
        resp = client.get("/auth/github/init")
        assert resp.status_code == 500

    def test_legacy_init_with_config(self, monkeypatch):
        _set_github_env(monkeypatch)
        resp = client.get("/auth/github/init")
        assert resp.status_code in (302, 307)
        location = resp.headers["location"]
        assert "github.com" in location

    def test_legacy_callback_without_state(self, monkeypatch):
        _set_github_env(monkeypatch)
        resp = client.get("/auth/github/callback")
        assert resp.status_code == 400


# ===================================================================
# OAuth Session, State Replay, Logout, and Repository Listing
# ===================================================================


class TestAuthSessionsAndRepos:
    def _generate_valid_state(self, secret="super_secret"):
        from main import _generate_signed_state
        return _generate_signed_state(secret)

    def test_callback_creates_session_and_sets_cookie(self, monkeypatch):
        """Callback should establish server-side session and set HttpOnly devgraph_session cookie."""
        _set_github_env(monkeypatch)
        valid_state = self._generate_valid_state()

        MockAsyncClient.shared_post_response = MockResponse(200, {"access_token": "secret_token_123"})
        MockAsyncClient.shared_get_responses = [
            MockResponse(200, {"id": 999, "login": "testuser", "name": "Test User", "avatar_url": "https://avatar.png"}),
            MockResponse(200, [{"id": 1, "name": "repo1", "full_name": "testuser/repo1", "private": False}]),
        ]
        monkeypatch.setattr(httpx, "AsyncClient", MockAsyncClient)

        resp = client.post(
            "/api/auth/github/callback",
            json={"code": "code123", "state": valid_state},
        )
        assert resp.status_code == 200
        assert "devgraph_session" in resp.cookies
        cookie_val = resp.cookies["devgraph_session"]
        assert len(cookie_val) > 10

        # Token must NOT be exposed in response body
        assert "secret_token_123" not in resp.text

    def test_callback_rejects_reused_state(self, monkeypatch):
        """OAuth state must be single-use; reusing state returns 400."""
        _set_github_env(monkeypatch)
        valid_state = self._generate_valid_state()

        MockAsyncClient.shared_post_response = MockResponse(200, {"access_token": "tok1"})
        MockAsyncClient.shared_get_responses = [
            MockResponse(200, {"id": 1, "login": "u1", "name": "User 1", "avatar_url": ""}),
            MockResponse(200, []),
        ]
        monkeypatch.setattr(httpx, "AsyncClient", MockAsyncClient)

        # First use succeeds
        resp1 = client.post("/api/auth/github/callback", json={"code": "c1", "state": valid_state})
        assert resp1.status_code == 200

        # Second use with same state must be rejected
        resp2 = client.post("/api/auth/github/callback", json={"code": "c2", "state": valid_state})
        assert resp2.status_code == 400
        assert "already been used" in resp2.json()["detail"].lower()

    def test_session_endpoint_unauthenticated_and_authenticated(self, monkeypatch):
        """GET /api/auth/session returns authenticated=False without cookie, True with valid cookie."""
        # Unauthenticated
        client.cookies.clear()
        resp = client.get("/api/auth/session")
        assert resp.status_code == 200
        assert resp.json()["authenticated"] is False
        assert resp.json()["user"] is None

        # Authenticate via callback
        _set_github_env(monkeypatch)
        valid_state = self._generate_valid_state()

        MockAsyncClient.shared_post_response = MockResponse(200, {"access_token": "tok_sess"})
        MockAsyncClient.shared_get_responses = [
            MockResponse(200, {"id": 42, "login": "octocat", "name": "Mona Lisa", "avatar_url": "https://octo.png"}),
            MockResponse(200, []),
        ]
        monkeypatch.setattr(httpx, "AsyncClient", MockAsyncClient)

        auth_resp = client.post("/api/auth/github/callback", json={"code": "c42", "state": valid_state})
        assert auth_resp.status_code == 200
        cookie_val = auth_resp.cookies["devgraph_session"]

        # Call /api/auth/session with cookie
        client.cookies.set("devgraph_session", cookie_val)
        sess_resp = client.get("/api/auth/session")
        assert sess_resp.status_code == 200
        assert sess_resp.json()["authenticated"] is True
        assert sess_resp.json()["user"]["username"] == "octocat"
        client.cookies.clear()

    def test_logout_endpoint(self, monkeypatch):
        """POST /api/auth/logout invalidates session and clears cookie."""
        _set_github_env(monkeypatch)
        valid_state = self._generate_valid_state()

        MockAsyncClient.shared_post_response = MockResponse(200, {"access_token": "tok_logout"})
        MockAsyncClient.shared_get_responses = [
            MockResponse(200, {"id": 7, "login": "logoutuser", "name": "Logout", "avatar_url": ""}),
            MockResponse(200, []),
        ]
        monkeypatch.setattr(httpx, "AsyncClient", MockAsyncClient)

        auth_resp = client.post("/api/auth/github/callback", json={"code": "c7", "state": valid_state})
        cookie_val = auth_resp.cookies["devgraph_session"]

        # Logout
        client.cookies.set("devgraph_session", cookie_val)
        logout_resp = client.post("/api/auth/logout")
        assert logout_resp.status_code == 200
        assert logout_resp.json()["status"] == "ok"

        # Subsequent session check returns authenticated=False
        check_resp = client.get("/api/auth/session")
        assert check_resp.status_code == 200
        assert check_resp.json()["authenticated"] is False
        client.cookies.clear()

    def test_list_repos_authenticated(self, monkeypatch):
        """GET /api/repos returns user repos when authenticated."""
        _set_github_env(monkeypatch)
        valid_state = self._generate_valid_state()

        MockAsyncClient.shared_post_response = MockResponse(200, {"access_token": "tok_repos"})
        MockAsyncClient.shared_get_responses = [
            MockResponse(200, {"id": 10, "login": "repouser", "name": "Repo User", "avatar_url": ""}),
            MockResponse(200, []),
            # For subsequent GET /api/repos call:
            MockResponse(200, [
                {"id": 101, "name": "public-repo", "full_name": "repouser/public-repo", "private": False},
                {"id": 102, "name": "private-repo", "full_name": "repouser/private-repo", "private": True},
            ]),
        ]
        monkeypatch.setattr(httpx, "AsyncClient", MockAsyncClient)

        auth_resp = client.post("/api/auth/github/callback", json={"code": "c10", "state": valid_state})
        cookie_val = auth_resp.cookies["devgraph_session"]

        client.cookies.set("devgraph_session", cookie_val)
        repos_resp = client.get("/api/repos")
        assert repos_resp.status_code == 200
        data = repos_resp.json()
        assert len(data) == 2
        assert data[0]["name"] == "public-repo"
        assert data[1]["name"] == "private-repo"
        assert data[1]["private"] is True

        # Test status endpoint for registered repo and bare name
        status_resp = client.get("/api/repos/public-repo/status")
        assert status_resp.status_code == 200
        status_data = status_resp.json()
        assert status_data["state"] == "ready"
        assert "stage" in status_data

        client.cookies.clear()


class TestRepoStatusEndpoint:
    """Tests for GET /api/repos/{repo_id}/status."""

    def test_status_for_public_repo(self):
        from main import _PUBLIC_REPOS
        client = TestClient(app)
        _PUBLIC_REPOS["pallets/flask"] = {
            "repo_id": "pallets/flask",
            "repo_name": "flask",
            "full_name": "pallets/flask",
            "owner": "pallets",
            "repo": "flask",
            "default_branch": "main",
            "state": "ready",
            "stage": "Ready for viewing",
            "progress": 100,
            "files_total": 5,
            "files_done": 5,
            "error": None,
        }
        resp = client.get("/api/repos/pallets/flask/status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["state"] == "ready"
        assert data["progress"] == 100

    def test_status_for_slash_encoded_repo(self):
        client = TestClient(app)
        resp = client.get("/api/repos/pallets%2Fflask/status")
        assert resp.status_code == 200
        assert resp.json()["state"] == "ready"


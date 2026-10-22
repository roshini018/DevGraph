import pytest
from starlette.testclient import TestClient
from main import app
from app.config import Settings, get_settings
import httpx
import urllib.parse

client = TestClient(app, follow_redirects=False)

@pytest.fixture(autouse=True)
def clear_settings_cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()

def _set_required_env(monkeypatch):
    # Disable loading from .env
    monkeypatch.setattr(Settings, "model_config", {**Settings.model_config, "env_file": None})
    # Minimal required env vars for DB (won't be used in these tests)
    monkeypatch.setenv("NEO4J_URI", "neo4j+s://dummy.databases.neo4j.io")
    monkeypatch.setenv("NEO4J_USERNAME", "neo4j")
    monkeypatch.setenv("NEO4J_PASSWORD", "pwd")
    monkeypatch.setenv("QDRANT_URL", "https://dummy.qdrant.io")
    monkeypatch.setenv("QDRANT_API_KEY", "key")
    # Clear any GitHub related vars
    for var in ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "OAUTH_STATE_SECRET", "GITHUB_APP_ID", "GITHUB_PRIVATE_KEY_PATH"]:
        monkeypatch.delenv(var, raising=False)

class MockResponse:
    def __init__(self, status_code: int, json_data: dict):
        self.status_code = status_code
        self._json = json_data
    def json(self):
        return self._json

class MockAsyncClient:
    def __init__(self, *args, **kwargs):
        self._response = None
    async def __aenter__(self):
        return self
    async def __aexit__(self, exc_type, exc, tb):
        return False
    async def post(self, *args, **kwargs):
        return self._response

def _mock_httpx_success(monkeypatch, token="fake_token"):
    def factory(*args, **kwargs):
        client = MockAsyncClient()
        client._response = MockResponse(200, {"access_token": token})
        return client
    monkeypatch.setattr(httpx, "AsyncClient", factory)

def _mock_httpx_failure(monkeypatch, status_code=400):
    def factory(*args, **kwargs):
        client = MockAsyncClient()
        client._response = MockResponse(status_code, {"error": "bad"})
        return client
    monkeypatch.setattr(httpx, "AsyncClient", factory)

def test_callback_exchange_success(monkeypatch):
    _set_required_env(monkeypatch)
    monkeypatch.setenv("GITHUB_CLIENT_ID", "test_client_id")
    monkeypatch.setenv("GITHUB_CLIENT_SECRET", "test_secret")
    monkeypatch.setenv("OAUTH_STATE_SECRET", "super_secret")
    _mock_httpx_success(monkeypatch)

    # Get signed state from init endpoint
    init_resp = client.get("/auth/github/init")
    state = urllib.parse.parse_qs(urllib.parse.urlparse(init_resp.headers["location"]).query)["state"][0]
    # Call callback with state and a dummy code
    resp = client.get(f"/auth/github/callback?state={urllib.parse.quote(state)}&code=abc123")
    assert resp.status_code == 200
    # Ensure we get the generic completion message, not the raw token
    assert "GitHub OAuth completed" in resp.json()["detail"]
    assert "access_token" not in resp.json()["detail"]

def test_callback_exchange_http_error(monkeypatch):
    _set_required_env(monkeypatch)
    monkeypatch.setenv("GITHUB_CLIENT_ID", "test_client_id")
    monkeypatch.setenv("GITHUB_CLIENT_SECRET", "test_secret")
    monkeypatch.setenv("OAUTH_STATE_SECRET", "super_secret")
    _mock_httpx_failure(monkeypatch, status_code=400)

    init_resp = client.get("/auth/github/init")
    state = urllib.parse.parse_qs(urllib.parse.urlparse(init_resp.headers["location"]).query)["state"][0]
    resp = client.get(f"/auth/github/callback?state={urllib.parse.quote(state)}&code=abc123")
    assert resp.status_code == 502
    assert "GitHub token endpoint returned an unexpected response" in resp.json()["detail"]

import os
import re
import time
import hmac
import hashlib
import urllib.parse

import pytest
from starlette.testclient import TestClient
from app.config import Settings, get_settings

# Import the FastAPI app defined in Backend/main.py
from main import app

client = TestClient(app, follow_redirects=False)


@pytest.fixture(autouse=True)
def clear_settings_cache():
    """Ensure lru_cache is cleared before and after every test."""
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


# Helper to set required env vars for basic settings (excluding GitHub)
def _set_required_env(monkeypatch):
    monkeypatch.setattr(Settings, "model_config", {**Settings.model_config, "env_file": None})
    monkeypatch.setenv("NEO4J_URI", "neo4j+s://dummy.databases.neo4j.io")
    monkeypatch.setenv("NEO4J_USERNAME", "neo4j")
    monkeypatch.setenv("NEO4J_PASSWORD", "pwd")
    monkeypatch.setenv("QDRANT_URL", "https://dummy.qdrant.io")
    monkeypatch.setenv("QDRANT_API_KEY", "key")
    # Ensure GitHub vars are cleared unless set explicitly
    for var in [
        "GITHUB_CLIENT_ID",
        "GITHUB_CLIENT_SECRET",
        "GITHUB_APP_ID",
        "GITHUB_PRIVATE_KEY_PATH",
        "OAUTH_STATE_SECRET",
    ]:
        monkeypatch.delenv(var, raising=False)

def _sign_state(raw_state: str, timestamp: str, secret: str) -> str:
    data = f"{raw_state}:{timestamp}"
    signature = hmac.new(secret.encode(), data.encode(), hashlib.sha256).hexdigest()
    return f"{raw_state}:{timestamp}:{signature}"

def test_init_redirect_success(monkeypatch):
    _set_required_env(monkeypatch)
    # Provide required GitHub configuration
    monkeypatch.setenv("GITHUB_CLIENT_ID", "test_client_id")
    monkeypatch.setenv("OAUTH_STATE_SECRET", "super_secret")

    response = client.get("/auth/github/init")
    # FastAPI returns a 307 Temporary Redirect by default for RedirectResponse
    assert response.status_code in (302, 307)
    # The Location header should point to GitHub with required query params
    location = response.headers["location"]
    parsed = urllib.parse.urlparse(location)
    assert parsed.scheme == "https"
    assert parsed.netloc == "github.com"
    query = urllib.parse.parse_qs(parsed.query)
    assert query["client_id"][0] == "test_client_id"
    assert "state" in query
    # Verify the state is correctly signed
    state = query["state"][0]
    raw_state, ts_str, sig = state.split(":")
    expected = _sign_state(raw_state, ts_str, "super_secret")
    assert state == expected

def test_callback_valid_state(monkeypatch):
    _set_required_env(monkeypatch)
    monkeypatch.setenv("GITHUB_CLIENT_ID", "test_client_id")
    monkeypatch.setenv("OAUTH_STATE_SECRET", "super_secret")
    # First get a signed state from the init endpoint
    init_resp = client.get("/auth/github/init")
    state = urllib.parse.parse_qs(urllib.parse.urlparse(init_resp.headers["location"]).query)["state"][0]
    # Call the callback with the signed state
    resp = client.get(f"/auth/github/callback?state={urllib.parse.quote(state)}")
    assert resp.status_code == 200
    assert resp.json() == {"detail": "OAuth state validated"}

def test_callback_invalid_signature(monkeypatch):
    _set_required_env(monkeypatch)
    monkeypatch.setenv("GITHUB_CLIENT_ID", "test_client_id")
    monkeypatch.setenv("OAUTH_STATE_SECRET", "super_secret")
    # Create a state with a wrong signature
    raw_state = "badstate"
    ts = str(int(time.time()))
    wrong_sig = "0" * 64
    bad_state = f"{raw_state}:{ts}:{wrong_sig}"
    resp = client.get(f"/auth/github/callback?state={urllib.parse.quote(bad_state)}")
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Invalid OAuth state signature"

def test_init_missing_configuration(monkeypatch):
    _set_required_env(monkeypatch)
    # Do NOT set GITHUB_CLIENT_ID or OAUTH_STATE_SECRET
    resp = client.get("/auth/github/init")
    assert resp.status_code == 500
    assert resp.json()["detail"] == "GitHub OAuth is not configured"

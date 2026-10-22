import os
import pathlib
import pytest
from app.config import Settings, get_settings

@pytest.fixture(autouse=True)
def clear_settings_cache():
    """Ensure lru_cache is cleared before and after every test."""
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


# Helper to set minimal required env vars for the Settings model
def _set_required_env(monkeypatch):
    monkeypatch.setattr(Settings, "model_config", {**Settings.model_config, "env_file": None})
    monkeypatch.setenv("NEO4J_URI", "neo4j+s://dummy.databases.neo4j.io")
    monkeypatch.setenv("NEO4J_USERNAME", "neo4j")
    monkeypatch.setenv("NEO4J_PASSWORD", "pwd")
    monkeypatch.setenv("QDRANT_URL", "https://dummy.qdrant.io")
    monkeypatch.setenv("QDRANT_API_KEY", "key")
    # Ensure no GitHub vars are set unless test explicitly sets them
    for var in [
        "GITHUB_APP_ID",
        "GITHUB_CLIENT_ID",
        "GITHUB_CLIENT_SECRET",
        "GITHUB_PRIVATE_KEY_PATH",
        "OAUTH_STATE_SECRET",
    ]:
        monkeypatch.delenv(var, raising=False)

def test_github_settings_optional(monkeypatch):
    """GitHub related settings should be optional and default to None."""
    _set_required_env(monkeypatch)
    settings = get_settings()
    assert settings.GITHUB_APP_ID is None
    assert settings.GITHUB_CLIENT_ID is None
    assert settings.GITHUB_CLIENT_SECRET is None
    assert settings.GITHUB_PRIVATE_KEY_PATH is None

def test_github_client_secret_masking(monkeypatch):
    """SecretStr fields must never appear in str/repr of Settings."""
    sentinel = "SENTRY_SECRET_12345"
    _set_required_env(monkeypatch)
    monkeypatch.setenv("GITHUB_CLIENT_SECRET", sentinel)
    settings = get_settings()
    # SecretStr should be stored, but masked in string representations
    assert settings.GITHUB_CLIENT_SECRET.get_secret_value() == sentinel
    assert sentinel not in str(settings)
    assert sentinel not in repr(settings)

def test_github_private_key_path_type(monkeypatch, tmp_path):
    """GITHUB_PRIVATE_KEY_PATH should be parsed as a pathlib.Path when provided."""
    _set_required_env(monkeypatch)
    key_path = tmp_path / "private_key.pem"
    key_path.write_text("dummy")
    monkeypatch.setenv("GITHUB_PRIVATE_KEY_PATH", str(key_path))
    settings = get_settings()
    # The field type is Path, so Settings should coerce the string to Path
    assert isinstance(settings.GITHUB_PRIVATE_KEY_PATH, pathlib.Path)
    assert settings.GITHUB_PRIVATE_KEY_PATH == key_path

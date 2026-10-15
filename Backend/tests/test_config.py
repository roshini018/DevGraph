import os
from pathlib import Path
import certifi
import pytest
from app.config import Settings, configure_tls, get_settings


@pytest.fixture(autouse=True)
def clear_settings_cache():
    """Ensure lru_cache is cleared before and after every test."""
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_settings_load_from_environment(monkeypatch):
    """Verify that Settings loads correctly from environment variables."""
    monkeypatch.setenv("NEO4J_URI", "neo4j+s://example.databases.neo4j.io")
    monkeypatch.setenv("NEO4J_USERNAME", "neo4j_user")
    monkeypatch.setenv("NEO4J_PASSWORD", "test-neo4j-pwd")
    monkeypatch.setenv("NEO4J_DATABASE", "custom-db")
    monkeypatch.setenv("QDRANT_URL", "https://example.cloud.qdrant.io")
    monkeypatch.setenv("QDRANT_API_KEY", "test-qdrant-key")
    monkeypatch.setenv("ENVIRONMENT", "testing")

    settings = get_settings()

    assert settings.NEO4J_URI == "neo4j+s://example.databases.neo4j.io"
    assert settings.NEO4J_USERNAME == "neo4j_user"
    assert settings.NEO4J_PASSWORD.get_secret_value() == "test-neo4j-pwd"
    assert settings.NEO4J_DATABASE == "custom-db"
    assert settings.QDRANT_URL == "https://example.cloud.qdrant.io"
    assert settings.QDRANT_API_KEY.get_secret_value() == "test-qdrant-key"
    assert settings.ENVIRONMENT == "testing"


def test_missing_variable_gives_names_only_error_without_leaking_secrets(monkeypatch):
    """Verify missing variable raises ValueError with names only and never leaks sentinel secret."""
    sentinel_secret = "SENTINEL_SECRET_XYZ_9999"

    # Provide only some variables, including a secret sentinel, but omit QDRANT_URL and NEO4J_URI
    monkeypatch.setenv("NEO4J_PASSWORD", sentinel_secret)
    monkeypatch.setenv("NEO4J_USERNAME", "neo4j")
    monkeypatch.setenv("QDRANT_API_KEY", "some-api-key")
    monkeypatch.delenv("NEO4J_URI", raising=False)
    monkeypatch.delenv("QDRANT_URL", raising=False)

    # Bypass .env file to test pure missing validation
    monkeypatch.setattr(Settings, "model_config", {**Settings.model_config, "env_file": None})

    with pytest.raises(ValueError) as exc_info:
        get_settings()

    err_str = str(exc_info.value)
    err_repr = repr(exc_info.value)

    assert "Missing or invalid configuration:" in err_str
    assert "NEO4J_URI" in err_str
    assert "QDRANT_URL" in err_str

    # Ensure sentinel secret NEVER appears in error message or repr
    assert sentinel_secret not in err_str
    assert sentinel_secret not in err_repr


def test_secretstr_never_appears_in_str_or_repr(monkeypatch):
    """Verify that SecretStr fields are masked in str() and repr() outputs."""
    sentinel_neo4j = "SENTINEL_NEO4J_SECRET_123"
    sentinel_qdrant = "SENTINEL_QDRANT_SECRET_456"

    monkeypatch.setenv("NEO4J_URI", "neo4j+s://dummy.databases.neo4j.io")
    monkeypatch.setenv("NEO4J_USERNAME", "neo4j")
    monkeypatch.setenv("NEO4J_PASSWORD", sentinel_neo4j)
    monkeypatch.setenv("QDRANT_URL", "https://dummy.qdrant.io")
    monkeypatch.setenv("QDRANT_API_KEY", sentinel_qdrant)

    settings = get_settings()

    # Settings object str and repr
    assert sentinel_neo4j not in str(settings)
    assert sentinel_neo4j not in repr(settings)
    assert sentinel_qdrant not in str(settings)
    assert sentinel_qdrant not in repr(settings)

    # Individual field str and repr
    assert sentinel_neo4j not in str(settings.NEO4J_PASSWORD)
    assert sentinel_neo4j not in repr(settings.NEO4J_PASSWORD)
    assert sentinel_qdrant not in str(settings.QDRANT_API_KEY)
    assert sentinel_qdrant not in repr(settings.QDRANT_API_KEY)

    # Ensure get_secret_value() works
    assert settings.NEO4J_PASSWORD.get_secret_value() == sentinel_neo4j
    assert settings.QDRANT_API_KEY.get_secret_value() == sentinel_qdrant


def test_cors_origins_parsing(monkeypatch):
    """Verify CORS_ORIGINS parses comma-separated strings into lists, or uses default."""
    # Test default
    monkeypatch.setenv("NEO4J_URI", "neo4j+s://dummy.databases.neo4j.io")
    monkeypatch.setenv("NEO4J_USERNAME", "neo4j")
    monkeypatch.setenv("NEO4J_PASSWORD", "pwd")
    monkeypatch.setenv("QDRANT_URL", "https://dummy.qdrant.io")
    monkeypatch.setenv("QDRANT_API_KEY", "key")
    monkeypatch.delenv("CORS_ORIGINS", raising=False)

    settings = get_settings()
    assert settings.CORS_ORIGINS == [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    # Test custom comma-separated string
    get_settings.cache_clear()
    monkeypatch.setenv(
        "CORS_ORIGINS",
        "https://app.devgraph.io, http://localhost:3000 , https://staging.devgraph.io",
    )
    custom_settings = get_settings()
    assert custom_settings.CORS_ORIGINS == [
        "https://app.devgraph.io",
        "http://localhost:3000",
        "https://staging.devgraph.io",
    ]


def test_configure_tls_behavior(monkeypatch, tmp_path):
    """Verify configure_tls sets certifi when unset, respects existing valid path, and replaces missing path."""
    certifi_bundle = certifi.where()

    # Case 1: Unset SSL_CERT_FILE -> sets to certifi.where()
    monkeypatch.delenv("SSL_CERT_FILE", raising=False)
    configure_tls()
    assert os.environ.get("SSL_CERT_FILE") == certifi_bundle

    # Case 2: Points to an existing valid file -> keeps existing valid path
    valid_file = tmp_path / "custom_ca.pem"
    valid_file.write_text("dummy-ca-data")
    monkeypatch.setenv("SSL_CERT_FILE", str(valid_file))
    configure_tls()
    assert os.environ.get("SSL_CERT_FILE") == str(valid_file)

    # Case 3: Points to a non-existent path -> replaces with certifi.where()
    non_existent = tmp_path / "does_not_exist.pem"
    monkeypatch.setenv("SSL_CERT_FILE", str(non_existent))
    configure_tls()
    assert os.environ.get("SSL_CERT_FILE") == certifi_bundle

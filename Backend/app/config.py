from functools import lru_cache
import os
from pathlib import Path
from typing import Any
import certifi
from pydantic import SecretStr, ValidationError, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_FILE_PATH = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    """Centralized application settings validated via Pydantic."""

    model_config = SettingsConfigDict(
        env_file=_ENV_FILE_PATH,
        env_file_encoding="utf-8",
        extra="ignore",
        hide_input_in_errors=True,
    )

    NEO4J_URI: str
    NEO4J_USERNAME: str
    NEO4J_PASSWORD: SecretStr
    NEO4J_DATABASE: str | None = None
    QDRANT_URL: str
    QDRANT_API_KEY: SecretStr
    CORS_ORIGINS: list[str] | str = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    ENVIRONMENT: str = "development"

    # Optional GitHub integration settings (OAuth/App)
    GITHUB_APP_ID: str | None = None
    GITHUB_CLIENT_ID: str | None = None
    GITHUB_CLIENT_SECRET: SecretStr | None = None
    GITHUB_PRIVATE_KEY_PATH: Path | None = None
    # Secret for signing OAuth state tokens (optional but recommended)
    OAUTH_STATE_SECRET: SecretStr | None = None

    # Optional LLM API keys for Q&A Agent and Embeddings
    OPENAI_API_KEY: SecretStr | None = None
    GEMINI_API_KEY: SecretStr | None = None

    @field_validator("CORS_ORIGINS", mode="after")
    @classmethod
    def parse_cors_origins(cls, value: list[str] | str) -> list[str]:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


def configure_tls() -> None:
    """Ensure a valid CA certificate bundle is configured for OpenSSL/Python before

    initializing database drivers. On macOS, standalone Python frameworks do not
    use macOS Keychain CAs by default; setting SSL_CERT_FILE to certifi's bundle
    guarantees secure TLS verification for Neo4j Aura and Qdrant without weakening
    certificate verification.
    """
    existing_cert_file = os.environ.get("SSL_CERT_FILE")
    if not existing_cert_file or not os.path.exists(existing_cert_file):
        os.environ["SSL_CERT_FILE"] = certifi.where()

@lru_cache()
def get_settings() -> Settings:
    """Return cached application settings, validating environment configuration.

    If required variables are missing or invalid, raises ValueError with variable
    names only, preventing sensitive values from appearing in logs or error text.
    """
    try:
        settings = Settings()
    except ValidationError as exc:
        missing_or_invalid = sorted(
            list({str(err["loc"][0]) for err in exc.errors() if err.get("loc")})
        )
        field_names = ", ".join(missing_or_invalid)
        raise ValueError(
            f"Missing or invalid configuration: {field_names}"
        ) from None
    return settings

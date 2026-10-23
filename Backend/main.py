import base64
import os
from contextlib import asynccontextmanager
import re
import secrets, time, hmac, hashlib, urllib.parse
from datetime import datetime, timezone
from pathlib import Path

import httpx
from app.config import configure_tls, get_settings
from app.routes.graph import graph_router
from app.routes.parse import parse_router
from fastapi import FastAPI, Request, Response, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from neo4j import AsyncGraphDatabase
from pydantic import BaseModel
from qdrant_client import AsyncQdrantClient

# In-memory registry for public repositories analyzed in session
_PUBLIC_REPOS: dict[str, dict] = {}
# Single-use tracking for redeemed OAuth states to prevent replay
_REDEEMED_STATES: set[str] = set()
# In-memory secure server-side session store: session_id -> session_data
_SESSIONS: dict[str, dict] = {}

ENV_PATH = Path(__file__).resolve().parent / ".env"

# GitHub API endpoints
_GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
_GITHUB_USER_URL = "https://api.github.com/user"
_GITHUB_USER_REPOS_URL = "https://api.github.com/user/repos"
_GITHUB_PUBLIC_REPO_URL = "https://api.github.com/repos"

# Regex for strictly validating GitHub repository URLs
_GITHUB_URL_RE = re.compile(
    r"^https://github\.com/([a-zA-Z0-9_.-]+)/([a-zA-Z0-9_.-]+?)(?:\.git)?/?$"
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_tls()
    settings = get_settings()

    print("ENV file exists:", ENV_PATH.is_file())
    print("NEO4J_URI loaded:", bool(settings.NEO4J_URI))
    print("QDRANT_URL loaded:", bool(settings.QDRANT_URL))

    app.state.neo4j = AsyncGraphDatabase.driver(
        settings.NEO4J_URI,
        auth=(
            settings.NEO4J_USERNAME,
            settings.NEO4J_PASSWORD.get_secret_value(),
        ),
    )

    app.state.qdrant = AsyncQdrantClient(
        url=settings.QDRANT_URL,
        api_key=settings.QDRANT_API_KEY.get_secret_value(),
    )

    yield

    await app.state.neo4j.close()
    await app.state.qdrant.close()


app = FastAPI(title="DevGraph API", lifespan=lifespan)
app.include_router(parse_router)
app.include_router(graph_router)

# Configure CORS using origins defined in Settings
settings = get_settings()
if settings.CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_methods=["*"],
        allow_headers=["*"],
        allow_credentials=True,
    )

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _validate_signed_state(state: str, secret: str) -> None:
    """Validate a signed OAuth state value.

    Raises ``HTTPException`` (400) when the format, signature, expiry, or reuse is
    invalid.  Called *before* any outbound network request so that malformed or
    replayed callbacks are rejected cheaply.

    State format: ``{raw_state}:{unix_timestamp}:{hmac_sha256_hex}``
    """
    if state in _REDEEMED_STATES:
        raise HTTPException(status_code=400, detail="OAuth state has already been used")

    parts = state.split(":")
    if len(parts) != 3:
        raise HTTPException(status_code=400, detail="Invalid OAuth state format")
    raw_state, ts_str, sig = parts
    try:
        ts = int(ts_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid OAuth state timestamp")
    # Expire after 5 minutes
    if time.time() - ts > 300:
        raise HTTPException(status_code=400, detail="OAuth state expired")
    expected_sig = hmac.new(
        secret.encode(),
        f"{raw_state}:{ts_str}".encode(),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(sig, expected_sig):
        raise HTTPException(status_code=400, detail="Invalid OAuth state signature")


def _get_session_from_request(request: Request) -> dict | None:
    """Retrieve and validate the authenticated session from HttpOnly cookie."""
    session_id = request.cookies.get("devgraph_session")
    if not session_id or session_id not in _SESSIONS:
        return None
    sess = _SESSIONS[session_id]
    if time.time() > sess.get("expires_at", 0):
        _SESSIONS.pop(session_id, None)
        return None
    return sess


def _attach_session_cookie(response: Response, session_id: str, settings) -> None:
    """Attach the HttpOnly session cookie to an HTTP response."""
    is_prod = getattr(settings, "ENVIRONMENT", "").lower() == "production"
    response.set_cookie(
        key="devgraph_session",
        value=session_id,
        httponly=True,
        samesite="lax",
        secure=is_prod,
        max_age=7 * 86400,
        path="/",
    )


def _generate_signed_state(secret: str) -> str:
    """Generate a short-lived HMAC-signed state token for OAuth CSRF protection."""
    raw_state = secrets.token_urlsafe(16)
    timestamp = str(int(time.time()))
    data = f"{raw_state}:{timestamp}"
    signature = hmac.new(secret.encode(), data.encode(), hashlib.sha256).hexdigest()
    return f"{raw_state}:{timestamp}:{signature}"


def _build_github_authorize_url(
    client_id: str,
    redirect_uri: str,
    signed_state: str,
    scope: str = "",
) -> str:
    """Build the GitHub OAuth authorization URL with the given parameters."""
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "state": signed_state,
        "allow_signup": "true",
    }
    if scope:
        params["scope"] = scope
    return f"https://github.com/login/oauth/authorize?{urllib.parse.urlencode(params)}"


async def _exchange_code_for_token(code: str, settings) -> str:
    """Exchange an OAuth authorization code for an access token.

    Returns the access token string.  Raises ``HTTPException`` on any failure.
    """
    if not settings.GITHUB_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="GitHub OAuth is not configured")

    token_payload = {
        "client_id": settings.GITHUB_CLIENT_ID,
        "client_secret": settings.GITHUB_CLIENT_SECRET.get_secret_value(),
        "code": code,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as http:
            token_resp = await http.post(
                _GITHUB_TOKEN_URL,
                json=token_payload,
                headers={"Accept": "application/json"},
            )
    except httpx.TimeoutException:
        raise HTTPException(status_code=502, detail="GitHub token request timed out")
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Could not reach GitHub token endpoint")

    if token_resp.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail="GitHub token endpoint returned an unexpected response",
        )

    try:
        token_data = token_resp.json()
    except Exception:
        raise HTTPException(status_code=502, detail="Malformed response from GitHub token endpoint")

    # GitHub may return 200 with an "error" field in the JSON body on bad codes
    if "error" in token_data:
        raise HTTPException(
            status_code=400,
            detail="GitHub rejected the authorization code",
        )

    access_token = token_data.get("access_token")
    if not access_token:
        raise HTTPException(status_code=502, detail="Access token missing from GitHub response")

    return access_token


def _parse_github_url(url: str) -> tuple[str, str]:
    """Parse a GitHub URL or slug into (owner, repo).

    Accepts:
    - https://github.com/{owner}/{repo} (optional .git, optional trailing slash)
    - {owner}/{repo} (shorthand format)
    Rejects other hosts, credentials, query strings, fragments, extra path segments.
    """
    clean = url.strip()
    if "@" in clean:
        raise HTTPException(
            status_code=400,
            detail="Invalid GitHub URL. Embedded credentials are not allowed.",
        )
    if "?" in clean or "#" in clean:
        raise HTTPException(
            status_code=400,
            detail="Invalid GitHub URL. Query parameters and fragments are not allowed.",
        )
    if clean.startswith("http://"):
        raise HTTPException(
            status_code=400,
            detail="Invalid GitHub URL. HTTP is not allowed, use https://github.com/{owner}/{repo}",
        )
    if clean.startswith("https://") and not clean.startswith("https://github.com/"):
        raise HTTPException(
            status_code=400,
            detail="Invalid GitHub URL. Host must be github.com",
        )

    # Normalize by stripping prefix
    if clean.startswith("https://github.com/"):
        slug = clean[len("https://github.com/"):]
    else:
        slug = clean

    slug = slug.rstrip("/")
    if slug.endswith(".git"):
        slug = slug[:-4]

    parts = slug.split("/")
    if len(parts) != 2 or not parts[0] or not parts[1]:
        raise HTTPException(
            status_code=400,
            detail="Invalid GitHub URL format. Use https://github.com/owner/repo",
        )

    owner, repo = parts[0], parts[1]
    if not re.match(r"^[a-zA-Z0-9_.-]+$", owner) or not re.match(r"^[a-zA-Z0-9_.-]+$", repo):
        raise HTTPException(
            status_code=400,
            detail="Invalid GitHub URL format. Owner and repo must contain valid characters.",
        )

    reserved = {"login", "settings", "explore", "pricing", "features", "pulls", "issues", "orgs"}
    if owner.lower() in reserved:
        raise HTTPException(
            status_code=400,
            detail=f"'{owner}' is a reserved GitHub system path, not a repository owner.",
        )
    return owner, repo


# ---------------------------------------------------------------------------
# GitHub OAuth routes (legacy – kept for existing tests)
# ---------------------------------------------------------------------------

@app.get("/auth/github/init", name="github_init")
async def github_init(request: Request):
    """Redirect the user to GitHub's OAuth authorization page.

    Generates a short-lived HMAC-signed ``state`` value to mitigate CSRF.
    Requires ``GITHUB_CLIENT_ID`` and ``OAUTH_STATE_SECRET`` to be configured.
    """
    settings = get_settings()
    if not settings.GITHUB_CLIENT_ID or not settings.OAUTH_STATE_SECRET:
        raise HTTPException(status_code=500, detail="GitHub OAuth is not configured")

    # Generate a random state token and sign it with a secret and timestamp
    raw_state = secrets.token_urlsafe(16)
    timestamp = str(int(time.time()))
    secret = settings.OAUTH_STATE_SECRET.get_secret_value()
    data = f"{raw_state}:{timestamp}"
    signature = hmac.new(secret.encode(), data.encode(), hashlib.sha256).hexdigest()
    signed_state = f"{raw_state}:{timestamp}:{signature}"

    # Build redirect URL to GitHub
    callback_url = request.url_for("github_callback")
    params = {
        "client_id": settings.GITHUB_CLIENT_ID,
        "redirect_uri": str(callback_url),
        "state": signed_state,
        "allow_signup": "true",
    }
    github_url = f"https://github.com/login/oauth/authorize?{urllib.parse.urlencode(params)}"
    return RedirectResponse(github_url)


@app.get("/auth/github/callback", name="github_callback")
async def github_callback(
    state: str | None = None,
    code: str | None = None,
    error: str | None = None,
):
    """Handle the OAuth callback from GitHub.

    Steps performed:
    1. Reject if GitHub returned an ``error`` parameter (e.g. ``access_denied``).
    2. Validate the signed ``state`` to prevent CSRF; reject expired or tampered tokens.
    3. Exchange the ``code`` for an access token via a server-side POST to GitHub.
    4. Parse and verify the token response.

    .. note::
        **TODO – secure session handling is not yet implemented.**
        The access token is intentionally *not* returned to the frontend or
        stored in this iteration.  Once a server-side session mechanism
        (e.g. signed HttpOnly cookies or a backend session store) is in place,
        this handler should attach the token to the session and redirect the
        user to the application.  Do not move the access token to a client-
        visible response body until that step is complete.
    """
    settings = get_settings()
    if not settings.GITHUB_CLIENT_ID or not settings.OAUTH_STATE_SECRET:
        raise HTTPException(status_code=500, detail="GitHub OAuth is not configured")

    # --- Step 1: surface GitHub authorization errors without leaking internals ---
    if error:
        # GitHub may send values such as "access_denied", "bad_verification_code", etc.
        # We accept the error label (it is not secret) but do not echo arbitrary data.
        safe_error = error if error.isidentifier() else "authorization_error"
        raise HTTPException(
            status_code=400,
            detail=f"GitHub authorization failed: {safe_error}",
        )

    # --- Step 2: validate required parameters ---
    if not state:
        raise HTTPException(status_code=400, detail="Missing OAuth state")

    # --- Step 3: validate signed state (CSRF protection) ---
    secret = settings.OAUTH_STATE_SECRET.get_secret_value()
    _validate_signed_state(state, secret)

    # --- Step 4: ensure we have an authorization code before proceeding ---


    # --- Step 4: if no authorization code provided, return simple validation success ---
    if not code:
        return {"detail": "OAuth state validated"}

    # --- Step 5: exchange code for access token ---
    access_token = await _exchange_code_for_token(code, settings)

    # TODO: once server-side session handling is implemented, store the access
    # token in the session (e.g. encrypted HttpOnly cookie) and redirect the user
    # to the frontend application.  The token MUST NOT be returned in the
    # response body or logged.

    return {
        "detail": "GitHub OAuth completed. Session handling is not yet implemented; "
                  "the access token has been received server-side but is not stored or returned.",
    }


# ---------------------------------------------------------------------------
# Frontend-aligned API routes
# ---------------------------------------------------------------------------

@app.get("/api/auth/github/status")
async def api_auth_github_status(request: Request):
    """Return whether GitHub OAuth is configured.

    Matches the frontend ``GithubAuthStatus`` interface:
    ``{ configured, client_id, redirect_uri, message }``
    """
    settings = get_settings()
    configured = bool(
        settings.GITHUB_CLIENT_ID
        and settings.GITHUB_CLIENT_SECRET
        and settings.OAUTH_STATE_SECRET
    )
    # The frontend redirect URI is the page the user lands on after GitHub
    # redirects back.  This is the Vite dev-server URL in development.
    frontend_origin = (
        settings.CORS_ORIGINS[0]
        if isinstance(settings.CORS_ORIGINS, list) and settings.CORS_ORIGINS
        else "http://localhost:5173"
    )
    redirect_uri = f"{frontend_origin}/connect"

    if configured:
        return {
            "configured": True,
            "client_id": settings.GITHUB_CLIENT_ID,
            "redirect_uri": redirect_uri,
            "message": "GitHub OAuth is configured and ready.",
        }
    return {
        "configured": False,
        "client_id": None,
        "redirect_uri": redirect_uri,
        "message": (
            "GitHub OAuth App is not configured. "
            "Set GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, and OAUTH_STATE_SECRET "
            "in Backend/.env to enable private repo OAuth."
        ),
    }


@app.get("/api/auth/github/url")
async def api_auth_github_url(request: Request):
    """Return a JSON object with the GitHub authorization URL.

    Response: ``{ "url": "https://github.com/login/oauth/authorize?..." }``
    """
    settings = get_settings()
    if not settings.GITHUB_CLIENT_ID or not settings.OAUTH_STATE_SECRET:
        raise HTTPException(
            status_code=400,
            detail="GitHub OAuth is not configured on the backend server.",
        )

    secret = settings.OAUTH_STATE_SECRET.get_secret_value()
    signed_state = _generate_signed_state(secret)

    # Use the frontend origin as the redirect target so the SPA can capture
    # the code from the query string.
    frontend_origin = (
        settings.CORS_ORIGINS[0]
        if isinstance(settings.CORS_ORIGINS, list) and settings.CORS_ORIGINS
        else "http://localhost:5173"
    )
    redirect_uri = f"{frontend_origin}/connect"

    url = _build_github_authorize_url(
        client_id=settings.GITHUB_CLIENT_ID,
        redirect_uri=redirect_uri,
        signed_state=signed_state,
        scope="read:user,repo",
    )
    return {"url": url}


class _OAuthCallbackBody(BaseModel):
    code: str
    state: str | None = None


@app.post("/api/auth/github/callback")
async def api_auth_github_callback(body: _OAuthCallbackBody, response: Response):
    """Exchange a GitHub OAuth code for user profile and repositories.

    Accepts JSON ``{ "code": "...", "state": "..." }``.
    Validates and marks state as redeemed (if provided).
    Exchanges code for access token, fetches profile and repositories,
    stores token in server-side session, and attaches HttpOnly session cookie.
    Never exposes access token in the response JSON.
    """
    settings = get_settings()
    if not settings.GITHUB_CLIENT_ID or not settings.GITHUB_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="GitHub OAuth is not configured")

    # If state provided, validate it and mark as redeemed
    if body.state:
        if not settings.OAUTH_STATE_SECRET:
            raise HTTPException(status_code=500, detail="GitHub OAuth is not configured")
        _validate_signed_state(body.state, settings.OAUTH_STATE_SECRET.get_secret_value())
        _REDEEMED_STATES.add(body.state)

    # Exchange code for access token (reuses shared helper)
    access_token = await _exchange_code_for_token(body.code, settings)

    # Fetch the authenticated user's profile
    auth_headers = {
        "Authorization": f"token {access_token}",
        "Accept": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as http:
            user_resp = await http.get(_GITHUB_USER_URL, headers=auth_headers)
            if user_resp.status_code != 200:
                raise HTTPException(
                    status_code=502,
                    detail="Failed to fetch GitHub user profile",
                )
            user_data = user_resp.json()

            # Fetch user's repositories (first page, up to 100)
            repos_resp = await http.get(
                _GITHUB_USER_REPOS_URL,
                headers=auth_headers,
                params={
                    "visibility": "all",
                    "sort": "updated",
                    "per_page": 100,
                },
            )
            if repos_resp.status_code != 200:
                raise HTTPException(
                    status_code=502,
                    detail="Failed to fetch GitHub repositories",
                )
            repos_data = repos_resp.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=502, detail="GitHub API request timed out")
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Could not reach GitHub API")

    user = {
        "id": str(user_data.get("id", "")),
        "username": user_data.get("login", ""),
        "name": user_data.get("name") or user_data.get("login", ""),
        "avatar_url": user_data.get("avatar_url", ""),
    }

    repositories = [
        {
            "id": r["id"],
            "name": r["name"],
            "full_name": r["full_name"],
            "private": r["private"],
            "description": r.get("description") or "",
            "language": r.get("language") or "",
            "stargazers_count": r.get("stargazers_count", 0),
            "updated_at": r.get("updated_at", ""),
            "default_branch": r.get("default_branch", "main"),
            "html_url": r.get("html_url", ""),
        }
        for r in repos_data
        if isinstance(r, dict)
    ]

    # Create server-side session and attach secure HttpOnly cookie
    session_id = secrets.token_urlsafe(32)
    _SESSIONS[session_id] = {
        "session_id": session_id,
        "access_token": access_token,
        "user": user,
        "created_at": time.time(),
        "expires_at": time.time() + 7 * 86400,
    }
    _attach_session_cookie(response, session_id, settings)

    return {"user": user, "repositories": repositories}


@app.get("/api/auth/session")
async def api_auth_session(request: Request):
    """Return the current authenticated user session from HttpOnly cookie."""
    sess = _get_session_from_request(request)
    if not sess:
        return {"authenticated": False, "user": None}
    return {"authenticated": True, "user": sess["user"]}


@app.post("/api/auth/logout")
async def api_auth_logout(request: Request, response: Response):
    """Invalidate server-side session and delete the session cookie."""
    session_id = request.cookies.get("devgraph_session")
    if session_id and session_id in _SESSIONS:
        _SESSIONS.pop(session_id, None)
    response.delete_cookie(key="devgraph_session", path="/")
    return {"status": "ok", "message": "Logged out successfully"}


@app.get("/api/repos")
async def api_list_repos(request: Request):
    """List accessible repositories.

    If an authenticated session is present, fetches the user's accessible GitHub
    repositories (including private repositories they authorized) via the GitHub API.
    If unauthenticated, returns the public repositories connected in this session.
    """
    sess = _get_session_from_request(request)
    if not sess:
        return [
            {
                "id": info["repo_id"],
                "name": info["repo_name"],
                "full_name": info["full_name"],
                "owner": info.get("owner") or info["full_name"].split("/")[0],
                "private": False,
                "description": "",
                "language": info.get("language", "Unknown"),
                "stargazers_count": 0,
                "updated_at": info.get("updated_at", datetime.now(timezone.utc).isoformat()),
                "default_branch": info.get("default_branch", "main"),
                "html_url": f"https://github.com/{info['full_name']}",
            }
            for info in _PUBLIC_REPOS.values()
            if info.get("repo_id") == info.get("clean_id", info.get("repo_id"))
        ]

    token = sess["access_token"]
    auth_headers = {
        "Authorization": f"token {token}",
        "Accept": "application/json",
    }
    all_repos = []
    page = 1
    try:
        async with httpx.AsyncClient(timeout=10.0) as http:
            while page <= 3:  # up to 300 repos to prevent unbounded pagination
                repos_resp = await http.get(
                    _GITHUB_USER_REPOS_URL,
                    headers=auth_headers,
                    params={
                        "visibility": "all",
                        "sort": "updated",
                        "per_page": 100,
                        "page": page,
                    },
                )
                if repos_resp.status_code != 200:
                    break
                page_data = repos_resp.json()
                if not page_data or not isinstance(page_data, list):
                    break
                all_repos.extend(page_data)
                if len(page_data) < 100:
                    break
                page += 1
    except Exception:
        pass

    # Cache all accessible user repositories so tree/file/status endpoints can
    # resolve any identifier (full_name, name, numeric id, slug) without failing.
    for r in all_repos:
        if isinstance(r, dict):
            owner_login = (
                r.get("owner", {}).get("login")
                if isinstance(r.get("owner"), dict)
                else (sess["user"]["username"] if sess and "user" in sess else "")
            )
            r_name = r.get("name", "")
            r_full_name = r.get("full_name", f"{owner_login}/{r_name}")
            r_id = str(r.get("id", ""))
            r_branch = r.get("default_branch", "main")
            repo_entry = {
                "repo_id": r_full_name.lower(),
                "repo_name": r_name,
                "full_name": r_full_name,
                "owner": owner_login,
                "repo": r_name,
                "default_branch": r_branch,
                "private": r.get("private", False),
            }
            _PUBLIC_REPOS[r_full_name.lower()] = repo_entry
            _PUBLIC_REPOS[r_name.lower()] = repo_entry
            if r_id:
                _PUBLIC_REPOS[r_id] = repo_entry
            if owner_login:
                _PUBLIC_REPOS[f"{owner_login}-{r_name}".lower()] = repo_entry

    return [
        {
            "id": r["id"],
            "name": r["name"],
            "full_name": r["full_name"],
            "owner": (
                r.get("owner", {}).get("login")
                if isinstance(r.get("owner"), dict)
                else (sess["user"]["username"] if sess and "user" in sess else (r["full_name"].split("/")[0] if "/" in r["full_name"] else ""))
            ),
            "private": r.get("private", False),
            "description": r.get("description") or "",
            "language": r.get("language") or "",
            "stargazers_count": r.get("stargazers_count", 0),
            "updated_at": r.get("updated_at", ""),
            "default_branch": r.get("default_branch", "main"),
            "html_url": r.get("html_url", ""),
            "permissions": r.get("permissions", {}),
        }
        for r in all_repos
        if isinstance(r, dict)
    ]


class _PublicRepoBody(BaseModel):
    url: str


@app.post("/api/repos/public")
async def api_repos_public(body: _PublicRepoBody):
    """Validate a public GitHub repository and accept it for future ingestion.

    Verifies the repository exists and is public by calling the GitHub API.
    Returns a truthful status: the repository metadata is confirmed but
    code parsing, graph building, and vector indexing are **not yet
    implemented** — the ``state`` field reflects this honestly.
    """
    owner, repo = _parse_github_url(body.url)

    # Verify the repository exists and is public via GitHub's API
    api_url = f"{_GITHUB_PUBLIC_REPO_URL}/{owner}/{repo}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as http:
            gh_resp = await http.get(
                api_url,
                headers={"Accept": "application/vnd.github.v3+json"},
            )
    except httpx.TimeoutException:
        raise HTTPException(status_code=502, detail="GitHub API request timed out")
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Could not reach GitHub API")

    if gh_resp.status_code == 404:
        raise HTTPException(
            status_code=404,
            detail=f"Repository '{owner}/{repo}' was not found on GitHub.",
        )
    if gh_resp.status_code == 403:
        raise HTTPException(
            status_code=502,
            detail="GitHub API rate limit exceeded. Please try again later.",
        )
    if gh_resp.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"GitHub API returned HTTP {gh_resp.status_code}",
        )

    try:
        meta = gh_resp.json()
    except Exception:
        raise HTTPException(status_code=502, detail="Malformed response from GitHub API")

    if meta.get("private"):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Repository '{owner}/{repo}' is private. "
                "Private repositories require GitHub OAuth connection."
            ),
        )

    repo_id = f"{owner}-{repo}".lower()
    repo_id = re.sub(r"[^a-z0-9_-]", "-", repo_id)
    now = datetime.now(timezone.utc).isoformat()

    repo_data = {
        "repo_id": repo_id,
        "repo_name": repo,
        "full_name": f"{owner}/{repo}",
        "default_branch": meta.get("default_branch", "main"),
        "language": meta.get("language") or "Unknown",
        "state": "pending",
        "stage": (
            "Repository validated. Code parsing, graph building, and "
            "vector indexing are not yet implemented."
        ),
        "progress": 0,
        "files_total": 0,
        "files_done": 0,
        "symbols_count": 0,
        "edges_count": 0,
        "error": None,
        "updated_at": now,
    }
    _PUBLIC_REPOS[repo_id] = {
        "repo_id": repo_id,
        "repo_name": repo,
        "full_name": f"{owner}/{repo}",
        "owner": owner,
        "repo": repo,
        "default_branch": meta.get("default_branch", "main"),
    }
    _PUBLIC_REPOS[f"{owner}/{repo}".lower()] = _PUBLIC_REPOS[repo_id]
    return repo_data


_LANGUAGE_MAP = {
    ".py": "Python",
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".js": "JavaScript",
    ".jsx": "JavaScript",
    ".json": "JSON",
    ".md": "Markdown",
    ".html": "HTML",
    ".htm": "HTML",
    ".css": "CSS",
    ".scss": "SCSS",
    ".go": "Go",
    ".rs": "Rust",
    ".java": "Java",
    ".c": "C",
    ".h": "C",
    ".cpp": "C++",
    ".cc": "C++",
    ".hpp": "C++",
    ".yaml": "YAML",
    ".yml": "YAML",
    ".sh": "Shell",
    ".bash": "Shell",
    ".toml": "TOML",
    ".sql": "SQL",
    ".xml": "XML",
    ".txt": "Plain Text",
}

_BINARY_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".bmp", ".tiff",
    ".pdf", ".zip", ".tar", ".gz", ".7z", ".bz2", ".xz",
    ".exe", ".dll", ".so", ".dylib", ".bin", ".pyc", ".pyd", ".wasm",
    ".woff", ".woff2", ".ttf", ".eot", ".otf",
    ".mp3", ".wav", ".ogg", ".mp4", ".mov", ".avi", ".webm",
    ".iso", ".dmg", ".pkg", ".deb", ".rpm", ".class", ".jar",
}


def _detect_language(path: str) -> str:
    ext = os.path.splitext(path)[1].lower()
    return _LANGUAGE_MAP.get(ext, "Plain Text")


def _is_binary_path(path: str) -> bool:
    ext = os.path.splitext(path)[1].lower()
    return ext in _BINARY_EXTENSIONS


def _get_github_headers(token: str | None = None) -> dict[str, str]:
    """Provide headers with authentication for elevated GitHub API limits (5,000 req/hr)."""
    headers = {"Accept": "application/vnd.github.v3+json"}
    if token:
        headers["Authorization"] = f"token {token}"
    else:
        settings = get_settings()
        if settings.GITHUB_CLIENT_ID and settings.GITHUB_CLIENT_SECRET:
            user_pass = f"{settings.GITHUB_CLIENT_ID}:{settings.GITHUB_CLIENT_SECRET.get_secret_value()}"
            b64_val = base64.b64encode(user_pass.encode()).decode()
            headers["Authorization"] = f"Basic {b64_val}"
    return headers


async def _resolve_public_repo(
    repo_id: str, access_token: str | None = None, session: dict | None = None
) -> tuple[str, str, str]:
    """Resolve repo_id to (owner, repo, default_branch).

    Checks in-memory registry _PUBLIC_REPOS first.
    If not cached, attempts resolution via GitHub API.
    If access_token is provided, uses it for private repo authorization.
    Can resolve:
      - 'owner/repo' (slug)
      - 'owner__repo' or 'owner-repo'
      - bare 'repo_name' (if in cache or belonging to authenticated user)
      - numeric repo id (if in cache or resolved via GitHub API)
    """
    clean_id = repo_id.strip().lower()
    if clean_id in _PUBLIC_REPOS:
        info = _PUBLIC_REPOS[clean_id]
        return info["owner"], info["repo"], info.get("default_branch", "main")

    # Check any registered repos where repo_id, full_name, repo_name, or repo matches
    for info in _PUBLIC_REPOS.values():
        if clean_id in (
            str(info.get("repo_id", "")).lower(),
            info.get("full_name", "").lower(),
            info.get("repo_name", "").lower(),
            info.get("repo", "").lower(),
        ):
            return info["owner"], info["repo"], info.get("default_branch", "main")

    # If repo_id contains slash: owner/repo
    if "/" in clean_id:
        owner, repo = clean_id.split("/", 1)
        api_url = f"{_GITHUB_PUBLIC_REPO_URL}/{owner}/{repo}"
    elif "__" in clean_id:
        owner, repo = clean_id.split("__", 1)
        api_url = f"{_GITHUB_PUBLIC_REPO_URL}/{owner}/{repo}"
    elif "-" in clean_id:
        owner, repo = clean_id.split("-", 1)
        api_url = f"{_GITHUB_PUBLIC_REPO_URL}/{owner}/{repo}"
    elif session and session.get("user", {}).get("username"):
        owner = session["user"]["username"]
        repo = repo_id.strip()
        api_url = f"{_GITHUB_PUBLIC_REPO_URL}/{owner}/{repo}"
    elif clean_id.isdigit() and access_token:
        api_url = f"https://api.github.com/repositories/{clean_id}"
        owner, repo = "", ""
    else:
        raise HTTPException(status_code=404, detail=f"Repository '{repo_id}' not found.")

    req_headers = _get_github_headers(access_token)

    try:
        async with httpx.AsyncClient(timeout=10.0) as http:
            resp = await http.get(api_url, headers=req_headers)
    except httpx.TimeoutException:
        raise HTTPException(status_code=502, detail="GitHub API request timed out")
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Could not reach GitHub API")

    if resp.status_code == 404:
        target_name = f"{owner}/{repo}" if owner and repo else repo_id
        raise HTTPException(status_code=404, detail=f"Repository '{target_name}' not found on GitHub.")
    if resp.status_code == 403:
        raise HTTPException(status_code=502, detail="GitHub API rate limit exceeded. Please try again later.")
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"GitHub API returned HTTP {resp.status_code}")

    try:
        meta = resp.json()
    except Exception:
        raise HTTPException(status_code=502, detail="Malformed response from GitHub API")

    if meta.get("private") and not access_token:
        raise HTTPException(status_code=400, detail="Private repositories require GitHub OAuth connection.")

    owner = meta.get("owner", {}).get("login", owner) if isinstance(meta.get("owner"), dict) else owner
    repo = meta.get("name", repo)
    default_branch = meta.get("default_branch", "main")
    repo_data = {
        "repo_id": clean_id,
        "repo_name": repo,
        "full_name": f"{owner}/{repo}",
        "owner": owner,
        "repo": repo,
        "default_branch": default_branch,
    }
    _PUBLIC_REPOS[clean_id] = repo_data
    _PUBLIC_REPOS[f"{owner}/{repo}".lower()] = repo_data
    _PUBLIC_REPOS[repo.lower()] = repo_data
    return owner, repo, default_branch


@app.get("/api/repos/{repo_id:path}/tree")
async def api_repos_tree(repo_id: str, request: Request):
    """Fetch the default branch file tree for a public or authorized private repository.

    Uses GitHub's public Git Trees API (recursive).
    Constructs a hierarchical TreeNode directory tree.
    """
    sess = _get_session_from_request(request)
    token = sess["access_token"] if sess else None
    owner, repo, default_branch = await _resolve_public_repo(repo_id, token, sess)

    tree_url = f"{_GITHUB_PUBLIC_REPO_URL}/{owner}/{repo}/git/trees/{default_branch}"
    req_headers = _get_github_headers(token)

    try:
        async with httpx.AsyncClient(timeout=15.0) as http:
            resp = await http.get(
                tree_url,
                params={"recursive": "1"},
                headers=req_headers,
            )
    except httpx.TimeoutException:
        raise HTTPException(status_code=502, detail="GitHub API request timed out")
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Could not reach GitHub API")

    if resp.status_code == 404:
        raise HTTPException(
            status_code=404,
            detail=f"File tree for '{owner}/{repo}' on branch '{default_branch}' was not found.",
        )
    if resp.status_code == 403:
        raise HTTPException(status_code=502, detail="GitHub API rate limit exceeded. Please try again later.")
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"GitHub API returned HTTP {resp.status_code}")

    try:
        data = resp.json()
    except Exception:
        raise HTTPException(status_code=502, detail="Malformed response from GitHub API")

    raw_items = data.get("tree", [])
    max_items = 5000
    if len(raw_items) > max_items:
        raw_items = raw_items[:max_items]

    # Build hierarchical tree matching TreeNode schema
    root = {
        "id": "root",
        "name": repo,
        "path": "",
        "type": "directory",
        "children": [],
    }

    dirs: dict[str, dict] = {"": root}

    for item in raw_items:
        path = item.get("path", "")
        if not path:
            continue
        item_type = item.get("type", "")

        parts = path.split("/")
        # Ensure parent directories exist
        for i in range(len(parts) - 1):
            parent_path = "/".join(parts[: i + 1])
            grandparent_path = "/".join(parts[:i])
            if parent_path not in dirs:
                dir_node = {
                    "id": parent_path,
                    "name": parts[i],
                    "path": parent_path,
                    "type": "directory",
                    "children": [],
                }
                dirs[parent_path] = dir_node
                if grandparent_path in dirs:
                    dirs[grandparent_path]["children"].append(dir_node)

        parent_path = "/".join(parts[:-1])
        parent_dir = dirs.get(parent_path, root)

        if item_type == "tree":
            if path not in dirs:
                dir_node = {
                    "id": path,
                    "name": parts[-1],
                    "path": path,
                    "type": "directory",
                    "children": [],
                }
                dirs[path] = dir_node
                parent_dir["children"].append(dir_node)
        elif item_type == "blob":
            file_node = {
                "id": path,
                "name": parts[-1],
                "path": path,
                "type": "file",
                "size": item.get("size", 0),
                "language": _detect_language(path),
                "analyzed": False,
            }
            parent_dir["children"].append(file_node)

    def _sort_tree(node: dict):
        if "children" in node:
            node["children"].sort(
                key=lambda x: (0 if x["type"] == "directory" else 1, x["name"].lower())
            )
            for child in node["children"]:
                _sort_tree(child)

    _sort_tree(root)
    return root


@app.get("/api/repos/{repo_id:path}/status")
async def api_repos_status(repo_id: str, request: Request):
    """Get indexing/connection status of a repository."""
    sess = _get_session_from_request(request)
    token = sess["access_token"] if sess else None
    owner, repo, default_branch = await _resolve_public_repo(repo_id, token, sess)

    clean_id = repo_id.strip().lower()
    cached = (
        _PUBLIC_REPOS.get(clean_id)
        or _PUBLIC_REPOS.get(f"{owner}/{repo}".lower())
        or _PUBLIC_REPOS.get(f"{owner}-{repo}".lower())
    )
    if cached and "state" in cached:
        return {
            "state": cached.get("state", "ready"),
            "stage": cached.get("stage", "Repository connected and ready."),
            "progress": cached.get("progress", 100),
            "files_total": cached.get("files_total", 0),
            "files_done": cached.get("files_done", 0),
            "error": cached.get("error"),
            "updated_at": cached.get("updated_at", datetime.now(timezone.utc).isoformat()),
        }
    return {
        "state": "ready",
        "stage": f"Repository '{owner}/{repo}' is connected and ready.",
        "progress": 100,
        "files_total": 0,
        "files_done": 0,
        "error": None,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


async def _fetch_repo_file_content(
    repo_id: str,
    path: str,
    request: Request,
) -> tuple[str, str, int, str]:
    """Fetch raw text file content from a public or authorized private repository.

    Validates path, checks for oversized or binary files, and retrieves
    clean text content via GitHub's public API. Returns (clean_path, text_content, file_size, language).
    """
    clean_path = path.strip().lstrip("/")
    if not clean_path:
        raise HTTPException(status_code=400, detail="File path cannot be empty.")

    if ".." in clean_path.split("/"):
        raise HTTPException(status_code=400, detail="Invalid file path.")

    if _is_binary_path(clean_path):
        raise HTTPException(
            status_code=400,
            detail=f"File '{clean_path}' is a binary file and cannot be viewed as text.",
        )

    sess = _get_session_from_request(request)
    token = sess["access_token"] if sess else None
    owner, repo, default_branch = await _resolve_public_repo(repo_id, token, sess)

    content_url = f"{_GITHUB_PUBLIC_REPO_URL}/{owner}/{repo}/contents/{clean_path}"
    req_headers = _get_github_headers(token)

    try:
        async with httpx.AsyncClient(timeout=15.0) as http:
            resp = await http.get(
                content_url,
                params={"ref": default_branch},
                headers=req_headers,
            )
    except httpx.TimeoutException:
        raise HTTPException(status_code=502, detail="GitHub API request timed out")
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Could not reach GitHub API")

    if resp.status_code == 404:
        raise HTTPException(
            status_code=404,
            detail=f"File '{clean_path}' was not found in repository '{owner}/{repo}'.",
        )
    if resp.status_code == 403:
        raise HTTPException(status_code=502, detail="GitHub API rate limit exceeded. Please try again later.")
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"GitHub API returned HTTP {resp.status_code}")

    try:
        data = resp.json()
    except Exception:
        raise HTTPException(status_code=502, detail="Malformed response from GitHub API")

    if isinstance(data, list):
        raise HTTPException(
            status_code=400,
            detail=f"Path '{clean_path}' is a directory, not a file.",
        )

    file_size = data.get("size", 0)
    max_file_size = 1_048_576  # 1 MB
    if file_size > max_file_size:
        raise HTTPException(
            status_code=413,
            detail=f"File '{clean_path}' exceeds the maximum viewable size of 1 MB ({file_size} bytes).",
        )

    encoding = data.get("encoding", "")
    raw_content = data.get("content", "")

    if encoding == "base64":
        try:
            content_bytes = base64.b64decode(raw_content)
        except Exception:
            raise HTTPException(status_code=502, detail="Failed to decode file content from GitHub.")
    else:
        content_bytes = raw_content.encode("utf-8")

    if b"\x00" in content_bytes:
        raise HTTPException(
            status_code=400,
            detail=f"File '{clean_path}' contains binary data and cannot be viewed as text.",
        )

    try:
        text_content = content_bytes.decode("utf-8")
    except UnicodeDecodeError:
        text_content = content_bytes.decode("utf-8", errors="replace")

    language = _detect_language(clean_path)
    return clean_path, text_content, file_size, language


@app.get("/api/repos/{repo_id:path}/file")
async def api_repos_file(
    repo_id: str,
    request: Request,
    path: str = Query(..., description="File path within repository"),
):
    """Fetch raw text file content from a public or authorized private repository.

    Validates path, checks for oversized or binary files, and retrieves
    clean text content via GitHub's public API. Never executes fetched code.
    """
    clean_path, text_content, file_size, language = await _fetch_repo_file_content(
        repo_id, path, request
    )
    lines_count = len(text_content.splitlines()) if text_content else 0

    return {
        "path": clean_path,
        "content": text_content,
        "language": language,
        "lines": lines_count,
        "analyzed": False,
        "symbols": [],
        "size_bytes": file_size,
    }



# ---------------------------------------------------------------------------
# Core endpoints
# ---------------------------------------------------------------------------

@app.get("/")
async def root():
    return {
        "message": "Welcome to DevGraph API",
        "docs": "/docs",
        "health": "/api/health",
    }


@app.get("/api/health")
async def health():
    return {"status": "ok", "project": "DevGraph"}


@app.get("/api/db-check")
async def db_check():
    result = {}
    settings = get_settings()

    try:
        if settings.NEO4J_DATABASE:
            async with app.state.neo4j.session(
                database=settings.NEO4J_DATABASE
            ) as session:
                await session.run("RETURN 1")
        else:
            await app.state.neo4j.verify_connectivity()
        result["neo4j"] = "connected"
    except Exception as e:
        print("NEO4J ERROR:", repr(e))
        result["neo4j"] = "connection failed"

    try:
        await app.state.qdrant.get_collections()
        result["qdrant"] = "connected"
    except Exception as e:
        print("QDRANT ERROR:", repr(e))
        result["qdrant"] = "connection failed"

    return result

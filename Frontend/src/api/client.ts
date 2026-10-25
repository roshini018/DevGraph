/**
 * DevGraph API Client
 * Single entry point for all frontend data.
 * Components NEVER import mock files directly (Rule 6).
 */

import type {
  GithubRepo,
  ConnectedRepo,
  IndexStatus,
  TreeNode,
  FileContent,
  GraphData,
  NodeDetail,
  ConnectionResult,
  ImpactResult,
  AskResult,
  SearchResult,
  ApiError,
  RepoStats,
  GraphNode,
  GraphEdge,
  SymbolKind,
  EdgeKind,
} from '../types/api';
import {
  MOCK_GITHUB_REPOS,
  MOCK_CONNECTED_REPO,
  MOCK_FILES,
  getStats as mockGetStats,
  getFileGraph as mockGetFileGraph,
  getSymbolGraph as mockGetSymbolGraph,
  getFileTree as mockGetFileTree,
  getFile as mockGetFile,
  getNodeDetail as mockGetNodeDetail,
  getConnection as mockGetConnection,
  getImpact as mockGetImpact,
  ask as mockAsk,
  search as mockSearch,
} from '../mocks/repo';
import { getMockControlsState } from './mockState';

// Helper to determine mock mode
export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== 'false';

/**
 * Maps raw backend Neo4j GraphElementsResponse into frontend GraphData.
 */
export function mapBackendGraphToFrontend(
  data: unknown,
  _mode: 'file' | 'symbol' = 'file'
): GraphData {
  if (!data || typeof data !== 'object') {
    return { nodes: [], edges: [] };
  }

  const raw = data as { nodes?: unknown[]; edges?: unknown[] };
  const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  const rawEdges = Array.isArray(raw.edges) ? raw.edges : [];

  const nodes: GraphNode[] = rawNodes.map((item: unknown) => {
    const n = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const rawKind = String(n.kind || '').toLowerCase();

    let kind: SymbolKind = 'function';
    if (rawKind === 'file') kind = 'file';
    else if (rawKind === 'class') kind = 'class';
    else if (rawKind === 'method') kind = 'method';
    else if (rawKind === 'variable') kind = 'variable';
    else if (rawKind === 'function') kind = 'function';
    else if (rawKind === 'import') kind = 'function';
    else kind = 'function';

    const id = String(n.id || '');
    let file = typeof n.file === 'string' ? n.file : '';
    if (!file && id.includes(':')) {
      const parts = id.split(':');
      if (parts.length >= 2) {
        file = parts[1];
      }
    }
    if (!file && kind === 'file') {
      file = String(n.label || id);
    }

    const label = String(n.label || (id.includes(':') ? id.split(':').pop() : id) || 'symbol');

    return {
      id,
      label,
      kind,
      file,
      start_line: typeof n.start_line === 'number' ? n.start_line : undefined,
      end_line: typeof n.end_line === 'number' ? n.end_line : undefined,
      description:
        typeof n.docstring === 'string' && n.docstring
          ? n.docstring
          : typeof n.signature === 'string' && n.signature
          ? n.signature
          : typeof n.description === 'string'
          ? n.description
          : undefined,
      metrics: {
        in_degree: 0,
        out_degree: 0,
        symbol_count: 0,
      },
    };
  });

  const edges: GraphEdge[] = rawEdges.map((item: unknown, idx: number) => {
    const e = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const rawKind = String(e.kind || '').toLowerCase();

    let kind: EdgeKind = 'calls';
    if (rawKind.includes('import')) kind = 'imports';
    else if (rawKind.includes('inherit')) kind = 'inherits';
    else if (rawKind.includes('define')) kind = 'defines';
    else if (rawKind.includes('call')) kind = 'calls';
    else kind = 'calls';

    const source = String(e.source || '');
    const target = String(e.target || '');
    const id = String(e.id || `e-${source}->${target}-${idx}`);
    const props = (e.properties && typeof e.properties === 'object' ? e.properties : {}) as Record<string, unknown>;
    const line = typeof props.line === 'number' ? props.line : typeof e.line === 'number' ? e.line : 0;
    const resolved = typeof e.resolved === 'boolean' ? e.resolved : true;

    return {
      id,
      source,
      target,
      kind,
      line,
      resolved,
    };
  });

  return { nodes, edges };
}

// Helper to simulate realistic network latency
async function simulateDelay(): Promise<void> {
  const { slowNetwork } = getMockControlsState();
  const delayMs = slowNetwork
    ? 2500
    : Math.floor(Math.random() * (1000 - 400 + 1)) + 400; // 400 to 1000 ms
  await new Promise(resolve => setTimeout(resolve, delayMs));
}

// Helper to check for simulated errors
function checkSimulatedError(): void {
  const { forceError } = getMockControlsState();
  if (forceError) {
    const errorObj: ApiError = {
      error: {
        code: 'FORCED_ERROR',
        message: 'Simulated API failure triggered from Mock Controls',
      },
    };
    throw errorObj;
  }
}

/**
 * List available GitHub repositories for connecting.
 */
export async function listGithubRepos(): Promise<GithubRepo[]> {
  if (!USE_MOCKS) {
    const res = await fetch('/api/github/repos');
    if (!res.ok) throw await res.json();
    return res.json();
  }

  await simulateDelay();
  checkSimulatedError();

  const { forceEmpty } = getMockControlsState();
  if (forceEmpty) return [];

  return MOCK_GITHUB_REPOS;
}

/**
 * Connect a repository for indexing.
 */
export async function connectRepo(repoId: string | number): Promise<ConnectedRepo> {
  if (!USE_MOCKS) {
    const res = await fetch('/api/repos/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_id: repoId }),
    });
    if (!res.ok) throw await res.json();
    return res.json();
  }

  await simulateDelay();
  checkSimulatedError();

  return {
    ...MOCK_CONNECTED_REPO,
    updated_at: new Date().toISOString(),
  };
}

/**
 * List all connected and indexed repositories.
 */
export async function listRepos(): Promise<ConnectedRepo[]> {
  const publicRepos = getRegisteredPublicRepos();

  try {
    const res = await fetch('/api/repos');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const mapped: ConnectedRepo[] = data.map((item: unknown) => {
          const r = item as Record<string, unknown>;
          const ownerObj = r.owner as Record<string, unknown> | null | undefined;
          const ownerLogin =
            ownerObj && typeof ownerObj === 'object' && typeof ownerObj.login === 'string'
              ? ownerObj.login
              : typeof r.owner === 'string'
              ? r.owner
              : (typeof r.full_name === 'string' && (r.full_name as string).includes('/') ? (r.full_name as string).split('/')[0] : '');
          const repoName = (r.name || r.repo_name || String(r.id)) as string;
          const fullName = (r.full_name || (ownerLogin ? `${ownerLogin}/${repoName}` : repoName)) as string;

          return {
            id: fullName,
            repo_name: repoName,
            full_name: fullName,
            branch: (r.default_branch || r.branch || 'main') as string,
            status: (r.status || {
              state: 'ready',
              stage: 'Repository connected',
              progress: 100,
              files_total: r.file_count || 0,
              files_done: r.file_count || 0,
              error: null,
              updated_at: r.updated_at || new Date().toISOString(),
            }) as ConnectedRepo['status'],
            file_count: (r.file_count || 0) as number,
            symbol_count: (r.symbol_count || 0) as number,
            edge_count: (r.edge_count || 0) as number,
            language: (r.language || 'Unknown') as string,
            updated_at: (r.updated_at || new Date().toISOString()) as string,
            ...(r.id ? { github_id: r.id as number } : {}),
            ...(ownerLogin ? { owner: ownerLogin } : {}),
            ...(r.private !== undefined ? { is_private: r.private as boolean } : {}),
          };
        });
        const filteredPublic = publicRepos.filter(
          p => !mapped.some(m => m.full_name === p.full_name || m.id === p.id)
        );
        return [...filteredPublic, ...mapped];
      }
    }
  } catch {
    // backend offline
  }

  if (!USE_MOCKS) {
    return publicRepos;
  }

  await simulateDelay();
  checkSimulatedError();

  const { forceEmpty } = getMockControlsState();
  if (forceEmpty) return [];

  return [...publicRepos, MOCK_CONNECTED_REPO];
}

/**
 * Get current indexing status and progress for a repository.
 */
export async function getIndexStatus(_repoId: string = 'repo-1'): Promise<IndexStatus> {
  const pub = PUBLIC_REPOS_STORE.get(_repoId);
  if (pub) {
    return pub.status;
  }

  try {
    const res = await fetch(`/api/repos/${encodeURIComponent(_repoId)}/status`);
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // backend offline
  }

  if (!USE_MOCKS) {
    const res = await fetch(`/api/repos/${encodeURIComponent(_repoId)}/status`);
    if (!res.ok) throw await res.json();
    return res.json();
  }

  await simulateDelay();
  checkSimulatedError();

  const { forceIndexingFailure } = getMockControlsState();
  if (forceIndexingFailure) {
    return {
      state: 'failed',
      stage: 'AST syntax parsing',
      progress: 42,
      files_total: 16,
      files_done: 7,
      error: 'Simulated indexing error: syntax token error on line 42',
      updated_at: new Date().toISOString(),
    };
  }

  return MOCK_CONNECTED_REPO.status;
}

// ---------------------------------------------------------------------------
// GitHub OAuth & Public Repository Analysis
// ---------------------------------------------------------------------------

export interface GithubUrlValidationResult {
  valid: boolean;
  owner?: string;
  repo?: string;
  cleanUrl?: string;
  error?: string;
}

/**
 * Validate and parse a GitHub repository URL or slug.
 */
export function validateGithubUrl(rawUrl: string): GithubUrlValidationResult {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { valid: false, error: 'Repository URL cannot be empty.' };
  }

  if (trimmed.includes('@')) {
    return { valid: false, error: 'Embedded credentials are not allowed in repository URLs.' };
  }

  if (trimmed.includes('?') || trimmed.includes('#')) {
    return { valid: false, error: 'Query parameters and fragments are not allowed in repository URLs.' };
  }

  if (trimmed.startsWith('http://')) {
    return { valid: false, error: 'HTTP is not supported. Use https://github.com/{owner}/{repo}' };
  }

  if (trimmed.startsWith('https://') && !trimmed.startsWith('https://github.com/')) {
    return { valid: false, error: 'Only GitHub repositories are supported (https://github.com/{owner}/{repo}).' };
  }

  let slug = trimmed;
  if (slug.startsWith('https://github.com/')) {
    slug = slug.slice('https://github.com/'.length);
  }

  slug = slug.replace(/\/+$/, '');
  if (slug.endsWith('.git')) {
    slug = slug.slice(0, -4);
  }

  const parts = slug.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return {
      valid: false,
      error: 'Invalid GitHub URL format. Expected https://github.com/{owner}/{repo}',
    };
  }

  const [owner, repo] = parts;
  const validPattern = /^[a-zA-Z0-9_.-]+$/;
  if (!validPattern.test(owner) || !validPattern.test(repo)) {
    return {
      valid: false,
      error: 'Owner and repository name can only contain letters, numbers, underscores, periods, and hyphens.',
    };
  }

  const reservedSlugs = ['login', 'settings', 'explore', 'pricing', 'features', 'pulls', 'issues', 'orgs'];
  if (reservedSlugs.includes(owner.toLowerCase())) {
    return {
      valid: false,
      error: `'${owner}' is a reserved GitHub system path, not a repository owner.`,
    };
  }

  return {
    valid: true,
    owner,
    repo,
    cleanUrl: `https://github.com/${owner}/${repo}`,
  };
}

export interface GithubAuthStatus {
  configured: boolean;
  client_id: string | null;
  redirect_uri: string;
  message: string;
}

/**
 * Check if real GitHub OAuth is configured in backend environment.
 */
export async function getGithubAuthStatus(): Promise<GithubAuthStatus> {
  try {
    const res = await fetch('/api/auth/github/status');
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Backend offline / not running
  }
  return {
    configured: false,
    client_id: null,
    redirect_uri: 'http://localhost:5173/connect',
    message: 'GitHub OAuth App is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in Backend/.env to enable private repo OAuth.',
  };
}

/**
 * Retrieve authorization URL for real GitHub OAuth flow.
 */
export async function getGithubAuthUrl(): Promise<string> {
  const res = await fetch('/api/auth/github/url');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'GitHub OAuth is not configured on the backend server.');
  }
  const data = await res.json();
  return data.url;
}

/**
 * Exchange OAuth callback temporary code for authenticated user and repositories.
 */
export async function exchangeGithubCode(code: string, state?: string): Promise<{
  user: { id: string; username: string; name: string; avatar_url: string };
  repositories: GithubRepo[];
}> {
  const res = await fetch('/api/auth/github/callback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, ...(state ? { state } : {}) }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to exchange GitHub authorization code.');
  }
  return await res.json();
}

/**
 * Check current authenticated session from server HttpOnly cookie.
 */
export async function checkSession(): Promise<{
  authenticated: boolean;
  user: { id: string; username: string; name: string; avatar_url: string } | null;
}> {
  try {
    const res = await fetch('/api/auth/session');
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // backend offline
  }
  return { authenticated: false, user: null };
}

/**
 * Log out and invalidate server-side session.
 */
export async function logoutGithub(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch {
    // backend offline
  }
}

// In-memory registry for public repositories analyzed in session
const PUBLIC_REPOS_STORE: Map<string, { repo: ConnectedRepo; status: IndexStatus }> = new Map();

/**
 * Ingest a public repository without requiring OAuth credentials.
 */
export async function analyzePublicRepo(rawUrl: string): Promise<ConnectedRepo> {
  const validation = validateGithubUrl(rawUrl);
  if (!validation.valid || !validation.owner || !validation.repo) {
    throw new Error(validation.error || 'Invalid repository URL');
  }

  const { owner, repo } = validation;
  const repoId = `${owner}-${repo}`.toLowerCase().replace(/[^a-z0-9_-]/g, '-');

  // Attempt backend ingestion endpoint first
  try {
    const backendRes = await fetch('/api/repos/public', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: validation.cleanUrl }),
    });

    if (backendRes.ok) {
      const data = await backendRes.json();
      const resolvedRepoId = data?.repo_id || repoId;
      const resolvedRepoName = data?.repo_name || repo;
      const resolvedFullName = data?.full_name || `${owner}/${repo}`;
      const resolvedBranch = data?.default_branch || 'main';
      const resolvedLanguage = data?.language || 'Unknown';
      const resolvedState = data?.state || 'pending';
      const resolvedStage =
        typeof data?.stage === 'string'
          ? data.stage
          : 'Repository validated. Code parsing, graph building, and vector indexing are not yet implemented.';
      const resolvedProgress = typeof data?.progress === 'number' ? data.progress : 0;
      const resolvedFilesTotal = typeof data?.files_total === 'number' ? data.files_total : 0;
      const resolvedFilesDone = typeof data?.files_done === 'number' ? data.files_done : 0;
      const resolvedSymbolsCount = typeof data?.symbols_count === 'number' ? data.symbols_count : 0;
      const resolvedEdgesCount = typeof data?.edges_count === 'number' ? data.edges_count : 0;
      const resolvedError = data?.error || null;
      const resolvedUpdatedAt = data?.updated_at || new Date().toISOString();

      const connected: ConnectedRepo = {
        id: resolvedRepoId,
        repo_name: resolvedRepoName,
        full_name: resolvedFullName,
        branch: resolvedBranch,
        status: {
          state: resolvedState,
          stage: resolvedStage,
          progress: resolvedProgress,
          files_total: resolvedFilesTotal,
          files_done: resolvedFilesDone,
          error: resolvedError,
          updated_at: resolvedUpdatedAt,
        },
        file_count: resolvedFilesTotal,
        symbol_count: resolvedSymbolsCount,
        edge_count: resolvedEdgesCount,
        language: resolvedLanguage,
        updated_at: resolvedUpdatedAt,
      };
      PUBLIC_REPOS_STORE.set(resolvedFullName, { repo: connected, status: connected.status });
      PUBLIC_REPOS_STORE.set(resolvedRepoId, { repo: connected, status: connected.status });
      return connected;
    } else {
      let detailMsg = `Repository analysis failed (HTTP ${backendRes.status})`;
      try {
        const err = await backendRes.json();
        if (typeof err.detail === 'string') {
          detailMsg = err.detail;
        } else if (Array.isArray(err.detail) && err.detail.length > 0) {
          detailMsg = err.detail
            .map((e: unknown) =>
              typeof e === 'object' && e !== null && 'msg' in e
                ? String((e as { msg: unknown }).msg)
                : String(e)
            )
            .join(', ');
        } else if (typeof err.message === 'string') {
          detailMsg = err.message;
        }
      } catch {
        // Fall back to status text
      }
      throw new Error(detailMsg);
    }
  } catch (err: unknown) {
    if (err instanceof Error) {
      const isNetworkError =
        err.message.includes('fetch') ||
        err.message.includes('NetworkError') ||
        err.message.includes('Failed to fetch') ||
        err.message.includes('ECONNREFUSED');
      if (!isNetworkError) {
        throw err;
      }
    }
    if (!USE_MOCKS) {
      throw err;
    }
  }

  // Client-side fallback: check GitHub public API directly when backend is unreachable
  const ghApiUrl = `https://api.github.com/repos/${owner}/${repo}`;
  const ghRes = await fetch(ghApiUrl, {
    headers: { Accept: 'application/vnd.github.v3+json' },
  });

  if (!ghRes.ok) {
    if (ghRes.status === 404) {
      throw new Error(`Repository '${owner}/${repo}' was not found. Please verify the URL points to an existing public repository.`);
    } else if (ghRes.status === 403) {
      throw new Error('GitHub API rate limit reached. Please wait a minute or connect GitHub OAuth.');
    }
    throw new Error(`GitHub returned HTTP ${ghRes.status}`);
  }

  const meta = await ghRes.json();
  if (meta.private) {
    throw new Error(`Repository '${owner}/${repo}' is private. Private repositories require GitHub OAuth connection.`);
  }

  const initialStatus: IndexStatus = {
    state: 'pending',
    stage: 'Repository validated via GitHub API. Code parsing, graph building, and vector indexing are not yet implemented in mock mode.',
    progress: 0,
    files_total: 0,
    files_done: 0,
    error: null,
    updated_at: new Date().toISOString(),
  };

  const newConnectedRepo: ConnectedRepo = {
    id: repoId,
    repo_name: repo,
    full_name: `${owner}/${repo}`,
    branch: meta.default_branch || 'main',
    status: initialStatus,
    file_count: 0,
    symbol_count: 0,
    edge_count: 0,
    language: meta.language || 'Python',
    updated_at: new Date().toISOString(),
  };

  PUBLIC_REPOS_STORE.set(repoId, { repo: newConnectedRepo, status: initialStatus });
  return newConnectedRepo;
}

export function updatePublicRepoStatus(repoId: string, partial: Partial<IndexStatus>) {
  const entry = PUBLIC_REPOS_STORE.get(repoId);
  if (entry) {
    entry.status = {
      ...entry.status,
      ...partial,
      updated_at: new Date().toISOString(),
    };
    entry.repo.status = entry.status;
    if (partial.files_total) entry.repo.file_count = partial.files_total;
    if (partial.state === 'ready') {
      entry.repo.symbol_count = 68;
      entry.repo.edge_count = 94;
    }
  }
}

/**
 * Retrieve all registered public repositories.
 */
export function getRegisteredPublicRepos(): ConnectedRepo[] {
  return Array.from(PUBLIC_REPOS_STORE.values()).map(v => v.repo);
}

/**
 * Clear all registered public repos (used for test isolation).
 */
export function clearRegisteredPublicRepos(): void {
  PUBLIC_REPOS_STORE.clear();
}

/**
 * Retry indexing for a failed or stalled repository.
 */
export async function retryIndex(_repoId: string = 'repo-1'): Promise<IndexStatus> {
  if (!USE_MOCKS) {
    const res = await fetch(`/api/repos/${_repoId}/retry`, { method: 'POST' });
    if (!res.ok) throw await res.json();
    return res.json();
  }

  await simulateDelay();
  checkSimulatedError();

  return {
    state: 'parsing',
    stage: 'Retrying symbol extraction',
    progress: 15,
    files_total: 16,
    files_done: 2,
    error: null,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Get hierarchical directory file tree.
 */
export async function getFileTree(_repoId?: string): Promise<TreeNode> {
  const isDemo = !_repoId || _repoId === 'my-store' || _repoId === 'repo-1' || _repoId === 'default';

  if (isDemo && USE_MOCKS) {
    await simulateDelay();
    checkSimulatedError();

    const { forceEmpty } = getMockControlsState();
    if (forceEmpty) {
      return {
        id: 'root',
        name: 'empty-store',
        path: '',
        type: 'directory',
        children: [],
      };
    }

    return mockGetFileTree();
  }

  // Canonical identifier validation: missing owner metadata produces a clear error
  if (!isDemo && _repoId && !_repoId.includes('/') && !_repoId.includes('__')) {
    const pub = PUBLIC_REPOS_STORE.get(_repoId);
    if (!pub) {
      const match = Array.from(PUBLIC_REPOS_STORE.values()).find(p => p.repo.repo_name === _repoId);
      if (!match) {
        throw new Error(`Repository identifier "${_repoId}" is missing owner metadata. Expected 'owner/repo' format.`);
      }
    }
  }

  const targetId = _repoId || 'default';
  const res = await fetch(`/api/repos/${encodeURIComponent(targetId)}/tree`);
  if (!res.ok) {
    let msg = `Failed to fetch repository tree (HTTP ${res.status})`;
    try {
      const err = await res.json();
      if (err.detail) msg = err.detail;
      else if (err.message) msg = err.message;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  return res.json();
}

/**
 * Retrieve file source content by path.
 */
export async function getFile(path: string, _repoId?: string): Promise<FileContent> {
  const isDemo = !_repoId || _repoId === 'my-store' || _repoId === 'repo-1' || _repoId === 'default';

  if (isDemo && USE_MOCKS) {
    await simulateDelay();
    checkSimulatedError();

    const file = mockGetFile(path);
    if (!file) {
      const err: ApiError = {
        error: {
          code: 'FILE_NOT_FOUND',
          message: `File at path "${path}" was not found in the codebase.`,
        },
      };
      throw err;
    }

    return file;
  }

  // Canonical identifier validation: missing owner metadata produces a clear error
  if (!isDemo && _repoId && !_repoId.includes('/') && !_repoId.includes('__')) {
    const pub = PUBLIC_REPOS_STORE.get(_repoId);
    if (!pub) {
      const match = Array.from(PUBLIC_REPOS_STORE.values()).find(p => p.repo.repo_name === _repoId);
      if (!match) {
        throw new Error(`Repository identifier "${_repoId}" is missing owner metadata. Expected 'owner/repo' format.`);
      }
    }
  }

  const targetId = _repoId || 'default';
  const res = await fetch(`/api/repos/${encodeURIComponent(targetId)}/file?path=${encodeURIComponent(path)}`);
  if (!res.ok) {
    let msg = `Failed to fetch file "${path}" (HTTP ${res.status})`;
    try {
      const err = await res.json();
      if (err.detail) msg = err.detail;
      else if (err.message) msg = err.message;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  return res.json();
}

/**
 * Retrieve dependency graph (symbol-level or aggregated file-level).
 */
export async function getGraph(
  repoIdOrMode?: string,
  modeArg?: 'symbol' | 'file' | 'files' | 'symbols'
): Promise<GraphData> {
  let targetRepoId: string | undefined;
  let viewMode: 'symbol' | 'file' = 'file';

  if (repoIdOrMode === 'file' || repoIdOrMode === 'symbol' || repoIdOrMode === 'files' || repoIdOrMode === 'symbols') {
    viewMode = repoIdOrMode.startsWith('symbol') ? 'symbol' : 'file';
    targetRepoId = undefined;
  } else {
    targetRepoId = repoIdOrMode;
    if (modeArg) {
      viewMode = modeArg.startsWith('symbol') ? 'symbol' : 'file';
    }
  }

  const isDemo = !targetRepoId || targetRepoId === 'my-store' || targetRepoId === 'repo-1' || targetRepoId === 'default';

  if (isDemo && USE_MOCKS) {
    await simulateDelay();
    checkSimulatedError();

    const { forceEmpty } = getMockControlsState();
    if (forceEmpty) {
      return { nodes: [], edges: [] };
    }

    return viewMode === 'file' ? mockGetFileGraph() : mockGetSymbolGraph();
  }

  const cleanId = targetRepoId || 'default';
  const res = await fetch(`/api/repos/${encodeURIComponent(cleanId)}/graph?limit=1000`);
  if (!res.ok) {
    let msg = `Failed to fetch graph data (HTTP ${res.status})`;
    try {
      const err = await res.json();
      if (err.detail) msg = err.detail;
      else if (err.message) msg = err.message;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  const data = await res.json();
  return mapBackendGraphToFrontend(data, viewMode);
}

/**
 * Get detailed metadata and connections for a specific node.
 */
export async function getNodeDetail(nodeId: string, _repoId?: string): Promise<NodeDetail> {
  const isDemo = !_repoId || _repoId === 'my-store' || _repoId === 'repo-1' || _repoId === 'default';

  if (isDemo && USE_MOCKS) {
    await simulateDelay();
    checkSimulatedError();

    const detail = mockGetNodeDetail(nodeId);
    if (!detail) {
      const err: ApiError = {
        error: {
          code: 'NODE_NOT_FOUND',
          message: `Node with identifier "${nodeId}" was not found.`,
        },
      };
      throw err;
    }

    return detail;
  }

  const res = await fetch(`/api/repos/${encodeURIComponent(_repoId || 'default')}/node/${encodeURIComponent(nodeId)}`);
  if (!res.ok) throw await res.json();
  return res.json();
}

/**
 * Calculate path connectivity between two symbols.
 */
export async function getConnection(
  sourceId: string,
  targetId: string,
  _repoId?: string
): Promise<ConnectionResult> {
  const isDemo = !_repoId || _repoId === 'my-store' || _repoId === 'repo-1' || _repoId === 'default';

  if (isDemo && USE_MOCKS) {
    await simulateDelay();
    checkSimulatedError();

    return mockGetConnection(sourceId, targetId);
  }

  const res = await fetch(
    `/api/repos/${encodeURIComponent(_repoId || 'default')}/connection?source=${encodeURIComponent(sourceId)}&target=${encodeURIComponent(targetId)}`
  );
  if (!res.ok) throw await res.json();
  return res.json();
}

/**
 * Run impact analysis for modified target symbols/files.
 */
export async function getImpact(
  targetIds: string[],
  depth: number = 3,
  _repoId?: string
): Promise<ImpactResult> {
  const isDemo = !_repoId || _repoId === 'my-store' || _repoId === 'repo-1' || _repoId === 'default';

  if (isDemo && USE_MOCKS) {
    await simulateDelay();
    checkSimulatedError();

    const { forceEmpty } = getMockControlsState();
    if (forceEmpty) {
      return {
        target_ids: targetIds,
        impacted_nodes: [],
        total_impacted: 0,
        max_depth: depth,
      };
    }

    return mockGetImpact(targetIds, depth);
  }

  const res = await fetch(`/api/repos/${encodeURIComponent(_repoId || 'default')}/impact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targets: targetIds, depth }),
  });
  if (!res.ok) throw await res.json();
  return res.json();
}

/**
 * Ask AI question regarding codebase with citations.
 */
export async function ask(question: string, _repoId?: string): Promise<AskResult> {
  const isDemo = !_repoId || _repoId === 'my-store' || _repoId === 'repo-1' || _repoId === 'default';

  if (isDemo && USE_MOCKS) {
    await simulateDelay();
    checkSimulatedError();

    return mockAsk(question);
  }

  const res = await fetch(`/api/repos/${encodeURIComponent(_repoId || 'default')}/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) throw await res.json();
  return res.json();
}

/**
 * Search across symbols, files, and code.
 */
export async function search(query: string, _repoId?: string): Promise<SearchResult> {
  const isDemo = !_repoId || _repoId === 'my-store' || _repoId === 'repo-1' || _repoId === 'default';

  if (isDemo && USE_MOCKS) {
    await simulateDelay();
    checkSimulatedError();

    const { forceEmpty } = getMockControlsState();
    if (forceEmpty) {
      return { query, matches: [], total: 0 };
    }

    return mockSearch(query);
  }

  const res = await fetch(
    `/api/repos/${encodeURIComponent(_repoId || 'default')}/search?q=${encodeURIComponent(query)}`
  );
  if (!res.ok) throw await res.json();
  return res.json();
}

/**
 * Retrieve high-level codebase statistics derived from indexed data.
 */
export async function getRepoStats(_repoId?: string): Promise<RepoStats> {
  const isDemo = !_repoId || _repoId === 'my-store' || _repoId === 'repo-1' || _repoId === 'default';

  if (isDemo && USE_MOCKS) {
    await simulateDelay();
    checkSimulatedError();

    const { forceEmpty } = getMockControlsState();
    if (forceEmpty) {
      return {
        files_count: 0,
        symbols_count: 0,
        edges_count: 0,
        unresolved_edges_count: 0,
        languages: [],
      };
    }

    return mockGetStats();
  }

  const cleanId = _repoId || 'default';
  const res = await fetch(`/api/repos/${encodeURIComponent(cleanId)}/graph/stats`);
  if (!res.ok) {
    let msg = `Failed to fetch repository graph statistics (HTTP ${res.status})`;
    try {
      const err = await res.json();
      if (err.detail) msg = err.detail;
      else if (err.message) msg = err.message;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  const data = await res.json();
  return {
    files_count: data.files_count ?? 0,
    symbols_count: data.total_symbols ?? data.symbols_count ?? 0,
    edges_count: data.relationships_count ?? data.edges_count ?? 0,
    unresolved_edges_count: data.unresolved_edges_count ?? 0,
    languages: data.languages ?? ['Python'],
  };
}

/**
 * Raw file list for direct inspections.
 */
export async function listFiles(_repoId?: string): Promise<FileContent[]> {
  const isDemo = !_repoId || _repoId === 'my-store' || _repoId === 'repo-1' || _repoId === 'default';

  if (isDemo && USE_MOCKS) {
    await simulateDelay();
    checkSimulatedError();

    const { forceEmpty } = getMockControlsState();
    if (forceEmpty) return [];

    return MOCK_FILES;
  }

  const res = await fetch(`/api/repos/${encodeURIComponent(_repoId || 'default')}/files`);
  if (!res.ok) throw await res.json();
  return res.json();
}

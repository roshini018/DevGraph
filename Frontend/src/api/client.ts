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
const USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== 'false';

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
      return [...publicRepos, ...data];
    }
  } catch {
    // backend offline
  }

  if (!USE_MOCKS) {
    const res = await fetch('/api/repos');
    if (!res.ok) throw await res.json();
    return res.json();
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
    const res = await fetch(`/api/repos/${_repoId}/status`);
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // backend offline
  }

  if (!USE_MOCKS) {
    const res = await fetch(`/api/repos/${_repoId}/status`);
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

const GITHUB_URL_REGEX = /^(?:https?:\/\/github\.com\/)?([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?(?:\/.*)?$/;

/**
 * Validate and parse a GitHub repository URL or slug.
 */
export function validateGithubUrl(rawUrl: string): GithubUrlValidationResult {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { valid: false, error: 'Repository URL cannot be empty.' };
  }

  const match = trimmed.match(GITHUB_URL_REGEX);
  if (!match) {
    return {
      valid: false,
      error: 'Invalid GitHub URL format. Use https://github.com/owner/repo or owner/repo',
    };
  }

  const [, owner, repo] = match;
  const reservedSlugs = ['login', 'settings', 'explore', 'pricing', 'features', 'pulls', 'issues'];
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
export async function exchangeGithubCode(code: string): Promise<{
  user: { id: string; username: string; name: string; avatar_url: string };
  repositories: GithubRepo[];
}> {
  const res = await fetch('/api/auth/github/callback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to exchange GitHub authorization code.');
  }
  return await res.json();
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
      const connected: ConnectedRepo = {
        id: data.repo_id,
        repo_name: data.repo_name,
        full_name: data.full_name,
        branch: data.default_branch || 'main',
        status: {
          state: data.state,
          stage: data.stage,
          progress: data.progress,
          files_total: data.files_total || 0,
          files_done: data.files_done || 0,
          error: data.error,
          updated_at: data.updated_at,
        },
        file_count: data.files_total || 0,
        symbol_count: data.symbols_count || 0,
        edge_count: data.edges_count || 0,
        language: data.language || 'Python',
        updated_at: data.updated_at,
      };
      PUBLIC_REPOS_STORE.set(data.repo_id, { repo: connected, status: connected.status });
      return connected;
    } else if (backendRes.status === 422 || backendRes.status === 404 || backendRes.status === 400) {
      const err = await backendRes.json();
      throw new Error(err.detail || 'Repository validation failed');
    }
  } catch (err: any) {
    // If it's a known validation error from backend, rethrow it
    if (err?.message && !err.message.includes('fetch')) {
      throw err;
    }
    // Otherwise fallback to client-side GitHub API validation
  }

  // Client-side fallback: check GitHub public API directly
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
    state: 'queued',
    stage: `Queued: Ingesting public repository ${owner}/${repo}`,
    progress: 10,
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

  // Simulate realistic multi-stage processing pipeline for client-side fallback
  setTimeout(() => {
    updatePublicRepoStatus(repoId, {
      state: 'fetching',
      stage: `Fetching file tree from branch '${meta.default_branch || 'main'}'...`,
      progress: 30,
      files_total: 24,
      files_done: 6,
    });
  }, 1000);

  setTimeout(() => {
    updatePublicRepoStatus(repoId, {
      state: 'parsing',
      stage: 'Parsing Python AST symbols (classes, functions, decorators)...',
      progress: 55,
      files_total: 24,
      files_done: 18,
    });
  }, 2200);

  setTimeout(() => {
    updatePublicRepoStatus(repoId, {
      state: 'graphing',
      stage: 'Building dependency graph and symbol call hierarchy...',
      progress: 80,
      files_total: 24,
      files_done: 24,
    });
  }, 3400);

  setTimeout(() => {
    updatePublicRepoStatus(repoId, {
      state: 'embedding',
      stage: 'Indexing code chunks for semantic and hybrid search...',
      progress: 95,
      files_total: 24,
      files_done: 24,
    });
  }, 4400);

  setTimeout(() => {
    updatePublicRepoStatus(repoId, {
      state: 'ready',
      stage: `Repository ${owner}/${repo} successfully indexed. Ready for analysis.`,
      progress: 100,
      files_total: 24,
      files_done: 24,
    });
  }, 5400);

  return newConnectedRepo;
}

function updatePublicRepoStatus(repoId: string, partial: Partial<IndexStatus>) {
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
  if (!USE_MOCKS) {
    const res = await fetch(`/api/repos/${_repoId || 'default'}/tree`);
    if (!res.ok) throw await res.json();
    return res.json();
  }

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

/**
 * Retrieve file source content by path.
 */
export async function getFile(path: string, _repoId?: string): Promise<FileContent> {
  if (!USE_MOCKS) {
    const res = await fetch(`/api/repos/${_repoId || 'default'}/file?path=${encodeURIComponent(path)}`);
    if (!res.ok) throw await res.json();
    return res.json();
  }

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

/**
 * Retrieve dependency graph (symbol-level or aggregated file-level).
 */
export async function getGraph(
  type: 'symbol' | 'file' = 'symbol',
  _repoId?: string
): Promise<GraphData> {
  if (!USE_MOCKS) {
    const res = await fetch(`/api/repos/${_repoId || 'default'}/graph?type=${type}`);
    if (!res.ok) throw await res.json();
    return res.json();
  }

  await simulateDelay();
  checkSimulatedError();

  const { forceEmpty } = getMockControlsState();
  if (forceEmpty) {
    return { nodes: [], edges: [] };
  }

  return type === 'file' ? mockGetFileGraph() : mockGetSymbolGraph();
}

/**
 * Get detailed metadata and connections for a specific node.
 */
export async function getNodeDetail(nodeId: string, _repoId?: string): Promise<NodeDetail> {
  if (!USE_MOCKS) {
    const res = await fetch(`/api/repos/${_repoId || 'default'}/node/${nodeId}`);
    if (!res.ok) throw await res.json();
    return res.json();
  }

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

/**
 * Calculate path connectivity between two symbols.
 */
export async function getConnection(
  sourceId: string,
  targetId: string,
  _repoId?: string
): Promise<ConnectionResult> {
  if (!USE_MOCKS) {
    const res = await fetch(
      `/api/repos/${_repoId || 'default'}/connection?source=${sourceId}&target=${targetId}`
    );
    if (!res.ok) throw await res.json();
    return res.json();
  }

  await simulateDelay();
  checkSimulatedError();

  return mockGetConnection(sourceId, targetId);
}

/**
 * Run impact analysis for modified target symbols/files.
 */
export async function getImpact(
  targetIds: string[],
  depth: number = 3,
  _repoId?: string
): Promise<ImpactResult> {
  if (!USE_MOCKS) {
    const res = await fetch(`/api/repos/${_repoId || 'default'}/impact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targets: targetIds, depth }),
    });
    if (!res.ok) throw await res.json();
    return res.json();
  }

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

/**
 * Ask AI question regarding codebase with citations.
 */
export async function ask(question: string, _repoId?: string): Promise<AskResult> {
  if (!USE_MOCKS) {
    const res = await fetch(`/api/repos/${_repoId || 'default'}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
    if (!res.ok) throw await res.json();
    return res.json();
  }

  await simulateDelay();
  checkSimulatedError();

  return mockAsk(question);
}

/**
 * Search across symbols, files, and code.
 */
export async function search(query: string, _repoId?: string): Promise<SearchResult> {
  if (!USE_MOCKS) {
    const res = await fetch(
      `/api/repos/${_repoId || 'default'}/search?q=${encodeURIComponent(query)}`
    );
    if (!res.ok) throw await res.json();
    return res.json();
  }

  await simulateDelay();
  checkSimulatedError();

  const { forceEmpty } = getMockControlsState();
  if (forceEmpty) {
    return { query, matches: [], total: 0 };
  }

  return mockSearch(query);
}

/**
 * Retrieve high-level codebase statistics derived from indexed data.
 */
export async function getRepoStats(_repoId?: string): Promise<RepoStats> {
  if (!USE_MOCKS) {
    const res = await fetch(`/api/repos/${_repoId || 'default'}/stats`);
    if (!res.ok) throw await res.json();
    return res.json();
  }

  await simulateDelay();
  checkSimulatedError();

  return mockGetStats();
}

/**
 * Raw file list for direct inspections.
 */
export async function listFiles(_repoId?: string): Promise<FileContent[]> {
  if (!USE_MOCKS) {
    const res = await fetch(`/api/repos/${_repoId || 'default'}/files`);
    if (!res.ok) throw await res.json();
    return res.json();
  }

  await simulateDelay();
  checkSimulatedError();

  const { forceEmpty } = getMockControlsState();
  if (forceEmpty) return [];

  return MOCK_FILES;
}

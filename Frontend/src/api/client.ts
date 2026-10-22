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
  if (!USE_MOCKS) {
    const res = await fetch('/api/repos');
    if (!res.ok) throw await res.json();
    return res.json();
  }

  await simulateDelay();
  checkSimulatedError();

  const { forceEmpty } = getMockControlsState();
  if (forceEmpty) return [];

  return [MOCK_CONNECTED_REPO];
}

/**
 * Get current indexing status and progress for a repository.
 */
export async function getIndexStatus(_repoId: string = 'repo-1'): Promise<IndexStatus> {
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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  analyzePublicRepo,
  validateGithubUrl,
  getFileTree,
  getFile,
  checkSession,
  logoutGithub,
  exchangeGithubCode,
  listRepos,
  clearRegisteredPublicRepos,
  getGraph,
  getRepoStats,
  mapBackendGraphToFrontend,
} from './client';

describe('Public Repository Submission Flow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearRegisteredPublicRepos();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('validateGithubUrl', () => {
    it('validates a standard HTTPS GitHub repository URL', () => {
      const res = validateGithubUrl('https://github.com/pallets/flask');
      expect(res.valid).toBe(true);
      expect(res.owner).toBe('pallets');
      expect(res.repo).toBe('flask');
      expect(res.cleanUrl).toBe('https://github.com/pallets/flask');
    });

    it('validates an owner/repo slug format', () => {
      const res = validateGithubUrl('octocat/Hello-World');
      expect(res.valid).toBe(true);
      expect(res.owner).toBe('octocat');
      expect(res.repo).toBe('Hello-World');
      expect(res.cleanUrl).toBe('https://github.com/octocat/Hello-World');
    });

    it('rejects empty or whitespace input', () => {
      const res = validateGithubUrl('   ');
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/cannot be empty/i);
    });

    it('rejects invalid or non-GitHub URLs', () => {
      const res = validateGithubUrl('https://gitlab.com/owner/repo');
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/only github repositories/i);
    });

    it('rejects URLs with embedded credentials', () => {
      const res = validateGithubUrl('https://user:pass@github.com/owner/repo');
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/embedded credentials/i);
    });

    it('rejects URLs with query parameters or fragments', () => {
      const withQuery = validateGithubUrl('https://github.com/owner/repo?branch=dev');
      expect(withQuery.valid).toBe(false);
      expect(withQuery.error).toMatch(/query parameters and fragments/i);

      const withFrag = validateGithubUrl('https://github.com/owner/repo#readme');
      expect(withFrag.valid).toBe(false);
      expect(withFrag.error).toMatch(/query parameters and fragments/i);
    });

    it('rejects URLs with extra path segments', () => {
      const extra = validateGithubUrl('https://github.com/owner/repo/tree/main/src');
      expect(extra.valid).toBe(false);
      expect(extra.error).toMatch(/invalid github url format/i);
    });

    it('accepts optional .git suffix and trailing slash', () => {
      const res = validateGithubUrl('https://github.com/pallets/flask.git/');
      expect(res.valid).toBe(true);
      expect(res.owner).toBe('pallets');
      expect(res.repo).toBe('flask');
      expect(res.cleanUrl).toBe('https://github.com/pallets/flask');
    });
  });

  describe('analyzePublicRepo', () => {
    it('successfully processes backend 200 response with truthful pending state', async () => {
      const mockBackendResponse = {
        repo_id: 'pallets-flask',
        repo_name: 'flask',
        full_name: 'pallets/flask',
        default_branch: 'main',
        language: 'Python',
        state: 'pending',
        stage: 'Repository validated. Code parsing, graph building, and vector indexing are not yet implemented.',
        progress: 0,
        files_total: 0,
        files_done: 0,
        symbols_count: 0,
        edges_count: 0,
        error: null,
        updated_at: '2026-10-22T12:00:00Z',
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockBackendResponse,
      });
      vi.stubGlobal('fetch', fetchMock);

      const repo = await analyzePublicRepo('https://github.com/pallets/flask');

      expect(repo.id).toBe('pallets-flask');
      expect(repo.repo_name).toBe('flask');
      expect(repo.full_name).toBe('pallets/flask');
      expect(repo.status.state).toBe('pending');
      expect(repo.status.progress).toBe(0);
      expect(repo.status.stage).toContain('not yet implemented');

      // Verify POST was sent with correct endpoint and payload
      expect(fetchMock).toHaveBeenCalledWith('/api/repos/public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://github.com/pallets/flask' }),
      });
    });

    it('handles sparse backend responses gracefully without assuming fields exist', async () => {
      // Backend returns minimal response with some missing fields
      const minimalResponse = {
        state: 'pending',
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => minimalResponse,
      });
      vi.stubGlobal('fetch', fetchMock);

      const repo = await analyzePublicRepo('https://github.com/octocat/Spoon-Knife');

      expect(repo.id).toBe('octocat-spoon-knife');
      expect(repo.repo_name).toBe('Spoon-Knife');
      expect(repo.full_name).toBe('octocat/Spoon-Knife');
      expect(repo.branch).toBe('main');
      expect(repo.language).toBe('Unknown');
      expect(repo.status.state).toBe('pending');
      expect(repo.status.progress).toBe(0);
      expect(repo.status.stage).toBeDefined();
    });

    it('throws clear error message when backend returns 400 private repo error', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          detail: "Repository 'owner/secret' is private. Private repositories require GitHub OAuth connection.",
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      await expect(analyzePublicRepo('https://github.com/owner/secret')).rejects.toThrow(
        /private repositories require github oauth connection/i
      );
    });

    it('throws clear error message when backend returns 404 repo not found', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({
          detail: "Repository 'unknown/missing' was not found on GitHub.",
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      await expect(analyzePublicRepo('https://github.com/unknown/missing')).rejects.toThrow(
        /was not found on github/i
      );
    });

    it('handles FastAPI 422 validation error arrays cleanly', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          detail: [{ loc: ['body', 'url'], msg: 'Field required', type: 'missing' }],
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      await expect(analyzePublicRepo('https://github.com/owner/repo')).rejects.toThrow(
        /field required/i
      );
    });

    it('handles 502 rate limit error cleanly', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => ({
          detail: 'GitHub API rate limit exceeded. Please try again later.',
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      await expect(analyzePublicRepo('https://github.com/owner/repo')).rejects.toThrow(
        /rate limit exceeded/i
      );
    });
  });

  describe('getFileTree for real repos', () => {
    it('calls backend /api/repos/{repo_id}/tree without mock fallback', async () => {
      const mockTree = {
        id: 'root',
        name: 'repo',
        path: '',
        type: 'directory',
        children: [
          { id: 'file-1', name: 'main.py', path: 'main.py', type: 'file', language: 'python' },
        ],
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockTree,
      });
      vi.stubGlobal('fetch', fetchMock);

      const tree = await getFileTree('octocat__Hello-World');
      expect(fetchMock).toHaveBeenCalledWith('/api/repos/octocat__Hello-World/tree');
      expect(tree.children?.length).toBe(1);
      expect(tree.children?.[0].name).toBe('main.py');
    });

    it('throws error when backend returns 404 for tree', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ detail: 'Repository not found.' }),
      });
      vi.stubGlobal('fetch', fetchMock);

      await expect(getFileTree('octocat__missing')).rejects.toThrow(/repository not found/i);
    });
  });

  describe('getFile for real repos', () => {
    it('calls backend /api/repos/{repo_id}/file?path=... without mock fallback', async () => {
      const mockFile = {
        path: 'src/main.py',
        content: 'print("hello")',
        size_bytes: 14,
        lines: 1,
        language: 'python',
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockFile,
      });
      vi.stubGlobal('fetch', fetchMock);

      const file = await getFile('src/main.py', 'octocat__Hello-World');
      expect(fetchMock).toHaveBeenCalledWith('/api/repos/octocat__Hello-World/file?path=src%2Fmain.py');
      expect(file.content).toBe('print("hello")');
    });

    it('throws error when file is binary or too large', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ detail: 'Cannot view binary file.' }),
      });
      vi.stubGlobal('fetch', fetchMock);

      await expect(getFile('image.png', 'octocat__Hello-World')).rejects.toThrow(/cannot view binary file/i);
    });
  });

  describe('OAuth session and callback', () => {
    it('checkSession returns user info on 200', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          authenticated: true,
          user: { id: '1', username: 'octocat', name: 'Mona Lisa', avatar_url: 'https://example.com/avatar.png' },
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const session = await checkSession();
      expect(session.authenticated).toBe(true);
      expect(session.user?.username).toBe('octocat');
    });

    it('checkSession returns unauthenticated on 401', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      });
      vi.stubGlobal('fetch', fetchMock);

      const session = await checkSession();
      expect(session.authenticated).toBe(false);
      expect(session.user).toBeNull();
    });

    it('logoutGithub sends POST /api/auth/logout', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ message: 'Logged out successfully' }),
      });
      vi.stubGlobal('fetch', fetchMock);

      await logoutGithub();
      expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
    });

    it('exchangeGithubCode sends code and state to callback', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          user: { id: '1', username: 'octocat', name: 'Mona Lisa', avatar_url: 'https://example.com/avatar.png' },
          repositories: [],
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await exchangeGithubCode('code123', 'state456');
      expect(fetchMock).toHaveBeenCalledWith('/api/auth/github/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'code123', state: 'state456' }),
      });
      expect(result.user.username).toBe('octocat');
    });
  });

  describe('Repository Owner & Canonical Slug Integrity', () => {
    it('uses actual full_name roshinireddy/MyPortfolio and preserves owner, not github/myportfolio', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [
          {
            id: 9999,
            name: 'MyPortfolio',
            full_name: 'roshinireddy/MyPortfolio',
            owner: 'roshinireddy',
            private: false,
            default_branch: 'main',
          },
        ],
      });
      vi.stubGlobal('fetch', fetchMock);

      const repos = await listRepos();
      const myPortfolio = repos.find(r => r.repo_name === 'MyPortfolio');
      expect(myPortfolio).toBeDefined();
      expect(myPortfolio?.full_name).toBe('roshinireddy/MyPortfolio');
      expect(myPortfolio?.id).toBe('roshinireddy/MyPortfolio');
      expect((myPortfolio as any).owner).toBe('roshinireddy');
      expect(myPortfolio?.full_name).not.toContain('github/');
    });

    it('selecting another owner repository uses that repository actual full_name', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [
          {
            id: 8888,
            name: 'flask',
            full_name: 'pallets/flask',
            owner: { login: 'pallets' },
            private: false,
            default_branch: 'main',
          },
        ],
      });
      vi.stubGlobal('fetch', fetchMock);

      const repos = await listRepos();
      const flaskRepo = repos.find(r => r.repo_name === 'flask');
      expect(flaskRepo).toBeDefined();
      expect(flaskRepo?.full_name).toBe('pallets/flask');
      expect(flaskRepo?.id).toBe('pallets/flask');
      expect((flaskRepo as any).owner).toBe('pallets');
    });

    it('tree and file-content requests use the exact same canonical identifier', async () => {
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/tree')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ id: 'root', name: 'MyPortfolio', path: '', type: 'directory', children: [] }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ path: 'src/app.py', content: 'code', size_bytes: 4, lines: 1, language: 'python' }),
        });
      });
      vi.stubGlobal('fetch', fetchMock);

      const canonicalSlug = 'roshinireddy/MyPortfolio';
      await getFileTree(canonicalSlug);
      expect(fetchMock).toHaveBeenCalledWith('/api/repos/roshinireddy%2FMyPortfolio/tree');

      await getFile('src/app.py', canonicalSlug);
      expect(fetchMock).toHaveBeenCalledWith('/api/repos/roshinireddy%2FMyPortfolio/file?path=src%2Fapp.py');
    });

    it('missing owner metadata produces a clear error rather than a fabricated slug', async () => {
      // In real backend mode (when USE_MOCKS is not active for the repo), passing a bare name throws
      await expect(getFileTree('unknown-bare-repo')).rejects.toThrow(
        /missing owner metadata/i
      );
      await expect(getFile('index.ts', 'unknown-bare-repo')).rejects.toThrow(
        /missing owner metadata/i
      );
    });
  });

  describe('Neo4j Knowledge Graph Integration', () => {
    it('mapBackendGraphToFrontend maps raw Neo4j response to frontend GraphData', () => {
      const backendPayload = {
        repo_id: 'pallets/flask',
        nodes: [
          {
            id: 'pallets/flask:examples/app.py',
            label: 'app.py',
            kind: 'file',
            file: 'examples/app.py',
            language: 'Python',
          },
          {
            id: 'pallets/flask:examples/app.py:function:create_app',
            label: 'create_app',
            kind: 'function',
            file: 'examples/app.py',
            start_line: 10,
            end_line: 25,
            signature: 'def create_app():',
            docstring: 'Create application instance',
          },
        ],
        edges: [
          {
            id: 'e1',
            source: 'pallets/flask:examples/app.py',
            target: 'pallets/flask:examples/app.py:function:create_app',
            kind: 'DEFINES',
            properties: { line: 10 },
          },
        ],
        total_nodes: 2,
        total_edges: 1,
      };

      const result = mapBackendGraphToFrontend(backendPayload, 'file');
      expect(result.nodes).toHaveLength(2);
      expect(result.nodes[0].id).toBe('pallets/flask:examples/app.py');
      expect(result.nodes[0].kind).toBe('file');
      expect(result.nodes[0].file).toBe('examples/app.py');

      expect(result.nodes[1].label).toBe('create_app');
      expect(result.nodes[1].kind).toBe('function');
      expect(result.nodes[1].start_line).toBe(10);
      expect(result.nodes[1].description).toBe('Create application instance');

      expect(result.edges).toHaveLength(1);
      expect(result.edges[0].source).toBe('pallets/flask:examples/app.py');
      expect(result.edges[0].target).toBe('pallets/flask:examples/app.py:function:create_app');
      expect(result.edges[0].line).toBe(10);
      expect(result.edges[0].resolved).toBe(true);
    });

    it('mapBackendGraphToFrontend handles empty and sparse backend payloads', () => {
      expect(mapBackendGraphToFrontend(null)).toEqual({ nodes: [], edges: [] });
      expect(mapBackendGraphToFrontend({})).toEqual({ nodes: [], edges: [] });
      expect(mapBackendGraphToFrontend({ nodes: [], edges: [] })).toEqual({ nodes: [], edges: [] });
    });

    it('getGraph forwards repository identifier encoded to /api/repos/{repo_id}/graph', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          repo_id: 'pallets/flask',
          nodes: [
            {
              id: 'pallets/flask:src/main.py',
              label: 'main.py',
              kind: 'file',
              file: 'src/main.py',
            },
          ],
          edges: [],
          total_nodes: 1,
          total_edges: 0,
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const graph = await getGraph('pallets/flask', 'file');

      expect(fetchMock).toHaveBeenCalledWith('/api/repos/pallets%2Fflask/graph?limit=1000');
      expect(graph.nodes).toHaveLength(1);
      expect(graph.nodes[0].file).toBe('src/main.py');
    });

    it('getRepoStats calls /api/repos/{repo_id}/graph/stats and normalizes field names', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          repo_id: 'pallets/flask',
          files_count: 5,
          total_symbols: 26,
          relationships_count: 44,
          unresolved_edges_count: 2,
          languages: ['Python'],
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const stats = await getRepoStats('pallets/flask');

      expect(fetchMock).toHaveBeenCalledWith('/api/repos/pallets%2Fflask/graph/stats');
      expect(stats.files_count).toBe(5);
      expect(stats.symbols_count).toBe(26);
      expect(stats.edges_count).toBe(44);
      expect(stats.unresolved_edges_count).toBe(2);
      expect(stats.languages).toEqual(['Python']);
    });
  });
});

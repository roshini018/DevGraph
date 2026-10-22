import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  ArrowRight,
  RefreshCw,
  Lock,
  Globe,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import {
  listRepos,
  analyzePublicRepo,
  validateGithubUrl,
} from '../api/client';
import type { ConnectedRepo } from '../types/api';
import { useAppStore } from '../store/useAppStore';
import { StatusDot } from '../components/ui/StatusDot';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';
import { Dialog } from '../components/ui/Dialog';

const GithubIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
    />
  </svg>
);

export interface ExtendedRepoItem {
  id: string;
  full_name: string;
  repo_name: string;
  owner: string;
  description?: string;
  language: string;
  is_private: boolean;
  updated_at: string;
  status: 'ready' | 'indexing' | 'failed' | 'not_indexed';
  file_count?: number;
  symbol_count?: number;
}

export const ReposPage: React.FC = () => {
  const navigate = useNavigate();
  const { setSelectedRepo, user, disconnectGithub, setActiveFile } = useAppStore();
  // Helper: clear workspace state that belongs to the previous repo
  const clearWorkspaceState = () => {
    // We only need to clear the activeFile; the explorer will reload from
    // the real tree once the new repo is selected.  Tabs are per-repo
    // content and should not carry over.
    setActiveFile(null);
  };

  const [connectedRepos, setConnectedRepos] = useState<ConnectedRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [languageFilter, setLanguageFilter] = useState('all');

  // Option 2: Public Repository URL State
  const [publicRepoUrl, setPublicRepoUrl] = useState('');
  const [publicUrlError, setPublicUrlError] = useState<string | null>(null);
  const [isAnalyzingPublic, setIsAnalyzingPublic] = useState(false);
  const [publicSuccessMsg, setPublicSuccessMsg] = useState<string | null>(null);

  // Simulated state override for testing prompt states
  const [simulatedState, setSimulatedState] = useState<'normal' | 'skeleton' | 'empty' | 'no_results' | 'error'>('normal');

  // Indexing confirmation modal state
  const [confirmModalRepo, setConfirmModalRepo] = useState<ExtendedRepoItem | null>(null);

  const handleAnalyzePublicRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAnalyzingPublic) return;

    setPublicUrlError(null);
    setPublicSuccessMsg(null);

    const validation = validateGithubUrl(publicRepoUrl);
    if (!validation.valid) {
      setPublicUrlError(validation.error || 'Please enter a valid GitHub repository URL.');
      return;
    }

    setIsAnalyzingPublic(true);
    try {
      const connected = await analyzePublicRepo(publicRepoUrl);
      setConnectedRepos(prev => [connected, ...prev]);
      clearWorkspaceState();
      setSelectedRepo(connected);
      // Navigate using the full_name slug (owner/repo) so the backend
      // _resolve_public_repo can resolve it via owner/repo path split.
      navigate(`/w/${encodeURIComponent(connected.full_name)}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to analyze repository.';
      setPublicUrlError(msg);
    } finally {
      setIsAnalyzingPublic(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const connected = await listRepos();
      setConnectedRepos(connected);
    } catch (err: unknown) {
      const errorMsg =
        err && typeof err === 'object' && 'error' in err
          ? (err as { error: { message: string } }).error.message
          : 'Failed to fetch repositories from GitHub';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    listRepos()
      .then(connected => {
        if (!cancelled) setConnectedRepos(connected);
      })
      .catch(err => {
        if (!cancelled) {
          const errorMsg =
            err && typeof err === 'object' && 'error' in err
              ? (err as { error: { message: string } }).error.message
              : 'Failed to fetch repositories from GitHub';
          setError(errorMsg);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Consolidate into Vercel-style unified repository list
  const allRepoItems = useMemo<ExtendedRepoItem[]>(() => {
    const items: ExtendedRepoItem[] = [];

    // 1. Indexed connected repo: acme/my-store (Ready)
    items.push({
      id: 'repo-my-store',
      full_name: 'acme/my-store',
      repo_name: 'my-store',
      owner: 'acme',
      description: 'E-commerce microservice backend with checkout, payment processing, and inventory AST hierarchy.',
      language: 'Python',
      is_private: false,
      updated_at: '2 hours ago',
      status: 'ready',
      file_count: 16,
      symbol_count: 54,
    });

    // 2. acme/data-pipeline (Indexing state)
    items.push({
      id: 'repo-data-pipeline',
      full_name: 'acme/data-pipeline',
      repo_name: 'data-pipeline',
      owner: 'acme',
      description: 'Streaming ETL data pipeline and AST schema ingestion workflows.',
      language: 'Python',
      is_private: true,
      updated_at: 'Yesterday',
      status: 'indexing',
      file_count: 24,
      symbol_count: 72,
    });

    // 3. acme/payments-worker (Not indexed state)
    items.push({
      id: 'repo-payments-worker',
      full_name: 'acme/payments-worker',
      repo_name: 'payments-worker',
      owner: 'acme',
      description: 'Stripe webhook listener and background payment reconciliation worker.',
      language: 'Python',
      is_private: true,
      updated_at: '3 days ago',
      status: 'not_indexed',
    });

    // 4. acme/analytics-service (Failed state)
    items.push({
      id: 'repo-analytics-service',
      full_name: 'acme/analytics-service',
      repo_name: 'analytics-service',
      owner: 'acme',
      description: 'Customer event tracking and conversion analytics service.',
      language: 'Python',
      is_private: false,
      updated_at: '5 days ago',
      status: 'failed',
    });

    // 5. acme/store-frontend (TypeScript - Not indexed)
    items.push({
      id: 'repo-store-frontend',
      full_name: 'acme/store-frontend',
      repo_name: 'store-frontend',
      owner: 'acme',
      description: 'React + Vite storefront application.',
      language: 'TypeScript',
      is_private: false,
      updated_at: '1 week ago',
      status: 'not_indexed',
    });

    // Any newly ingested or connected repositories
    connectedRepos.forEach(cr => {
      if (!items.some(it => it.full_name === cr.full_name || it.id === cr.id)) {
        const parts = cr.full_name ? cr.full_name.split('/') : [];
        const owner = parts.length > 1 ? parts[0] : '';
        const name = parts.length > 1 ? parts.slice(1).join('/') : cr.repo_name;
        items.unshift({
          id: cr.full_name,
          full_name: cr.full_name,
          repo_name: name,
          owner: owner,
          description: `Repository (${cr.language}) connected via GitHub.`,
          language: cr.language,
          is_private: Boolean((cr as { private?: boolean; is_private?: boolean }).private ?? (cr as { private?: boolean; is_private?: boolean }).is_private ?? false),
          updated_at: 'Just now',
          status: cr.status.state === 'ready' ? 'ready' : cr.status.state === 'failed' ? 'failed' : 'indexing',
          file_count: cr.file_count,
          symbol_count: cr.symbol_count,
        });
      }
    });

    return items;
  }, [connectedRepos]);

  // Filtered repositories
  const filteredRepos = useMemo(() => {
    if (simulatedState === 'empty') return [];
    if (simulatedState === 'no_results') return [];

    return allRepoItems.filter(repo => {
      const matchesSearch =
        repo.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (repo.description && repo.description.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesLang =
        languageFilter === 'all' ||
        repo.language.toLowerCase() === languageFilter.toLowerCase();

      return matchesSearch && matchesLang;
    });
  }, [allRepoItems, searchQuery, languageFilter, simulatedState]);

  const handleOpenWorkspace = (repo: ExtendedRepoItem) => {
    // Find the matching ConnectedRepo (if any) and set it in the store.
    const match = connectedRepos.find(
      r => r.full_name === repo.full_name || r.repo_name === repo.repo_name
    );
    // Build a minimal ConnectedRepo from the ExtendedRepoItem if no match exists
    const connectedRepo = match ?? {
      id: repo.full_name,
      repo_name: repo.repo_name,
      full_name: repo.full_name,
      branch: 'main',
      status: { state: 'ready', stage: '', progress: 100, files_total: 0, files_done: 0, error: null, updated_at: new Date().toISOString() },
      file_count: repo.file_count ?? 0,
      symbol_count: repo.symbol_count ?? 0,
      edge_count: 0,
      language: repo.language,
      updated_at: repo.updated_at,
    };
    // Clear stale workspace state from the previous repo before switching
    clearWorkspaceState();
    setSelectedRepo(connectedRepo);
    // Navigate using the full_name slug (owner/repo) which the backend can
    // resolve natively via _resolve_public_repo.
    navigate(`/w/${encodeURIComponent(repo.full_name)}`);
  };

  const handleConfirmStartIndexing = () => {
    if (!confirmModalRepo) return;
    const repo = confirmModalRepo;
    setConfirmModalRepo(null);
    navigate(`/repos/${encodeURIComponent(repo.full_name)}/indexing`);
  };

  const getLanguageColor = (lang: string) => {
    switch (lang.toLowerCase()) {
      case 'python':
        return '#00EA64';
      case 'typescript':
        return '#3178C6';
      case 'go':
        return '#00ADD8';
      default:
        return '#A1A1A1';
    }
  };

  const isCurrentSkeleton = loading || simulatedState === 'skeleton';
  const isCurrentError = (error && !loading) || simulatedState === 'error';
  const isCurrentEmpty = (!isCurrentSkeleton && !isCurrentError && simulatedState === 'empty');
  const isCurrentNoResults = (!isCurrentSkeleton && !isCurrentError && !isCurrentEmpty && (filteredRepos.length === 0 || simulatedState === 'no_results'));

  return (
    <div className="min-h-screen bg-bg text-text font-sans p-6 sm:p-10 max-w-5xl mx-auto space-y-6 select-none">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-line">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">
            Import Git Repository
          </h1>
          <p className="text-xs text-subtle mt-1">
            Connect public or private repositories to generate AST symbol hierarchies and blast-radius impact trees.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-surface border border-line text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-green-bright" />
            <span className="text-text">@{user?.username?.replace(/varun/gi, 'roshini') || 'roshinireddy'}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              disconnectGithub();
              navigate('/connect');
            }}
          >
            Disconnect
          </Button>
        </div>
      </div>

      {/* Option 2: Public Repository URL Ingestion Box */}
      <div className="p-5 rounded-lg border border-line bg-surface space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-green-bright font-semibold">
              Public Repository Analysis
            </div>
            <h2 className="text-sm font-semibold text-text mt-0.5">
              Analyze any public GitHub repository without OAuth
            </h2>
          </div>
          <span className="text-[11px] font-mono text-subtle">
            Python 3.9+ AST extraction
          </span>
        </div>

        <form onSubmit={handleAnalyzePublicRepo} className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <GithubIcon className="w-4 h-4 text-subtle absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={publicRepoUrl}
              disabled={isAnalyzingPublic}
              onChange={e => {
                setPublicRepoUrl(e.target.value);
                if (publicUrlError) setPublicUrlError(null);
              }}
              placeholder="https://github.com/owner/repository (e.g. pallets/flask)"
              className={`w-full bg-raised border rounded-md pl-9 pr-3 py-2 text-xs text-text placeholder:text-subtle font-mono outline-none transition-colors ${
                publicUrlError
                  ? 'border-danger focus:border-danger'
                  : 'border-line hover:border-line-strong focus:border-green-bright'
              } ${isAnalyzingPublic ? 'opacity-60 cursor-not-allowed' : ''}`}
            />
          </div>
          <Button
            type="submit"
            variant="white"
            size="md"
            loading={isAnalyzingPublic}
            disabled={!publicRepoUrl.trim() || isAnalyzingPublic}
            rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
          >
            Analyze Repository
          </Button>
        </form>

        {publicUrlError && (
          <div className="p-3 rounded bg-danger/10 border border-danger/30 text-xs text-danger flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-medium">Repository Error</span>
              <p className="text-[11px] leading-relaxed text-danger/90">{publicUrlError}</p>
            </div>
          </div>
        )}

        {publicSuccessMsg && (
          <div className="p-3 rounded bg-green-soft border border-green/30 text-xs text-green-bright flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{publicSuccessMsg}</span>
            </div>
            <span className="text-[10px] font-mono uppercase bg-green/20 px-2 py-0.5 rounded">
              Indexing
            </span>
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-subtle absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search repositories..."
            className="w-full bg-surface border border-line hover:border-line-strong focus:border-green-bright rounded-md pl-9 pr-3 py-1.5 text-xs text-text placeholder:text-subtle font-mono outline-none transition-colors"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Language filter */}
          <div className="flex items-center gap-1.5 text-xs font-mono">
            <select
              value={languageFilter}
              onChange={e => setLanguageFilter(e.target.value)}
              className="bg-surface border border-line hover:border-line-strong focus:border-green-bright rounded-md px-2.5 py-1.5 text-xs text-text font-mono outline-none cursor-pointer"
            >
              <option value="all">All Languages</option>
              <option value="python">Python</option>
              <option value="typescript">TypeScript</option>
              <option value="go">Go</option>
            </select>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={fetchData}
            leftIcon={<RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* State View 1: Skeleton */}
      {isCurrentSkeleton && (
        <div className="border border-line rounded-lg divide-y divide-line bg-surface overflow-hidden">
          {[1, 2, 3, 4].map(idx => (
            <div key={idx} className="p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1">
                <Skeleton className="w-9 h-9 rounded bg-raised" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-4 w-48 rounded" />
                  <Skeleton className="h-3 w-80 rounded" />
                </div>
              </div>
              <Skeleton className="h-8 w-24 rounded" />
            </div>
          ))}
        </div>
      )}

      {/* State View 2: Error */}
      {isCurrentError && (
        <ErrorState
          title="Could not load repositories"
          whatHappened={error || 'Simulated API connection failure.'}
          nextStep="Verify your GitHub OAuth token and network connection, then retry."
          onRetry={fetchData}
        />
      )}

      {/* State View 3: Empty */}
      {isCurrentEmpty && (
        <EmptyState
          title="No repositories connected"
          description="Your GitHub account does not have any repositories yet. Create or fork a repository to get started."
          actionLabel="Refresh list"
          onAction={fetchData}
        />
      )}

      {/* State View 4: No Results */}
      {isCurrentNoResults && (
        <div className="p-10 border border-line rounded-lg bg-surface text-center space-y-3 font-sans">
          <AlertCircle className="w-6 h-6 text-subtle mx-auto" />
          <h3 className="text-sm font-semibold text-text">No repositories match your filter</h3>
          <p className="text-xs text-subtle max-w-sm mx-auto">
            No repositories found matching &ldquo;{searchQuery || languageFilter}&rdquo;. Try clearing your query or language filter.
          </p>
          <div className="pt-1">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setSearchQuery('');
                setLanguageFilter('all');
                setSimulatedState('normal');
              }}
            >
              Clear filters
            </Button>
          </div>
        </div>
      )}

      {/* State View 5: Normal Vercel-Style Bordered List */}
      {!isCurrentSkeleton && !isCurrentError && !isCurrentEmpty && !isCurrentNoResults && (
        <div className="border border-line rounded-lg divide-y divide-line bg-surface overflow-hidden shadow-sm">
          {filteredRepos.map(repo => {
            const initial = repo.repo_name.charAt(0).toUpperCase();

            return (
              <div
                key={repo.id}
                className="p-4 sm:p-4.5 hover:bg-raised/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-sans"
              >
                {/* Left info: Avatar, owner/name, language dot, private/public pill, relative date, status dot */}
                <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                  {/* Repo Initial Avatar */}
                  <div className="w-9 h-9 rounded bg-raised border border-line flex items-center justify-center font-mono font-bold text-xs text-text shrink-0">
                    {initial}
                  </div>

                  <div className="space-y-1 min-w-0">
                    {/* Owner/Name & Pills */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-text text-sm tracking-tight truncate">
                        {repo.full_name}
                      </span>

                      {/* Private / Public Pill */}
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-raised border border-line text-[10px] font-mono text-subtle">
                        {repo.is_private ? (
                          <>
                            <Lock className="w-2.5 h-2.5" />
                            <span>Private</span>
                          </>
                        ) : (
                          <>
                            <Globe className="w-2.5 h-2.5" />
                            <span>Public</span>
                          </>
                        )}
                      </span>

                      {/* Status Dot */}
                      <div className="inline-flex items-center gap-1.5 text-[11px] font-mono pl-1">
                        <StatusDot
                          status={
                            repo.status === 'ready'
                              ? 'ready'
                              : repo.status === 'indexing'
                                ? 'indexing'
                                : repo.status === 'failed'
                                  ? 'failed'
                                  : 'idle'
                          }
                        />
                        <span
                          className={`capitalize ${repo.status === 'ready'
                              ? 'text-green-bright'
                              : repo.status === 'indexing'
                                ? 'text-amber'
                                : repo.status === 'failed'
                                  ? 'text-danger'
                                  : 'text-subtle'
                            }`}
                        >
                          {repo.status === 'not_indexed' ? 'Not indexed' : repo.status}
                        </span>
                      </div>
                    </div>

                    {/* Metadata: Language dot + language, relative date, stats */}
                    <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-subtle">
                      {/* Language Dot */}
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full inline-block"
                          style={{ backgroundColor: getLanguageColor(repo.language) }}
                        />
                        <span>{repo.language}</span>
                      </span>

                      <span>•</span>
                      <span>{repo.updated_at}</span>

                      {repo.file_count && (
                        <>
                          <span>•</span>
                          <span>{repo.file_count} files</span>
                        </>
                      )}

                      {repo.symbol_count && (
                        <>
                          <span>•</span>
                          <span>{repo.symbol_count} symbols</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right-aligned Button according to status */}
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  {/* READY: 'Open' white + ghost 'Re-index' */}
                  {repo.status === 'ready' && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmModalRepo(repo)}
                      >
                        Re-index
                      </Button>
                      <Button
                        variant="white"
                        size="sm"
                        onClick={() => handleOpenWorkspace(repo)}
                        rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
                      >
                        Open
                      </Button>
                    </>
                  )}

                  {/* NOT INDEXED: 'Import' white button */}
                  {repo.status === 'not_indexed' && (
                    <Button
                      variant="white"
                      size="sm"
                      onClick={() => setConfirmModalRepo(repo)}
                      rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
                    >
                      Import
                    </Button>
                  )}

                  {/* INDEXING: 'View progress' secondary button */}
                  {repo.status === 'indexing' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => navigate(`/repos/${encodeURIComponent(repo.full_name)}/indexing`)}
                      rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
                    >
                      View progress
                    </Button>
                  )}

                  {/* FAILED: 'Retry' button */}
                  {repo.status === 'failed' && (
                    <Button
                      variant="green"
                      size="sm"
                      onClick={() => setConfirmModalRepo(repo)}
                      leftIcon={<RefreshCw className="w-3 h-3" />}
                    >
                      Retry
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirm Dialog Before Indexing */}
      {confirmModalRepo && (
        <Dialog
          isOpen={Boolean(confirmModalRepo)}
          onClose={() => setConfirmModalRepo(null)}
          title={`Index ${confirmModalRepo.full_name}?`}
          description="DevGraph will parse repository AST trees and generate deterministic call hierarchies."
          maxWidth="md"
          footer={
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirmModalRepo(null)}
              >
                Cancel
              </Button>
              <Button
                variant="white"
                size="sm"
                onClick={handleConfirmStartIndexing}
                rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
              >
                Start Indexing
              </Button>
            </>
          }
        >
          <div className="space-y-4 text-xs">
            <div className="p-3.5 rounded bg-raised border border-line space-y-2.5 font-mono">
              <div className="text-[11px] font-semibold text-text uppercase tracking-wider">
                Indexing Pre-flight Constraints
              </div>

              <div className="flex items-start gap-2 text-text">
                <span className="text-green-bright font-bold">•</span>
                <div>
                  <span className="font-semibold text-text">Python only:</span> Only Python (.py) source modules are parsed into AST definitions and call edges.
                </div>
              </div>

              <div className="flex items-start gap-2 text-text">
                <span className="text-green-bright font-bold">•</span>
                <div>
                  <span className="font-semibold text-text">Default branch only:</span> Analysis runs strictly on the default branch (<span className="text-green-bright">main</span>).
                </div>
              </div>

              <div className="flex items-start gap-2 text-text">
                <span className="text-green-bright font-bold">•</span>
                <div>
                  <span className="font-semibold text-text">File limit:</span> Maximum of 500 Python files per repository are indexed in-memory.
                </div>
              </div>
            </div>

            <p className="text-subtle text-[11px]">
              Clicking &ldquo;Start Indexing&rdquo; will initiate the build-log pipeline and extract AST dependencies.
            </p>
          </div>
        </Dialog>
      )}

    </div>
  );
};

export default ReposPage;

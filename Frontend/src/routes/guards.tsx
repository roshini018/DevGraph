import React, { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { MOCK_CONNECTED_REPO } from '../mocks/repo';
import { getRegisteredPublicRepos, listRepos } from '../api/client';
import type { ConnectedRepo } from '../types/api';
import { ErrorState } from '../components/ui/ErrorState';

/**
 * Guard: No user goes to /connect.
 * Redirects unauthenticated visitors to /connect.
 */
export const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAppStore();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/connect" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

/**
 * Guard: Validates repository slug and ensures canonical owner/repo identifier.
 * Never fabricates or hardcodes an owner (e.g. 'github'). If owner metadata is
 * missing, attempts to resolve from the authenticated repository list or shows
 * a clear error.
 */
export const RequireRepo: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { selectedRepo, setSelectedRepo, user } = useAppStore();
  const { repoId } = useParams<{ repoId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  // Decode the repoId from the URL (handles encoded slashes %2F)
  const decodedRepoId = repoId ? decodeURIComponent(repoId).trim() : undefined;

  const [resolutionError, setResolutionError] = useState<string | null>(null);
  // 'idle' = haven't started async resolution, 'pending' = waiting, 'done' = finished
  const [resolutionStatus, setResolutionStatus] = useState<'idle' | 'pending' | 'done'>('idle');
  const resolvingRef = useRef(false);

  const isInvalidSlug = Boolean(
    decodedRepoId?.includes('/') &&
      (!decodedRepoId.slice(0, decodedRepoId.indexOf('/')).trim() ||
        !decodedRepoId.slice(decodedRepoId.indexOf('/') + 1).trim())
  );

  // Determine whether this bare repo name needs async resolution.
  // This is computed synchronously and avoids calling setState in the effect body.
  const needsBareResolution = Boolean(
    decodedRepoId &&
      !isInvalidSlug &&
      !decodedRepoId.includes('/') &&
      decodedRepoId !== 'my-store' &&
      decodedRepoId !== 'acme/my-store' &&
      // Not already matched in selectedRepo
      !(
        selectedRepo &&
        selectedRepo.repo_name.toLowerCase() === decodedRepoId.toLowerCase() &&
        selectedRepo.full_name.includes('/')
      ) &&
      // Not found in public repos cache
      !getRegisteredPublicRepos().find(
        r =>
          r.repo_name.toLowerCase() === decodedRepoId.toLowerCase() &&
          r.full_name.includes('/')
      )
  );

  useEffect(() => {
    if (!decodedRepoId || isInvalidSlug) return;

    // 1. Mock demo repository
    if (decodedRepoId === 'my-store' || decodedRepoId === 'acme/my-store') {
      if (selectedRepo?.id !== MOCK_CONNECTED_REPO.id && selectedRepo?.full_name !== MOCK_CONNECTED_REPO.full_name) {
        setSelectedRepo(MOCK_CONNECTED_REPO);
      }
      return;
    }

    // 2. Canonical owner/repo slug present in URL (e.g. "roshinireddy/MyPortfolio" or "pallets/flask")
    if (decodedRepoId.includes('/')) {
      const slashIdx = decodedRepoId.indexOf('/');
      const repoName = decodedRepoId.slice(slashIdx + 1).trim();

      // If already selected and matches, we are good
      if (selectedRepo && selectedRepo.full_name === decodedRepoId) {
        return;
      }

      // Check registered public repos
      const publicRepos = getRegisteredPublicRepos();
      const foundPublic = publicRepos.find(r => r.full_name.toLowerCase() === decodedRepoId.toLowerCase());
      if (foundPublic) {
        setSelectedRepo(foundPublic);
        return;
      }

      // Construct canonical ConnectedRepo with real owner from the slug
      const synthRepo: ConnectedRepo = {
        id: decodedRepoId,
        repo_name: repoName,
        full_name: decodedRepoId,
        branch: 'main',
        status: {
          state: 'ready',
          stage: 'Repository connected',
          progress: 100,
          files_total: 0,
          files_done: 0,
          error: null,
          updated_at: new Date().toISOString(),
        },
        file_count: 0,
        symbol_count: 0,
        edge_count: 0,
        language: 'Unknown',
        updated_at: new Date().toISOString(),
      };
      setSelectedRepo(synthRepo);
      return;
    }

    // 3. Bare repository name missing owner metadata (e.g. "MyPortfolio")
    // Do NOT invent an owner like "github". First try resolving from store/cache.
    if (
      selectedRepo &&
      selectedRepo.repo_name.toLowerCase() === decodedRepoId.toLowerCase() &&
      selectedRepo.full_name.includes('/')
    ) {
      navigate(`/w/${encodeURIComponent(selectedRepo.full_name)}`, { replace: true });
      return;
    }

    const publicRepos = getRegisteredPublicRepos();
    const foundPublic = publicRepos.find(
      r => r.repo_name.toLowerCase() === decodedRepoId.toLowerCase() && r.full_name.includes('/')
    );
    if (foundPublic) {
      setSelectedRepo(foundPublic);
      navigate(`/w/${encodeURIComponent(foundPublic.full_name)}`, { replace: true });
      return;
    }

    // Resolve from authenticated user's repository list (async — only set state in callbacks)
    if (resolvingRef.current) return;
    resolvingRef.current = true;
    let isCancelled = false;

    listRepos()
      .then(repos => {
        if (isCancelled) return;
        const match = repos.find(
          r =>
            (r.repo_name.toLowerCase() === decodedRepoId.toLowerCase() ||
              r.id === decodedRepoId ||
              r.full_name.toLowerCase() === decodedRepoId.toLowerCase()) &&
            r.full_name.includes('/')
        );
        if (match) {
          setSelectedRepo(match);
          navigate(`/w/${encodeURIComponent(match.full_name)}`, { replace: true });
        } else {
          setResolutionError(
            `Repository "${decodedRepoId}" is missing owner metadata. Please select an authenticated repository (format: owner/repo).`
          );
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setResolutionError(
            `Repository "${decodedRepoId}" is missing owner metadata. Please select an authenticated repository (format: owner/repo).`
          );
        }
      })
      .finally(() => {
        if (!isCancelled) {
          resolvingRef.current = false;
          setResolutionStatus('done');
        }
      });

    return () => {
      isCancelled = true;
      resolvingRef.current = false;
    };
  }, [selectedRepo, decodedRepoId, setSelectedRepo, navigate, isInvalidSlug]);

  const displayedError = isInvalidSlug
    ? `Repository identifier "${decodedRepoId}" is invalid. Expected format is "owner/repo".`
    : resolutionError;

  if (displayedError) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-6 select-none font-sans">
        <ErrorState
          title="Repository Owner Missing"
          whatHappened={displayedError}
          nextStep="Repositories must be accessed with their canonical owner/name slug (e.g. owner/repo)."
          onRetry={() => navigate('/repos')}
          className="max-w-md w-full"
        />
      </div>
    );
  }

  if (needsBareResolution && resolutionStatus !== 'done') {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-6 text-subtle text-xs font-mono">
        Resolving repository metadata...
      </div>
    );
  }

  if (!selectedRepo && decodedRepoId !== 'my-store' && decodedRepoId !== 'acme/my-store' && !decodedRepoId) {
    if (!user) {
      return <Navigate to="/connect" state={{ from: location }} replace />;
    }
    return <Navigate to="/repos" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

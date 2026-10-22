import React, { useEffect } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { MOCK_CONNECTED_REPO } from '../mocks/repo';
import { getRegisteredPublicRepos } from '../api/client';

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
 * Guard: No repo goes to /repos.
 * Redirects user to /repos if no repository is selected for workspace access.
 */
export const RequireRepo: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { selectedRepo, setSelectedRepo } = useAppStore();
  const { repoId } = useParams<{ repoId: string }>();
  const location = useLocation();

  useEffect(() => {
    if (!selectedRepo) {
      if (repoId === 'my-store' || repoId === 'acme/my-store') {
        setSelectedRepo(MOCK_CONNECTED_REPO);
      } else {
        const publicRepos = getRegisteredPublicRepos();
        const found = publicRepos.find(r => r.id === repoId || r.repo_name === repoId);
        if (found) {
          setSelectedRepo(found);
        }
      }
    }
  }, [selectedRepo, repoId, setSelectedRepo]);

  const hasPublicRepo = getRegisteredPublicRepos().some(r => r.id === repoId || r.repo_name === repoId);

  if (!selectedRepo && repoId !== 'my-store' && repoId !== 'acme/my-store' && !hasPublicRepo) {
    return <Navigate to="/repos" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};


import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import {
  Search,
  Sparkles,
  GitBranch,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { StatusDot } from '../ui/StatusDot';
import { Tooltip } from '../ui/Tooltip';
import { KbdHint } from '../ui/KbdHint';
import { SearchCommandDialog } from './SearchCommandDialog';

export const WorkspaceTopBar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    user,
    selectedRepo,
    panelStates,
    toggleRightPanel,
    disconnectGithub,
  } = useAppStore();

  const [searchOpen, setSearchOpen] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const avatarMenuRef = useRef<HTMLDivElement>(null);

  // Close avatar menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (avatarMenuRef.current && !avatarMenuRef.current.contains(e.target as Node)) {
        setAvatarMenuOpen(false);
      }
    }
    if (avatarMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [avatarMenuOpen]);

  const { repoId: routeRepoId } = useParams<{ repoId: string }>();
  const decodedRepoId = routeRepoId ? decodeURIComponent(routeRepoId) : '';
  const repoSlug = decodedRepoId
    ? encodeURIComponent(decodedRepoId)
    : selectedRepo?.full_name
    ? encodeURIComponent(selectedRepo.full_name)
    : (selectedRepo?.repo_name || 'my-store');
  const orgName = decodedRepoId.includes('/')
    ? decodedRepoId.split('/')[0]
    : selectedRepo?.full_name?.split('/')[0] || 'acme';
  const repoName = decodedRepoId.includes('/')
    ? decodedRepoId.split('/')[1]
    : (selectedRepo?.repo_name || selectedRepo?.full_name?.split('/')[1] || 'my-store');

  // Determine current active view tab
  const currentPath = location.pathname;
  let activeTab: 'code' | 'graph' | 'impact' = 'code';
  if (currentPath.includes('/graph')) {
    activeTab = 'graph';
  } else if (currentPath.includes('/impact')) {
    activeTab = 'impact';
  }

  const handleTabClick = (tab: 'code' | 'graph' | 'impact') => {
    if (tab === 'code') navigate(`/w/${repoSlug}`);
    else if (tab === 'graph') navigate(`/w/${repoSlug}/graph`);
    else if (tab === 'impact') navigate(`/w/${repoSlug}/impact`);
  };

  const handleDisconnect = () => {
    disconnectGithub();
    navigate('/connect');
  };

  return (
    <>
      <header
        role="banner"
        className="h-12 w-full bg-surface border-b border-line px-3 flex items-center justify-between select-none z-30 shrink-0 font-sans text-xs"
      >
        {/* Left Section: Logo Mark, Slash Breadcrumb, Branch Pill, Status Dot */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Logo Mark */}
          <Tooltip content="DevGraph Repositories" side="bottom">
            <button
              type="button"
              onClick={() => navigate('/repos')}
              className="flex items-center justify-center w-7 h-7 rounded border border-line hover:border-line-strong bg-raised text-text transition-colors cursor-pointer shrink-0 focus-visible:ring-1 focus-visible:ring-green-bright"
              aria-label="Navigate to Repositories"
            >
              <img
                src="/devgraph-icon.png"
                alt="DevGraph"
                width="16"
                height="16"
                className="rounded-sm"
                aria-hidden="true"
              />
            </button>
          </Tooltip>

          {/* Slash Breadcrumb 'acme / my-store' */}
          <nav aria-label="Breadcrumb" className="flex items-center text-xs font-mono truncate">
            <button
              type="button"
              onClick={() => navigate('/repos')}
              className="text-muted hover:text-text transition-colors cursor-pointer"
            >
              {orgName}
            </button>
            <span className="text-subtle mx-1.5" aria-hidden="true">
              /
            </span>
            <span className="text-text font-semibold truncate">
              {repoName}
            </span>
          </nav>

          {/* Branch Pill 'main' (disabled, tooltip) */}
          <Tooltip content="Only the default branch is indexed" side="bottom">
            <div
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-line bg-raised/60 text-subtle font-mono text-[11px] cursor-not-allowed select-none"
              aria-disabled="true"
              aria-label="Default branch: main (only default branch indexed)"
            >
              <GitBranch className="w-3 h-3 text-subtle" />
              <span>main</span>
            </div>
          </Tooltip>

          {/* Status Dot + 'Ready' */}
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-muted pl-1">
            <StatusDot status="ready" />
            <span className="hidden sm:inline">Ready</span>
          </div>
        </div>

        {/* Center Section: View Tabs (Code | Graph | Impact | PR Review) */}
        <div className="flex items-center h-full">
          <div role="tablist" className="flex items-center space-x-1 h-full">
            {/* Code View Tab */}
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'code'}
              onClick={() => handleTabClick('code')}
              className={`relative h-full flex items-center px-3.5 text-xs font-medium transition-colors cursor-pointer ${activeTab === 'code' ? 'text-text' : 'text-muted hover:text-text'
                }`}
            >
              <span>Code</span>
              {activeTab === 'code' && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-[2px] bg-white rounded-t-sm"
                  aria-hidden="true"
                />
              )}
            </button>

            {/* Graph View Tab */}
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'graph'}
              onClick={() => handleTabClick('graph')}
              className={`relative h-full flex items-center px-3.5 text-xs font-medium transition-colors cursor-pointer ${activeTab === 'graph' ? 'text-text' : 'text-muted hover:text-text'
                }`}
            >
              <span>Graph</span>
              {activeTab === 'graph' && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-[2px] bg-white rounded-t-sm"
                  aria-hidden="true"
                />
              )}
            </button>

            {/* Impact View Tab */}
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'impact'}
              onClick={() => handleTabClick('impact')}
              className={`relative h-full flex items-center px-3.5 text-xs font-medium transition-colors cursor-pointer ${activeTab === 'impact' ? 'text-text' : 'text-muted hover:text-text'
                }`}
            >
              <span>Impact</span>
              {activeTab === 'impact' && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-[2px] bg-white rounded-t-sm"
                  aria-hidden="true"
                />
              )}
            </button>

            {/* PR Review Tab (disabled, tooltip 'Coming soon') */}
            <Tooltip content="Coming soon" side="bottom">
              <button
                type="button"
                role="tab"
                aria-disabled="true"
                disabled
                className="h-full flex items-center px-3.5 text-xs font-medium text-subtle/50 cursor-not-allowed select-none"
              >
                <span>PR Review</span>
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Right Section: Search Button (Cmd+K), AI Toggle, Avatar Menu */}
        <div className="flex items-center gap-2">
          {/* Search Button showing Cmd+K hint */}
          <Tooltip content="Search symbols and files (⌘K)" side="bottom">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 px-2.5 py-1 rounded bg-raised hover:bg-raised/80 border border-line hover:border-line-strong text-muted hover:text-text transition-colors cursor-pointer"
              aria-label="Search symbols and files (⌘K)"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden md:inline text-xs">Search...</span>
              <KbdHint>⌘K</KbdHint>
            </button>
          </Tooltip>

          {/* AI Toggle Button */}
          <Tooltip content="Toggle AI Assistant Panel" side="bottom">
            <button
              type="button"
              onClick={toggleRightPanel}
              className={`flex items-center justify-center w-7 h-7 rounded border transition-colors cursor-pointer ${panelStates.rightOpen
                ? 'bg-raised border-line-strong text-green-bright'
                : 'bg-transparent border-line hover:border-line-strong text-muted hover:text-text'
                }`}
              aria-label="Toggle AI Assistant Panel"
              aria-pressed={panelStates.rightOpen}
            >
              <Sparkles className="w-3.5 h-3.5" />
            </button>
          </Tooltip>

          {/* Avatar Menu with 'Disconnect GitHub' */}
          <div ref={avatarMenuRef} className="relative">
            <Tooltip content={user ? `${user.name} (@${user.username})` : 'User profile'} side="bottom">
              <button
                type="button"
                onClick={() => setAvatarMenuOpen(!avatarMenuOpen)}
                className="flex items-center gap-1 p-0.5 rounded border border-line hover:border-line-strong transition-colors cursor-pointer"
                aria-label="User account menu"
                aria-expanded={avatarMenuOpen}
              >
                <img
                  src={
                    user?.avatar_url ||
                    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=64&h=64&fit=crop&crop=faces'
                  }
                  alt={user?.name || 'User avatar'}
                  className="w-5 h-5 rounded-full object-cover"
                />
                <ChevronDown className="w-2.5 h-2.5 text-subtle mr-0.5" />
              </button>
            </Tooltip>

            {/* Avatar Dropdown Menu */}
            {avatarMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-48 bg-surface border border-line-strong rounded-md shadow-2xl p-1 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-2.5 py-2 border-b border-line mb-1">
                  <div className="font-medium text-text text-xs truncate">
                    {user?.name || 'roshini Reddy'}
                  </div>
                  <div className="text-subtle text-[10px] font-mono truncate">
                    @{user?.username || 'roshinireddy'}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-raised text-danger transition-colors cursor-pointer text-xs"
                >
                  <LogOut className="w-3.5 h-3.5 text-danger" />
                  <span>Disconnect GitHub</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Global Cmd+K Search Dialog */}
      <SearchCommandDialog
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
      />
    </>
  );
};

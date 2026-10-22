import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Sparkles, PanelLeftOpen, X } from 'lucide-react';
import { WorkspaceTopBar } from './WorkspaceTopBar';
import { LeftExplorerPanel } from './LeftExplorerPanel';
import { RightAIPanel } from './RightAIPanel';
import { useAppStore } from '../../store/useAppStore';
import { Tooltip } from '../ui/Tooltip';
import { Button } from '../ui/Button';

export const WorkspaceLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    panelStates,
    setLeftWidth,
    setRightWidth,
    setLeftOpen,
    setRightOpen,
    setPanelDefaultsForRoute,
    selectedRepo,
  } = useAppStore();

  const searchParams = new URLSearchParams(location.search);
  const isSample =
    searchParams.get('sample') === 'true' ||
    selectedRepo?.repo_name === 'my-store' ||
    location.pathname.includes('/my-store');
  const [dismissSampleBanner, setDismissSampleBanner] = useState(false);

  const prevPathRef = useRef<string>(location.pathname);

  // Sync defaults on route changes (Code = both open, Graph/Impact/Connections = both collapsed)
  useEffect(() => {
    const isOldCollapsedView =
      prevPathRef.current.includes('/graph') ||
      prevPathRef.current.includes('/impact') ||
      prevPathRef.current.includes('/connections');
    const isNewCollapsedView =
      location.pathname.includes('/graph') ||
      location.pathname.includes('/impact') ||
      location.pathname.includes('/connections');

    if (isOldCollapsedView !== isNewCollapsedView) {
      setPanelDefaultsForRoute(location.pathname);
    }
    prevPathRef.current = location.pathname;
  }, [location.pathname, setPanelDefaultsForRoute]);

  // Resizing state for draggable 1px gutters
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);

  const handleMouseDownLeft = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingLeft(true);
  }, []);

  const handleMouseDownRight = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingRight(true);
  }, []);

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (isDraggingLeft) {
        setLeftWidth(e.clientX);
      } else if (isDraggingRight) {
        const newWidth = window.innerWidth - e.clientX;
        setRightWidth(newWidth);
      }
    }

    function handleMouseUp() {
      setIsDraggingLeft(false);
      setIsDraggingRight(false);
    }

    if (isDraggingLeft || isDraggingRight) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };
  }, [isDraggingLeft, isDraggingRight, setLeftWidth, setRightWidth]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-bg text-text font-sans select-none">
      {/* Sample Data Banner */}
      {isSample && !dismissSampleBanner && (
        <div className="h-7 bg-raised border-b border-line px-3 flex items-center justify-between text-[11px] font-mono text-muted shrink-0 z-40">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-ember shrink-0" />
            <span className="text-text font-semibold uppercase tracking-wider text-[10px]">Sample data:</span>
            <span className="truncate">Viewing demo repository acme/my-store with pre-indexed AST relations.</span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => navigate('/connect')}
              className="text-text hover:text-green-bright underline cursor-pointer transition-colors"
            >
              Connect your repo
            </button>
            <button
              type="button"
              onClick={() => setDismissSampleBanner(true)}
              className="text-subtle hover:text-text p-0.5 rounded transition-colors"
              aria-label="Dismiss sample banner"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* 48px One-Row Workspace Top Bar */}
      <WorkspaceTopBar />

      {/* Main Multi-Panel Workspace Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Explorer Panel (260px default) */}
        {panelStates.leftOpen ? (
          <>
            <div
              style={{ width: `${panelStates.leftWidth}px` }}
              className="h-full shrink-0"
            >
              <LeftExplorerPanel />
            </div>

            {/* Draggable 1px Left Gutter */}
            <div
              onMouseDown={handleMouseDownLeft}
              className="w-1 bg-transparent hover:bg-line-strong active:bg-green-bright transition-colors cursor-col-resize shrink-0 z-20 -mx-0.5"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize Left Explorer"
            />
          </>
        ) : (
          /* Reopen Left Explorer tab */
          <div className="absolute top-2 left-2 z-20">
            <Tooltip content="Open Explorer" side="right">
              <button
                type="button"
                onClick={() => setLeftOpen(true)}
                className="flex items-center justify-center w-7 h-7 rounded border border-line hover:border-line-strong bg-surface hover:bg-raised text-muted hover:text-text shadow-lg transition-colors cursor-pointer"
                aria-label="Open Explorer"
              >
                <PanelLeftOpen className="w-3.5 h-3.5" />
              </button>
            </Tooltip>
          </div>
        )}

        {/* Center Main Work Area */}
        <main
          role="main"
          className="flex-1 h-full overflow-hidden flex flex-col bg-ide relative"
        >
          <Outlet />

          {/* Floating 'Ask AI' button when right panel is collapsed */}
          {!panelStates.rightOpen && (
            <div className="absolute bottom-4 right-4 z-30">
              <Tooltip content="Reopen AI Assistant" side="left">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setRightOpen(true)}
                  leftIcon={<Sparkles className="w-3.5 h-3.5 text-green-bright" />}
                  className="bg-surface/90 backdrop-blur-sm shadow-xl hover:bg-raised"
                >
                  Ask AI
                </Button>
              </Tooltip>
            </div>
          )}
        </main>

        {/* Right AI Assistant Panel (340px default) */}
        {panelStates.rightOpen && (
          <>
            {/* Draggable 1px Right Gutter */}
            <div
              onMouseDown={handleMouseDownRight}
              className="w-1 bg-transparent hover:bg-line-strong active:bg-green-bright transition-colors cursor-col-resize shrink-0 z-20 -mx-0.5"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize AI Panel"
            />

            <div
              style={{ width: `${panelStates.rightWidth}px` }}
              className="h-full shrink-0"
            >
              <RightAIPanel />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

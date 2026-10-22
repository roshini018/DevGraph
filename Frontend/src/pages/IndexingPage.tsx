import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Clock,
  Terminal,
  Loader2,
  GitBranch,
} from 'lucide-react';
import { getIndexStatus, retryIndex, getRegisteredPublicRepos } from '../api/client';
import type { IndexStatus } from '../types/api';
import { Button } from '../components/ui/Button';
import { StatusDot } from '../components/ui/StatusDot';
import { useAppStore } from '../store/useAppStore';
import { MOCK_CONNECTED_REPO } from '../mocks/repo';

interface LogEntry {
  id: string;
  time: string;
  text: string;
  isError?: boolean;
}

const STEPPER_STAGES = [
  { id: 'fetching', label: 'Fetching' },
  { id: 'parsing', label: 'Parsing' },
  { id: 'graphing', label: 'Building graph' },
  { id: 'embedding', label: 'Search index' },
  { id: 'ready', label: 'Preparing' },
] as const;

export const IndexingPage: React.FC = () => {
  const { repoId = 'my-store' } = useParams<{ repoId: string }>();
  const navigate = useNavigate();
  const { setSelectedRepo } = useAppStore();

  const [status, setStatus] = useState<IndexStatus | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  // Elapsed time in seconds
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Terminal log lines coming ONLY from real IndexStatus stage and error text
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const seenMessagesRef = useRef<Set<string>>(new Set());

  // Log auto-scroll ref
  const logEndRef = useRef<HTMLDivElement>(null);

  // Format elapsed time as mm:ss
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
  };

  const recordRealLogLine = (text: string, isError = false) => {
    if (!text || seenMessagesRef.current.has(text)) return;
    seenMessagesRef.current.add(text);

    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now
      .getMinutes()
      .toString()
      .padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

    setLogs(prev => [
      ...prev,
      {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        time: timeStr,
        text,
        isError,
      },
    ]);
  };

  const fetchStatus = async () => {
    try {
      const s = await getIndexStatus(repoId);
      setStatus(s);

      // Append ONLY real stage text from status
      if (s.stage) {
        recordRealLogLine(s.stage);
      }
      // Append ONLY real error text from status
      if (s.error) {
        recordRealLogLine(`ERROR: ${s.error}`, true);
      }
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'error' in err
          ? (err as { error: { message: string } }).error.message
          : 'Failed to query index status';
      recordRealLogLine(`API Error: ${msg}`, true);
    }
  };

  // Poll getIndexStatus every 2 seconds
  useEffect(() => {
    fetchStatus();

    const pollInterval = setInterval(() => {
      fetchStatus();
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [repoId]);

  // Elapsed timer increment every 1 second
  useEffect(() => {
    const isFinished = status?.state === 'ready' || status?.state === 'failed' || status?.state === 'pending';
    if (isFinished) return;

    const timer = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [status?.state]);

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      const s = await retryIndex(repoId);
      setStatus(s);
      if (s.stage) recordRealLogLine(s.stage);
    } finally {
      setIsRetrying(false);
    }
  };

  const handleOpenWorkspace = () => {
    const decodedRepoId = decodeURIComponent(repoId);
    const publicRepos = getRegisteredPublicRepos();
    const found = publicRepos.find(
      r =>
        r.id === repoId ||
        r.repo_name === repoId ||
        r.full_name === repoId ||
        r.id === decodedRepoId ||
        r.repo_name === decodedRepoId ||
        r.full_name === decodedRepoId
    );
    if (found) {
      setSelectedRepo(found);
      navigate(`/w/${encodeURIComponent(found.full_name)}`);
      return;
    }
    const currentSelected = useAppStore.getState().selectedRepo;
    if (
      currentSelected &&
      (currentSelected.full_name === decodedRepoId ||
        currentSelected.repo_name === decodedRepoId ||
        currentSelected.id === decodedRepoId)
    ) {
      navigate(`/w/${encodeURIComponent(currentSelected.full_name)}`);
      return;
    }
    if (decodedRepoId === 'my-store' || decodedRepoId === 'acme/my-store') {
      setSelectedRepo(MOCK_CONNECTED_REPO);
      navigate(`/w/my-store`);
      return;
    }
    navigate(`/w/${encodeURIComponent(decodedRepoId)}`);
  };

  // Derive active step index
  const getActiveStepIndex = () => {
    if (!status) return 0;
    switch (status.state) {
      case 'queued':
      case 'fetching':
        return 0;
      case 'parsing':
        return 1;
      case 'graphing':
        return 2;
      case 'embedding':
        return 3;
      case 'ready':
        return 5; // all done
      case 'failed':
        return 1;
      default:
        return 0;
    }
  };

  const activeStepIdx = getActiveStepIndex();
  const isComplete = status?.state === 'ready';
  const isFailed = status?.state === 'failed';

  // Status pill config
  const getStatusPill = () => {
    if (isComplete) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-green-soft border border-green/30 text-green-bright font-mono text-xs font-semibold">
          <StatusDot status="ready" />
          <span>Ready</span>
        </span>
      );
    }
    if (isFailed) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-danger/10 border border-danger/30 text-danger font-mono text-xs font-semibold">
          <StatusDot status="failed" />
          <span>Failed</span>
        </span>
      );
    }
    if (status?.state === 'pending') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber/10 border border-amber/30 text-amber font-mono text-xs font-semibold">
          <Clock className="w-3.5 h-3.5 text-amber" />
          <span>Pending Ingestion</span>
        </span>
      );
    }
    if (status?.state === 'queued') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-raised border border-line text-muted font-mono text-xs">
          <Clock className="w-3.5 h-3.5 text-muted" />
          <span>Queued</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-raised border border-line text-amber font-mono text-xs font-semibold">
        <StatusDot status="indexing" />
        <span>Building</span>
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-bg text-text font-sans p-6 sm:p-10 max-w-5xl mx-auto flex flex-col justify-center space-y-6 select-none">
      {/* Top Header Card */}
      <div className="border border-line bg-surface rounded-lg p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-line">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-subtle uppercase">Indexing</span>
            <span className="text-subtle font-mono">/</span>
            <span className="font-mono text-xs text-muted">acme</span>
            <span className="text-subtle font-mono">/</span>
            <span className="font-mono text-xs text-text font-semibold">{repoId}</span>
            <span className="inline-flex items-center gap-1 text-[11px] font-mono text-subtle px-1.5 py-0.5 rounded bg-raised border border-line ml-1">
              <GitBranch className="w-2.5 h-2.5 text-slate" />
              <span>main</span>
            </span>
          </div>

          {/* Top Status Pill and Elapsed Time */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 font-mono text-xs text-subtle">
              <Clock className="w-3.5 h-3.5" />
              <span>Elapsed:</span>
              <span className="text-text font-semibold">{formatTime(elapsedSeconds)}</span>
            </div>
            {getStatusPill()}
          </div>
        </div>

        {/* Progress bar and files count ONLY when present */}
        {status && typeof status.progress === 'number' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono text-muted">
              {/* files_done / files_total only when present */}
              {typeof status.files_done === 'number' && typeof status.files_total === 'number' ? (
                <span>
                  {status.files_done} of {status.files_total} files analyzed
                </span>
              ) : (
                <span>Analyzing repository syntax...</span>
              )}
              <span className="font-semibold text-text">{status.progress}%</span>
            </div>

            <div className="w-full h-1.5 rounded-full bg-raised overflow-hidden border border-line">
              <div
                className={`h-full transition-all duration-300 ${
                  isFailed ? 'bg-danger' : isComplete ? 'bg-green-bright' : 'bg-green'
                }`}
                style={{ width: `${status.progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Main Build-Log Style Two-Column Container */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 min-h-[380px]">
        {/* Left: Vertical Stepper (4 cols) */}
        <div className="md:col-span-4 border border-line bg-surface rounded-lg p-5 space-y-4">
          <div className="text-xs font-mono font-semibold text-subtle uppercase tracking-wider">
            Pipeline Steps
          </div>

          <div className="space-y-4 pt-1">
            {STEPPER_STAGES.map((step, idx) => {
              const isPast = activeStepIdx > idx;
              const isCurrent = activeStepIdx === idx && !isFailed;
              const isFailedCurrent = activeStepIdx === idx && isFailed;

              return (
                <div key={step.id} className="flex items-start gap-3">
                  {/* Step Indicator */}
                  <div className="pt-0.5">
                    {isPast ? (
                      <div className="w-5 h-5 rounded-full bg-green-soft border border-green/50 flex items-center justify-center text-green-bright">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </div>
                    ) : isCurrent ? (
                      <div className="w-5 h-5 rounded-full bg-raised border border-green-bright flex items-center justify-center text-green-bright animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-bright" />
                      </div>
                    ) : isFailedCurrent ? (
                      <div className="w-5 h-5 rounded-full bg-danger/10 border border-danger/50 flex items-center justify-center text-danger">
                        <XCircle className="w-3.5 h-3.5" />
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-raised border border-line flex items-center justify-center text-[10px] font-mono text-subtle">
                        {idx + 1}
                      </div>
                    )}
                  </div>

                  {/* Step Label */}
                  <div className="flex-1 min-w-0">
                    <div
                      className={`text-xs font-mono font-medium ${
                        isPast
                          ? 'text-text'
                          : isCurrent
                          ? 'text-green-bright font-semibold'
                          : isFailedCurrent
                          ? 'text-danger font-semibold'
                          : 'text-subtle'
                      }`}
                    >
                      {step.label}
                    </div>
                    {isCurrent && status?.stage && (
                      <div className="text-[11px] text-muted truncate mt-0.5 font-mono">
                        {status.stage}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Real Status Stage Note */}
          <div className="pt-4 border-t border-line text-[11px] font-mono text-subtle">
            <div>Engine: AST Visitor v1.2</div>
            <div>Mode: In-memory DAG</div>
          </div>
        </div>

        {/* Right: Mono Log Panel (8 cols) */}
        <div className="md:col-span-8 border border-line bg-ide rounded-lg flex flex-col overflow-hidden font-mono text-xs">
          {/* Terminal Title Bar */}
          <div className="h-9 px-4 bg-surface border-b border-line flex items-center justify-between text-subtle text-[11px]">
            <div className="flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-slate" />
              <span className="font-semibold text-text">build.log</span>
            </div>
            <span>Poll: 2000ms</span>
          </div>

          {/* Log Lines Area (lines come ONLY from real IndexStatus stage and error text) */}
          <div className="flex-1 p-4 overflow-y-auto space-y-1.5 min-h-[300px] max-h-[420px] leading-relaxed">
            {logs.length === 0 ? (
              <div className="text-subtle text-xs">Initializing build pipeline...</div>
            ) : (
              logs.map(log => (
                <div key={log.id} className="flex items-start gap-2.5">
                  <span className="text-subtle text-[11px] select-none shrink-0">
                    [{log.time}]
                  </span>
                  <span
                    className={`${
                      log.isError
                        ? 'text-danger font-medium'
                        : log.text.includes('ready') || log.text.includes('indexed')
                        ? 'text-green-bright'
                        : 'text-text'
                    }`}
                  >
                    {log.text}
                  </span>
                </div>
              ))
            )}

            {/* Blinking cursor if still building */}
            {!isComplete && !isFailed && (
              <div className="flex items-center gap-2 text-green-bright pt-1">
                <span className="w-1.5 h-3 bg-green-bright animate-pulse" />
              </div>
            )}

            <div ref={logEndRef} />
          </div>

          {/* Log Footer Bar with Action Buttons */}
          <div className="p-3 bg-surface border-t border-line flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/repos')}
            >
              Back to Repositories
            </Button>

            <div className="flex items-center gap-2">
              {/* Failed state: Retry button (green) */}
              {isFailed && (
                <Button
                  variant="green"
                  size="sm"
                  onClick={handleRetry}
                  isLoading={isRetrying}
                  leftIcon={<RefreshCw className="w-3 h-3" />}
                >
                  Retry
                </Button>
              )}

              {/* Ready state: White 'Open Workspace' button */}
              {isComplete && (
                <Button
                  variant="white"
                  size="sm"
                  onClick={handleOpenWorkspace}
                  rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
                >
                  Open Workspace
                </Button>
              )}

              {!isComplete && !isFailed && (
                <span className="text-xs font-mono text-muted flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin text-green-bright" />
                  <span>Building...</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IndexingPage;

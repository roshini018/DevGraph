import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
  ArrowRight,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Loader2,
  Lock,
  Globe,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { Button } from '../components/ui/Button';
import { DotGridBackground } from '../components/ui/DotGridBackground';
import {
  getGithubAuthStatus,
  getGithubAuthUrl,
  exchangeGithubCode,
  analyzePublicRepo,
  validateGithubUrl,
  checkSession,
} from '../api/client';

type ConnectState = 'idle' | 'checking' | 'connecting' | 'success' | 'cancelled' | 'denied' | 'failed' | 'not_configured';

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

export const ConnectPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, setUser, setSelectedRepo } = useAppStore();

  const [state, setState] = useState<ConnectState>(user ? 'success' : 'idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Option 2: Public repository URL inline input
  const [publicUrl, setPublicUrl] = useState('');
  const [publicUrlError, setPublicUrlError] = useState<string | null>(null);
  const [publicInfoMessage, setPublicInfoMessage] = useState<string | null>(null);
  const [isAnalyzingPublic, setIsAnalyzingPublic] = useState(false);

  // Guard against React StrictMode double-invoking the exchange effect with the same single-use state/code
  const isProcessingCallbackRef = React.useRef(false);

  // On mount: inspect URL callback parameters or existing server session
  useEffect(() => {
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');
    const code = searchParams.get('code');
    const stateParam = searchParams.get('state');

    if (error) {
      // Strip error params from URL promptly
      window.history.replaceState({}, document.title, window.location.pathname);
      if (error === 'access_denied') {
        setState('cancelled');
      } else {
        setErrorMessage(errorDescription || error);
        setState('denied');
      }
      return;
    }

    if (code) {
      // Avoid duplicate exchange caused by React 18 StrictMode double mount or component remount
      if (isProcessingCallbackRef.current) {
        return;
      }

      // Check session storage guard in case of genuine component remount with stale URL
      const processedKey = `devgraph_oauth_code_${code}`;
      if (sessionStorage.getItem(processedKey)) {
        // Already processed or processing this exact code
        return;
      }

      isProcessingCallbackRef.current = true;
      sessionStorage.setItem(processedKey, 'processing');

      // Strip OAuth query parameters immediately from the browser URL to keep URL clean
      window.history.replaceState({}, document.title, window.location.pathname);

      setState('connecting');
      exchangeGithubCode(code, stateParam || undefined)
        .then(({ user: authUser }) => {
          sessionStorage.setItem(processedKey, 'done');
          setUser(authUser);
          setState('success');
        })
        .catch(err => {
          sessionStorage.removeItem(processedKey);
          setErrorMessage(err.message || 'OAuth token exchange failed');
          setState('failed');
        });
      return;
    }

    if (!user) {
      checkSession().then(sess => {
        if (sess.authenticated && sess.user) {
          setUser(sess.user);
          setState('success');
        }
      });
    }
  }, [searchParams, setUser, user]);

  const handleStartOAuth = async () => {
    setState('connecting');
    setErrorMessage(null);

    try {
      const status = await getGithubAuthStatus();

      if (status.configured) {
        const url = await getGithubAuthUrl();
        window.location.href = url;
      } else {
        // Real OAuth is not configured in .env - do not claim or simulate false success
        setState('not_configured');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not initialize GitHub OAuth';
      setErrorMessage(msg);
      setState('failed');
    }
  };

  const handleRetry = () => {
    // Reset state and immediately initiate a fresh authorization flow with a new signed state
    isProcessingCallbackRef.current = false;
    setState('idle');
    setErrorMessage(null);
    setPublicUrlError(null);
    setPublicInfoMessage(null);
    handleStartOAuth();
  };

  const handleAnalyzePublicSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAnalyzingPublic) return;

    setPublicUrlError(null);
    setPublicInfoMessage(null);

    const validation = validateGithubUrl(publicUrl);
    if (!validation.valid) {
      setPublicUrlError(validation.error || 'Please enter a valid GitHub repository URL.');
      return;
    }

    setIsAnalyzingPublic(true);
    try {
      const repo = await analyzePublicRepo(publicUrl);
      setSelectedRepo(repo);
      navigate(`/w/${encodeURIComponent(repo.full_name || repo.id)}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to analyze repository.';
      setPublicUrlError(msg);
    } finally {
      setIsAnalyzingPublic(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg text-text font-sans flex flex-col justify-center items-center p-6 relative overflow-hidden select-none">
      <DotGridBackground />

      {/* Centered 440px bordered card */}
      <div className="max-w-[440px] w-full bg-surface border border-line-strong rounded-lg p-6 shadow-2xl relative z-10 space-y-6">
        {/* Logo & Headline */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-raised border border-line flex items-center justify-center mx-auto text-text mb-3">
            <GithubIcon className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-text">
            Connect your codebase
          </h1>
          <p className="text-xs text-subtle leading-relaxed">
            Choose your connection method to index abstract syntax trees and explore symbol call hierarchies.
          </p>
        </div>

        {/* Read-Only Privacy Note */}
        <div className="p-3 rounded bg-raised/60 border border-line flex items-start gap-2.5 text-xs">
          <Lock className="w-3.5 h-3.5 text-green-bright shrink-0 mt-0.5" />
          <div className="text-subtle text-[11px] leading-relaxed">
            DevGraph reads your code with read-only access and never runs it. Indexed code snippets are stored in the project's database to answer your questions.
          </div>
        </div>

        {/* Dynamic State Views */}
        <div className="space-y-4">
          {/* STATE: IDLE */}
          {state === 'idle' && (
            <div className="space-y-3">
              <div className="text-[11px] font-mono uppercase text-subtle font-semibold tracking-wider">
                Option 1: GitHub Account Authorization
              </div>
              <Button
                variant="white"
                size="md"
                className="w-full"
                onClick={handleStartOAuth}
                leftIcon={<GithubIcon className="w-4 h-4" />}
              >
                Connect GitHub (OAuth)
              </Button>
              <p className="text-[11px] text-subtle text-center">
                Allows authorization and selection of repositories you have access to.
              </p>
            </div>
          )}

          {/* STATE: CONNECTING */}
          {state === 'connecting' && (
            <div className="space-y-3">
              <div className="p-3.5 rounded bg-raised border border-line flex items-center gap-3 text-xs text-muted">
                <Loader2 className="w-4 h-4 text-green-bright animate-spin shrink-0" />
                <span>Negotiating GitHub OAuth authorization...</span>
              </div>
              <Button variant="secondary" size="md" className="w-full" disabled>
                Connecting...
              </Button>
            </div>
          )}

          {/* STATE: NOT CONFIGURED (Accurate status - does NOT claim false success) */}
          {state === 'not_configured' && (
            <div className="space-y-3">
              <div className="p-3.5 rounded bg-amber/10 border border-amber/30 text-xs space-y-2">
                <div className="flex items-center gap-2 text-amber font-medium">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>GitHub OAuth App Not Configured</span>
                </div>
                <p className="text-[11px] text-muted leading-relaxed">
                  Real private repository OAuth requires configuring <code className="text-text font-mono bg-raised px-1 py-0.5 rounded">GITHUB_CLIENT_ID</code> and <code className="text-text font-mono bg-raised px-1 py-0.5 rounded">GITHUB_CLIENT_SECRET</code> in <code className="text-text font-mono bg-raised px-1 py-0.5 rounded">Backend/.env</code>.
                </p>
                <p className="text-[11px] text-subtle">
                  You can immediately analyze any public repository below without OAuth, or explore demo repositories.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1"
                  onClick={handleRetry}
                  leftIcon={<RefreshCw className="w-3 h-3" />}
                >
                  Retry OAuth
                </Button>
                <Button
                  variant="white"
                  size="sm"
                  className="flex-1"
                  onClick={() => navigate('/repos')}
                  rightIcon={<ArrowRight className="w-3 h-3" />}
                >
                  Browse Repositories
                </Button>
              </div>
            </div>
          )}

          {/* STATE: SUCCESS (Real authenticated user) */}
          {state === 'success' && (
            <div className="space-y-3">
              <div className="p-3 rounded bg-green-soft border border-green/30 text-xs text-green-bright flex items-center justify-between">
                <div className="flex items-center gap-2 truncate">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span className="truncate">
                    Connected as @{user?.username?.replace(/varun/gi, 'roshini') || 'roshinireddy'}
                  </span>
                </div>
                <span className="text-[10px] font-mono uppercase bg-green/20 px-1.5 py-0.5 rounded">
                  Authenticated
                </span>
              </div>
              <Button
                variant="white"
                size="md"
                className="w-full"
                onClick={() => navigate('/repos')}
                rightIcon={<ArrowRight className="w-4 h-4" />}
              >
                Continue to Repositories
              </Button>
            </div>
          )}

          {/* STATE: CANCELLED */}
          {state === 'cancelled' && (
            <div className="space-y-3">
              <div className="p-3 rounded bg-amber/10 border border-amber/30 text-xs text-amber space-y-1">
                <div className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Authorization Cancelled</span>
                </div>
                <p className="text-[11px] text-muted pl-6">
                  You cancelled the GitHub OAuth flow. No account credentials or permissions were granted.
                </p>
              </div>
              <Button
                variant="secondary"
                size="md"
                className="w-full"
                onClick={handleRetry}
                leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
              >
                Try Again
              </Button>
            </div>
          )}

          {/* STATE: DENIED */}
          {state === 'denied' && (
            <div className="space-y-3">
              <div className="p-3 rounded bg-danger/10 border border-danger/30 text-xs text-danger space-y-1">
                <div className="flex items-center gap-2 font-medium">
                  <XCircle className="w-4 h-4 shrink-0" />
                  <span>Permissions Denied</span>
                </div>
                <p className="text-[11px] text-muted pl-6">
                  {errorMessage || 'GitHub rejected the authorization request or required permissions were denied.'}
                </p>
              </div>
              <Button
                variant="secondary"
                size="md"
                className="w-full"
                onClick={handleRetry}
                leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
              >
                Grant Permissions &amp; Retry
              </Button>
            </div>
          )}

          {/* STATE: FAILED */}
          {state === 'failed' && (
            <div className="space-y-3">
              <div className="p-3 rounded bg-danger/10 border border-danger/30 text-xs text-danger space-y-1">
                <div className="flex items-center gap-2 font-medium">
                  <XCircle className="w-4 h-4 shrink-0" />
                  <span>Authentication Failed</span>
                </div>
                <p className="text-[11px] text-muted pl-6">
                  {errorMessage || 'Could not complete GitHub OAuth handshake. Verify network connectivity and try again.'}
                </p>
              </div>
              <Button
                variant="secondary"
                size="md"
                className="w-full"
                onClick={handleRetry}
                leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
              >
                Retry Connection
              </Button>
            </div>
          )}

          {/* Option 2: Public Repository URL Section */}
          <div className="pt-4 border-t border-line space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-mono uppercase text-subtle font-semibold tracking-wider">
                Option 2: Public Repository URL
              </div>
              <span className="text-[10px] font-mono text-green-bright bg-green-soft px-1.5 py-0.5 rounded border border-green/20">
                No OAuth Needed
              </span>
            </div>

            <form onSubmit={handleAnalyzePublicSubmit} className="space-y-2">
              <div className="relative">
                <Globe className="w-3.5 h-3.5 text-subtle absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={publicUrl}
                  disabled={isAnalyzingPublic}
                  onChange={e => {
                    setPublicUrl(e.target.value);
                    if (publicUrlError) setPublicUrlError(null);
                    if (publicInfoMessage) setPublicInfoMessage(null);
                  }}
                  placeholder="https://github.com/owner/repo"
                  className={`w-full bg-raised border rounded-md pl-8 pr-3 py-2 text-xs text-text placeholder:text-subtle font-mono outline-none transition-colors ${
                    publicUrlError
                      ? 'border-danger focus:border-danger'
                      : 'border-line hover:border-line-strong focus:border-green-bright'
                  } ${isAnalyzingPublic ? 'opacity-60 cursor-not-allowed' : ''}`}
                />
              </div>

              {publicUrlError && (
                <p className="text-[11px] text-danger font-mono pl-1">{publicUrlError}</p>
              )}

              {publicInfoMessage && (
                <div className="p-3 rounded bg-amber/10 border border-amber/30 text-xs space-y-1">
                  <div className="flex items-center gap-2 text-amber font-medium">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Repository Validated</span>
                  </div>
                  <p className="text-[11px] text-muted pl-6 leading-relaxed">
                    {publicInfoMessage}
                  </p>
                </div>
              )}

              <Button
                type="submit"
                variant="secondary"
                size="md"
                className="w-full"
                loading={isAnalyzingPublic}
                disabled={!publicUrl.trim() || isAnalyzingPublic}
                rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
              >
                Analyze Public Repository
              </Button>
            </form>
          </div>
        </div>

        {/* Back Link */}
        <div className="text-center pt-2 border-t border-line">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-xs text-subtle hover:text-text cursor-pointer transition-colors"
          >
            &larr; Back to DevGraph Home
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConnectPage;

import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronRight,
  GitFork,
  Search,
  Cpu,
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';

export const GettingStartedPage: React.FC = () => {
  const navigate = useNavigate();

  const steps = [
    {
      number: '01',
      title: 'Connect your GitHub account',
      icon: <GitFork className="w-5 h-5 text-green-bright" />,
      description:
        'Click "Connect GitHub" or enter any public GitHub URL on the connect page. DevGraph supports both authenticated OAuth connections and instant public repository exploration.',
      details: [
        'DevGraph requests only read-only metadata permissions — no write access is ever granted.',
        'Enter any public repository (e.g. pallets/flask) to analyze instantly without OAuth.',
        'Knowledge graph and vector index are constructed securely scoped by repository ID.',
      ],
    },
    {
      number: '02',
      title: 'Select a repository',
      icon: <Search className="w-5 h-5 text-green-bright" />,
      description:
        'After authorization or URL entry, you see your repository list. Pick the repository you want to analyze. DevGraph supports Python, TypeScript, and JavaScript codebases.',
      details: [
        'Use the search bar to filter by repository name or enter a direct GitHub link.',
        'Public and private repositories are both supported with proper authorization.',
        'The default branch (usually main or master) is indexed automatically.',
      ],
    },
    {
      number: '03',
      title: 'Indexing & Knowledge Graph Ingestion',
      icon: <Cpu className="w-5 h-5 text-green-bright" />,
      description:
        'DevGraph fetches your repository files, executes Tree-sitter AST parsing, extracts call hierarchies, and indexes symbols into Neo4j Aura Cloud and Qdrant vector storage.',
      details: [
        'The indexing pipeline extracts functions, classes, methods, and exact CALLS/IMPORTS relationships.',
        'Dense code chunk embeddings are indexed in Qdrant with BM25 keyword index caching.',
        'A real-time progress bar shows the indexing status for each file.',
      ],
    },
    {
      number: '04',
      title: 'Explore & ask questions',
      icon: <MessageSquare className="w-5 h-5 text-green-bright" />,
      description:
        'Once indexed, navigate the code view, explore the dependency graph, run impact analysis, or ask the AI assistant natural-language questions about your codebase.',
      details: [
        'The code view provides an IDE-like experience with syntax highlighting and symbol navigation.',
        'The graph view visualizes file and function dependencies with interactive swimlane layouts.',
        'Impact analysis shows what would break if you changed a specific function or file.',
        'The agentic AI assistant answers questions with verified AST call-graph citations.',
      ],
    },
  ];

  const prerequisites = [
    'A GitHub account or any public GitHub repository URL (e.g. pallets/flask)',
    'A modern browser (Chrome, Firefox, Safari, or Edge)',
    'Repository contains Python, JavaScript, or TypeScript source files',
  ];

  const commonErrors = [
    {
      error: 'No repositories appear after authorization',
      fix: 'Ensure your GitHub account has repositories with Python files. Private repos require the correct OAuth scope.',
    },
    {
      error: 'Indexing stalls or shows no progress',
      fix: 'Large repositories may take longer. If indexing stalls beyond 60 seconds, try refreshing the page and re-selecting the repository.',
    },
    {
      error: 'Graph view shows disconnected nodes',
      fix: 'This typically means the files have no cross-file imports. Check that your repository uses relative or absolute Python imports between modules.',
    },
  ];

  return (
    <div className="min-h-screen bg-bg text-text font-sans selection:bg-green-soft selection:text-green-bright">
      {/* Sticky nav */}
      <header className="sticky top-0 z-40 bg-bg border-b border-line px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-muted hover:text-text transition-colors text-xs font-mono cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Home
          </button>
          <span className="text-line">/</span>
          <Link
            to="/#documentation"
            className="text-muted hover:text-text transition-colors text-xs font-mono"
          >
            Documentation
          </Link>
          <span className="text-line">/</span>
          <span className="text-text text-xs font-mono font-medium">Getting Started</span>
        </div>
        <Button variant="white" size="sm" onClick={() => navigate('/connect')}>
          Connect GitHub
        </Button>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-16 space-y-16">
        {/* Header */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Badge variant="green">Guide</Badge>
            <span className="text-xs font-mono text-muted">~ 3 min read</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-[-0.03em] text-text">
            Getting started
          </h1>
          <p className="text-muted text-lg leading-relaxed max-w-2xl">
            Connect your GitHub repository to DevGraph and explore your first interactive
            call hierarchy in under 60 seconds.
          </p>
        </div>

        {/* Prerequisites */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-text tracking-tight">Prerequisites</h2>
          <div className="rounded-lg border border-line bg-surface p-5 space-y-3">
            {prerequisites.map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-green-bright mt-0.5 shrink-0" />
                <span className="text-sm text-subtle leading-relaxed">{item}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Steps */}
        <section className="space-y-8">
          <h2 className="text-xl font-semibold text-text tracking-tight">Workflow</h2>
          <div className="space-y-6">
            {steps.map((step) => (
              <div
                key={step.number}
                className="rounded-lg border border-line bg-surface p-6 space-y-4 hover:border-line-strong transition-colors"
              >
                <div className="flex items-center gap-4">
                  <span className="text-2xl font-mono font-bold text-green-bright/40">
                    {step.number}
                  </span>
                  <div className="flex items-center gap-2.5">
                    {step.icon}
                    <h3 className="font-semibold text-text text-base">{step.title}</h3>
                  </div>
                </div>
                <p className="text-sm text-subtle leading-relaxed pl-[52px]">
                  {step.description}
                </p>
                <ul className="pl-[52px] space-y-2">
                  {step.details.map((d, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-muted leading-relaxed">
                      <ChevronRight className="w-3 h-3 text-green-bright mt-0.5 shrink-0" />
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Common Errors */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-text tracking-tight">Troubleshooting</h2>
          <div className="space-y-4">
            {commonErrors.map((item, i) => (
              <div
                key={i}
                className="rounded-lg border border-line bg-surface p-5 space-y-2 hover:border-line-strong transition-colors"
              >
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                  <span className="text-sm font-medium text-text">{item.error}</span>
                </div>
                <p className="text-xs text-subtle leading-relaxed pl-[26px]">{item.fix}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Next Steps */}
        <section className="rounded-xl border border-line-strong bg-surface p-8 space-y-4">
          <h2 className="text-lg font-semibold text-text">What's next?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link
              to="/docs/architecture"
              className="flex items-center justify-between px-4 py-3 rounded-lg border border-line bg-raised hover:border-line-strong transition-colors group"
            >
              <span className="text-sm text-text">View architecture</span>
              <ExternalLink className="w-3.5 h-3.5 text-muted group-hover:text-green-bright transition-colors" />
            </Link>
            <Link
              to="/docs/specifications"
              className="flex items-center justify-between px-4 py-3 rounded-lg border border-line bg-raised hover:border-line-strong transition-colors group"
            >
              <span className="text-sm text-text">Review specifications</span>
              <ExternalLink className="w-3.5 h-3.5 text-muted group-hover:text-green-bright transition-colors" />
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
};

export default GettingStartedPage;

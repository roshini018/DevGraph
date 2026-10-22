import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  AlertTriangle,
  Info,
  ExternalLink,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';

/* ─── Data ─── */

interface LanguageEntry {
  language: string;
  extensions: string;
  status: 'supported' | 'planned';
  parserNotes: string;
}

const languages: LanguageEntry[] = [
  {
    language: 'Python',
    extensions: '.py',
    status: 'supported',
    parserNotes:
      'Full AST parsing — functions, classes, methods, decorators, import resolution, and cross-file dependency tracking.',
  },
  {
    language: 'JavaScript',
    extensions: '.js, .jsx',
    status: 'planned',
    parserNotes:
      'Planned Tree-sitter grammar for ES6+ modules, CommonJS, and JSX component analysis.',
  },
  {
    language: 'TypeScript',
    extensions: '.ts, .tsx',
    status: 'planned',
    parserNotes:
      'Planned Tree-sitter grammar for TypeScript modules with type-aware symbol extraction.',
  },
  {
    language: 'Go',
    extensions: '.go',
    status: 'planned',
    parserNotes: 'Planned package-level analysis with Go module import resolution.',
  },
  {
    language: 'Java',
    extensions: '.java',
    status: 'planned',
    parserNotes: 'Planned class-level dependency analysis with package imports.',
  },
];

interface LimitEntry {
  category: string;
  limit: string;
  notes: string;
}

const limits: LimitEntry[] = [
  {
    category: 'Files per repository',
    limit: 'Up to 500 .py files',
    notes:
      'The current demo indexes 16 Python files. Production limits will be determined by the Neo4j and Qdrant backend capacity.',
  },
  {
    category: 'Branch scope',
    limit: 'Default branch only',
    notes:
      'Indexing runs against the repository\'s default branch (main or master). Multi-branch analysis is not yet supported.',
  },
  {
    category: 'File size',
    limit: 'No hard limit (demo)',
    notes:
      'In the demo, all files are loaded in-memory. Production will apply per-file byte limits for parsing stability.',
  },
  {
    category: 'Symbols per file',
    limit: 'Unlimited',
    notes:
      'The AST parser extracts all top-level and nested symbols. Deeply nested closures may be flattened.',
  },
  {
    category: 'Graph depth',
    limit: '1–3 hops (configurable)',
    notes:
      'Impact analysis supports 1, 2, or 3 hops of transitive dependency traversal.',
  },
  {
    category: 'AI questions',
    limit: '5 keyword-matched (demo)',
    notes:
      'The demo AI assistant handles 5 predefined questions. Unrecognized questions return an unverified response.',
  },
];

const knownLimitations = [
  'Only Python (.py) files are parsed in the current version. All other file types are shown as "Not analyzed".',
  'Dynamic imports (e.g., importlib) and runtime-generated code are not detected by static AST parsing.',
  'Circular dependencies are detected but may produce redundant entries in deep impact analysis.',
  'The AI assistant uses keyword matching, not a real LLM. Answers are hardcoded for 5 demo questions.',
  'OAuth flow is simulated — no real GitHub tokens are exchanged in the demo.',
  'Repository data is mocked. The demo uses a fixed "acme/my-store" repository with pre-built AST data.',
  'Decorators are tracked as metadata but not yet used for framework-specific relationship inference.',
];

const errorHandling = [
  {
    scenario: 'Network error during API call',
    behavior:
      'A red error banner appears with the error message and a green "Retry" button. The request can be retried without losing state.',
  },
  {
    scenario: 'File not found in tree',
    behavior:
      'A "File not found" message is shown in the editor pane. The file tree remains navigable.',
  },
  {
    scenario: 'Impact analysis with no results',
    behavior:
      'An empty state message is displayed. The target picker remains active for a new selection.',
  },
  {
    scenario: 'Unrecognized AI question',
    behavior:
      'The assistant returns a response with verified: false, an amber "Could not verify" banner, and no citations.',
  },
];

export const SpecificationsPage: React.FC = () => {
  const navigate = useNavigate();

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
          <span className="text-text text-xs font-mono font-medium">Specifications</span>
        </div>
        <Button variant="white" size="sm" onClick={() => navigate('/connect')}>
          Connect GitHub
        </Button>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-16 space-y-16">
        {/* Header */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Badge variant="green">Specifications</Badge>
          </div>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-[-0.03em] text-text">
            Capabilities & limits
          </h1>
          <p className="text-muted text-lg leading-relaxed max-w-2xl">
            Supported languages, repository limits, indexing scope, and known constraints of
            the current DevGraph implementation.
          </p>
        </div>

        {/* Supported Languages */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-text tracking-tight">
            Language support
          </h2>
          <div className="rounded-lg border border-line bg-surface overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line bg-raised">
                  <th className="px-5 py-3 font-mono text-[11px] text-muted uppercase tracking-wider">
                    Language
                  </th>
                  <th className="px-5 py-3 font-mono text-[11px] text-muted uppercase tracking-wider">
                    Extensions
                  </th>
                  <th className="px-5 py-3 font-mono text-[11px] text-muted uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-5 py-3 font-mono text-[11px] text-muted uppercase tracking-wider hidden md:table-cell">
                    Parser capabilities
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {languages.map((lang) => (
                  <tr key={lang.language}>
                    <td className="px-5 py-3 text-text font-medium">{lang.language}</td>
                    <td className="px-5 py-3 font-mono text-xs text-subtle">
                      {lang.extensions}
                    </td>
                    <td className="px-5 py-3">
                      <Badge
                        variant={lang.status === 'supported' ? 'green' : 'neutral'}
                      >
                        {lang.status === 'supported' ? 'Supported' : 'Planned'}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-subtle text-xs leading-relaxed hidden md:table-cell">
                      {lang.parserNotes}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Limits */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-text tracking-tight">
            Repository & indexing limits
          </h2>
          <div className="space-y-3">
            {limits.map((entry) => (
              <div
                key={entry.category}
                className="rounded-lg border border-line bg-surface p-5 hover:border-line-strong transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <h3 className="text-sm font-medium text-text">{entry.category}</h3>
                    <p className="text-xs text-subtle leading-relaxed">{entry.notes}</p>
                  </div>
                  <span className="shrink-0 px-3 py-1 rounded-full border border-line bg-raised font-mono text-[11px] text-text whitespace-nowrap">
                    {entry.limit}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Known Limitations */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-text tracking-tight">
            Known limitations
          </h2>
          <div className="rounded-lg border border-line bg-surface p-5 space-y-3">
            {knownLimitations.map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                <span className="text-sm text-subtle leading-relaxed">{item}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Error Handling */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-text tracking-tight">
            Error handling
          </h2>
          <div className="space-y-3">
            {errorHandling.map((entry, i) => (
              <div
                key={i}
                className="rounded-lg border border-line bg-surface p-5 space-y-2 hover:border-line-strong transition-colors"
              >
                <div className="flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                  <span className="text-sm font-medium text-text">{entry.scenario}</span>
                </div>
                <p className="text-xs text-subtle leading-relaxed pl-[26px]">
                  {entry.behavior}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Next Steps */}
        <section className="rounded-xl border border-line-strong bg-surface p-8 space-y-4">
          <h2 className="text-lg font-semibold text-text">Related documentation</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link
              to="/docs/getting-started"
              className="flex items-center justify-between px-4 py-3 rounded-lg border border-line bg-raised hover:border-line-strong transition-colors group"
            >
              <span className="text-sm text-text">Getting started</span>
              <ExternalLink className="w-3.5 h-3.5 text-muted group-hover:text-green-bright transition-colors" />
            </Link>
            <Link
              to="/docs/architecture"
              className="flex items-center justify-between px-4 py-3 rounded-lg border border-line bg-raised hover:border-line-strong transition-colors group"
            >
              <span className="text-sm text-text">View architecture</span>
              <ExternalLink className="w-3.5 h-3.5 text-muted group-hover:text-green-bright transition-colors" />
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
};

export default SpecificationsPage;

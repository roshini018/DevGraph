import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  GitFork,
  FileCode,
  Network,
  Database,
  Search,
  MessageSquare,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';

/* ─── pipeline stages ─── */
const pipelineStages: {
  id: string;
  label: string;
  icon: React.ReactNode;
  status: 'implemented' | 'planned';
  description: string;
  details: string[];
}[] = [
  {
    id: 'fetch',
    label: 'GitHub Fetch',
    icon: <GitFork className="w-5 h-5" />,
    status: 'implemented',
    description:
      'DevGraph authenticates via GitHub OAuth and public API to fetch repository metadata, recursive git trees, and file contents from the default branch.',
    details: [
      'Read-only OAuth tokens & public repository analysis without credentials.',
      'Fetches all files on the default branch (main / master) via recursive trees.',
      'Filters for supported multi-language file types (.py, .js, .ts, .tsx) before processing.',
    ],
  },
  {
    id: 'parse',
    label: 'AST Parsing',
    icon: <FileCode className="w-5 h-5" />,
    status: 'implemented',
    description:
      'Each code file is parsed into an Abstract Syntax Tree using Tree-sitter. The parser extracts functions, classes, methods, decorators, and module-level symbols with accurate line ranges.',
    details: [
      'Tree-sitter multi-language parser produces deterministic, reproducible results.',
      'Each symbol records its start and end line numbers for precise code mapping.',
      'Import statements are resolved to connect cross-file dependencies.',
      'Decorator and docstring metadata is preserved for framework-aware analysis.',
    ],
  },
  {
    id: 'graph',
    label: 'Graph Construction',
    icon: <Network className="w-5 h-5" />,
    status: 'implemented',
    description:
      'Extracted symbols and their relationships are assembled into a directed dependency graph. Each node is a symbol or file; each edge represents a CALLS, IMPORTS, DEFINES, or INHERITS relationship.',
    details: [
      'Nodes: files, functions, classes, methods, interfaces, and imports — each with a unique ID.',
      'Edges: exact calls, file imports, class inheritance, and structural definition.',
      'Bidirectional traversal supports both "who calls this?" and "what does this call?".',
      'Cycle detection prevents infinite traversal in circular dependency chains.',
    ],
  },
  {
    id: 'storage',
    label: 'Neo4j Graph Storage',
    icon: <Database className="w-5 h-5" />,
    status: 'implemented',
    description:
      'The constructed graph is persisted in Neo4j Aura Cloud for efficient Cypher traversal queries, blast-radius impact analysis, and relationship-based shortest-path queries.',
    details: [
      'Declarative Cypher queries for multi-hop BFS impact traversal and shortest path search.',
      'Uniqueness constraints and lookup indexes on repo_id ensure MERGE idempotency.',
      'Property graph model preserves symbol signatures, line ranges, docstrings, and metrics.',
    ],
  },
  {
    id: 'vector',
    label: 'Qdrant Vector Index',
    icon: <Search className="w-5 h-5" />,
    status: 'implemented',
    description:
      'Code chunks are embedded into dense vectors and indexed in Qdrant Cloud for semantic similarity search, enabling natural-language queries over the codebase.',
    details: [
      'Contextual code chunking preserving class and function scope boundaries.',
      'Dense embeddings map code semantics into high-dimensional vector space.',
      'Reciprocal Rank Fusion (RRF) combines vector similarity with BM25 keyword matching.',
    ],
  },
  {
    id: 'bm25',
    label: 'BM25 Keyword Search',
    icon: <Search className="w-5 h-5" />,
    status: 'implemented',
    description:
      'A code-aware BM25 index with camelCase and snake_case tokenization provides fast keyword retrieval that complements semantic vector search.',
    details: [
      'Sub-token identifier splitting tuned specifically for programming languages.',
      'Per-repository in-memory index with persistent disk caching in app/data.',
      'Fused with Qdrant vector retrieval using k=60 Reciprocal Rank Fusion.',
    ],
  },
  {
    id: 'llm',
    label: 'Agentic Answer Generation',
    icon: <MessageSquare className="w-5 h-5" />,
    status: 'implemented',
    description:
      'Retrieved code context is fed into a 4-stage LangGraph-style agent (Plan → Retrieve → Generate → Verify) that produces grounded answers with verified AST citations.',
    details: [
      'Context window populated with relevant code chunks from hybrid RAG retrieval.',
      'Graph-expanded 1-hop AST neighborhood context adds caller and callee insights.',
      'Verification step validates citations against the real AST call hierarchy.',
      'Works with live LLM keys or deterministic grounded AST chunk assembly fallback.',
    ],
  },
];

export const ArchitecturePage: React.FC = () => {
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
          <span className="text-text text-xs font-mono font-medium">Architecture</span>
        </div>
        <Button variant="white" size="sm" onClick={() => navigate('/connect')}>
          Connect GitHub
        </Button>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-16 space-y-16">
        {/* Header */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Badge variant="green">Architecture</Badge>
          </div>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-[-0.03em] text-text">
            How DevGraph works
          </h1>
          <p className="text-muted text-lg leading-relaxed max-w-2xl">
            An end-to-end look at the data pipeline — from GitHub fetch to grounded AI answers
            with citations.
          </p>
        </div>

        {/* Architecture flow diagram */}
        <section className="space-y-6">
          <h2 className="text-xl font-semibold text-text tracking-tight">Data pipeline</h2>
          <p className="text-sm text-subtle leading-relaxed">
            DevGraph processes your codebase through a multi-stage pipeline. Each stage is
            deterministic and reproducible — no probabilistic guessing.
          </p>

          {/* Visual flow */}
          <div className="rounded-xl border border-line bg-surface p-6 overflow-x-auto">
            <div className="flex items-center gap-2 min-w-max">
              {pipelineStages.map((stage, i) => (
                <React.Fragment key={stage.id}>
                  <div
                    className={`flex flex-col items-center gap-2 px-4 py-3 rounded-lg border min-w-[120px] transition-colors ${
                      stage.status === 'implemented'
                        ? 'border-green-bright/30 bg-green-bright/5'
                        : 'border-line bg-raised'
                    }`}
                  >
                    <div
                      className={
                        stage.status === 'implemented' ? 'text-green-bright' : 'text-muted'
                      }
                    >
                      {stage.icon}
                    </div>
                    <span className="text-[11px] font-mono text-text text-center leading-tight">
                      {stage.label}
                    </span>
                    <Badge
                      variant={stage.status === 'implemented' ? 'green' : 'neutral'}
                    >
                      {stage.status === 'implemented' ? 'Live' : 'Planned'}
                    </Badge>
                  </div>
                  {i < pipelineStages.length - 1 && (
                    <ArrowRight className="w-4 h-4 text-line shrink-0" />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </section>

        {/* Detailed breakdown */}
        <section className="space-y-6">
          <h2 className="text-xl font-semibold text-text tracking-tight">Stage details</h2>
          <div className="space-y-4">
            {pipelineStages.map((stage) => (
              <div
                key={stage.id}
                className="rounded-lg border border-line bg-surface p-6 space-y-4 hover:border-line-strong transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={
                        stage.status === 'implemented' ? 'text-green-bright' : 'text-muted'
                      }
                    >
                      {stage.icon}
                    </div>
                    <h3 className="font-semibold text-text text-base">{stage.label}</h3>
                  </div>
                  <Badge variant={stage.status === 'implemented' ? 'green' : 'neutral'}>
                    {stage.status === 'implemented' ? 'Implemented' : 'Planned'}
                  </Badge>
                </div>
                <p className="text-sm text-subtle leading-relaxed">{stage.description}</p>
                <ul className="space-y-2">
                  {stage.details.map((d, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-xs text-muted leading-relaxed"
                    >
                      <CheckCircle2 className="w-3 h-3 text-green-bright mt-0.5 shrink-0" />
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Current vs Planned */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-text tracking-tight">
            Implementation status
          </h2>
          <div className="rounded-lg border border-line bg-surface overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line bg-raised">
                  <th className="px-5 py-3 font-mono text-[11px] text-muted uppercase tracking-wider">
                    Component
                  </th>
                  <th className="px-5 py-3 font-mono text-[11px] text-muted uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-5 py-3 font-mono text-[11px] text-muted uppercase tracking-wider hidden sm:table-cell">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                <tr>
                  <td className="px-5 py-3 text-text">GitHub OAuth & Public Ingestion</td>
                  <td className="px-5 py-3">
                    <Badge variant="green">Live</Badge>
                  </td>
                  <td className="px-5 py-3 text-subtle text-xs hidden sm:table-cell">
                    Real GitHub OAuth 2.0 flow + public repo instant analysis without credentials
                  </td>
                </tr>
                <tr>
                  <td className="px-5 py-3 text-text">AST Parsing & Symbol Extraction</td>
                  <td className="px-5 py-3">
                    <Badge variant="green">Live</Badge>
                  </td>
                  <td className="px-5 py-3 text-subtle text-xs hidden sm:table-cell">
                    Multi-language Tree-sitter (Python, JS, TS, TSX) with accurate line ranges
                  </td>
                </tr>
                <tr>
                  <td className="px-5 py-3 text-text">Graph Construction & Visualization</td>
                  <td className="px-5 py-3">
                    <Badge variant="green">Live</Badge>
                  </td>
                  <td className="px-5 py-3 text-subtle text-xs hidden sm:table-cell">
                    React Flow + Dagre layout with dynamic swimlanes and CALLS/IMPORTS/INHERITS edges
                  </td>
                </tr>
                <tr>
                  <td className="px-5 py-3 text-text">Impact Analysis & Connection Tracing</td>
                  <td className="px-5 py-3">
                    <Badge variant="green">Live</Badge>
                  </td>
                  <td className="px-5 py-3 text-subtle text-xs hidden sm:table-cell">
                    Multi-hop BFS blast radius calculation and bidirectional shortest path tracing
                  </td>
                </tr>
                <tr>
                  <td className="px-5 py-3 text-text">AI Assistant (Agentic RAG)</td>
                  <td className="px-5 py-3">
                    <Badge variant="green">Live</Badge>
                  </td>
                  <td className="px-5 py-3 text-subtle text-xs hidden sm:table-cell">
                    4-stage LangGraph agent (Plan → Retrieve → Generate → Verify) with verified AST citations
                  </td>
                </tr>
                <tr>
                  <td className="px-5 py-3 text-text">Neo4j Persistence</td>
                  <td className="px-5 py-3">
                    <Badge variant="green">Live</Badge>
                  </td>
                  <td className="px-5 py-3 text-subtle text-xs hidden sm:table-cell">
                    Neo4j Aura Cloud persistent knowledge graph with unique constraints and Cypher queries
                  </td>
                </tr>
                <tr>
                  <td className="px-5 py-3 text-text">Qdrant Vector Search</td>
                  <td className="px-5 py-3">
                    <Badge variant="green">Live</Badge>
                  </td>
                  <td className="px-5 py-3 text-subtle text-xs hidden sm:table-cell">
                    Qdrant Cloud vector embeddings with cosine similarity search & scoped repository deletion
                  </td>
                </tr>
                <tr>
                  <td className="px-5 py-3 text-text">BM25 Keyword Search</td>
                  <td className="px-5 py-3">
                    <Badge variant="green">Live</Badge>
                  </td>
                  <td className="px-5 py-3 text-subtle text-xs hidden sm:table-cell">
                    Code-aware identifier BM25 tokenization with disk caching and RRF fusion
                  </td>
                </tr>
                <tr>
                  <td className="px-5 py-3 text-text">Grounded Answer Generation</td>
                  <td className="px-5 py-3">
                    <Badge variant="green">Live</Badge>
                  </td>
                  <td className="px-5 py-3 text-subtle text-xs hidden sm:table-cell">
                    Live LLM answer generation with deterministic grounded fallback & AST call hierarchy verification
                  </td>
                </tr>
              </tbody>
            </table>
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

export default ArchitecturePage;

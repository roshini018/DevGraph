import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ArrowRight,
  ShieldCheck,
  FileCode,
  Folder,
  FolderOpen,
  ChevronRight,
  Sparkles,
  Network,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { CodeWindow } from '../components/ui/CodeWindow';
import { DotGridBackground } from '../components/ui/DotGridBackground';
import { Badge } from '../components/ui/Badge';
import { VerdictBanner } from '../components/ui/VerdictBanner';
import { RiskPill } from '../components/ui/RiskPill';

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

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();

  const handleConnect = () => {
    navigate('/connect');
  };

  const handleExploreSample = () => {
    navigate('/w/my-store?sample=true');
  };

  return (
    <div className="min-h-screen bg-bg text-text font-sans selection:bg-green-soft selection:text-green-bright relative">
      {/* Sticky nav on bg with bottom hairline */}
      <header className="sticky top-0 z-40 bg-bg border-b border-line px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex items-center gap-2.5 text-left cursor-pointer group"
          >
            <img
              src="/devgraph-logo.png"
              alt="DevGraph"
              className="h-12 object-contain"
            />
            <Badge variant="neutral">v0.1.0</Badge>
          </button>

          {/* Nav links */}
          <nav className="hidden md:flex items-center gap-5 text-xs text-muted font-medium">
            <a
              href="#features"
              className="hover:text-text transition-colors"
            >
              Features
            </a>
            <a
              href="#how-it-works"
              className="hover:text-text transition-colors"
            >
              How it works
            </a>
            <a
              href="#documentation"
              className="hover:text-text transition-colors"
            >
              Documentation
            </a>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/connect')}
          >
            Sign in
          </Button>
          <Button
            variant="white"
            size="sm"
            onClick={handleConnect}
            leftIcon={<GithubIcon className="w-3.5 h-3.5" />}
          >
            Connect GitHub
          </Button>
        </div>
      </header>

      {/* Hero Section on DotGridBackground */}
      <section className="relative pt-20 pb-16 px-6 overflow-hidden flex flex-col items-center text-center">
        <DotGridBackground />

        <div className="relative z-10 max-w-4xl mx-auto space-y-6">
          {/* Small pill */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-line bg-raised font-mono text-xs text-muted">
            <span className="w-2 h-2 rounded-full bg-green-bright animate-pulse" />
            <span>Codebase intelligence</span>
          </div>

          {/* Headline: Geist 600, ~64px, -0.04em */}
          <h1 className="font-semibold text-4xl sm:text-5xl lg:text-[64px] tracking-[-0.04em] text-text leading-[1.08] max-w-3xl mx-auto">
            Your codebase. Connected.
          </h1>

          {/* Muted subtext (16-18px) */}
          <p className="text-muted text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
            Deterministic AST call hierarchies, blast-radius impact analysis, and
            citation-grounded AI for engineering teams navigating complex architectures.
          </p>

          {/* Hero Buttons: 1 white, 1 bordered secondary */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
            <Button
              variant="white"
              size="lg"
              onClick={handleConnect}
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Connect GitHub
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={handleExploreSample}
            >
              Explore the workspace
            </Button>
          </div>
        </div>

        {/* Product Preview built from real components */}
        <div className="w-full max-w-6xl mt-14 z-10 text-left">
          <CodeWindow
            filename="src/api/orders.py"
            tabs={['src/api/orders.py', 'src/services/payment_service.py', 'acme/call_graph.ast']}
            activeTab="src/api/orders.py"
          >
            {/* HackerRank / Vercel IDE Multi-Pane Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[380px] bg-ide divide-y lg:divide-y-0 lg:divide-x divide-line -m-4">
              {/* Left Pane: Indented Tree (3 cols) */}
              <div className="lg:col-span-3 p-3 bg-surface/50 font-mono text-xs space-y-1 select-none">
                <div className="text-[10px] uppercase font-semibold text-subtle tracking-wider px-2 py-1">
                  acme / my-store
                </div>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 px-2 py-1 text-muted">
                    <FolderOpen className="w-3.5 h-3.5 text-slate" />
                    <span>src</span>
                  </div>
                  <div className="pl-4 space-y-0.5">
                    <div className="flex items-center gap-1.5 px-2 py-1 text-muted">
                      <FolderOpen className="w-3.5 h-3.5 text-slate" />
                      <span>api</span>
                    </div>
                    <div className="pl-4">
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-raised border border-line text-green-bright font-medium">
                        <FileCode className="w-3.5 h-3.5 text-green-bright" />
                        <span>orders.py</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 px-2 py-1 text-muted">
                      <Folder className="w-3.5 h-3.5 text-subtle" />
                      <span>services</span>
                    </div>
                    <div className="pl-4 space-y-0.5 text-subtle">
                      <div className="flex items-center gap-1.5 px-2 py-1 hover:text-muted cursor-pointer">
                        <FileCode className="w-3.5 h-3.5" />
                        <span>order_service.py</span>
                      </div>
                      <div className="flex items-center gap-1.5 px-2 py-1 hover:text-muted cursor-pointer">
                        <FileCode className="w-3.5 h-3.5" />
                        <span>payment_service.py</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 px-2 py-1 text-muted">
                      <Folder className="w-3.5 h-3.5 text-subtle" />
                      <span>utils</span>
                    </div>
                    <div className="pl-4 text-subtle">
                      <div className="flex items-center gap-1.5 px-2 py-1 hover:text-muted cursor-pointer">
                        <FileCode className="w-3.5 h-3.5" />
                        <span>validators.py</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Center Pane: Code with syntax colors & line numbers (5 cols) */}
              <div className="lg:col-span-5 p-4 bg-ide font-mono text-xs overflow-x-auto">
                <div className="space-y-1 text-text leading-relaxed">
                  <div className="flex gap-4">
                    <span className="text-subtle select-none w-5 text-right">1</span>
                    <span>
                      <span className="text-terracotta">from</span> typing <span className="text-terracotta">import</span> Dict, Any
                    </span>
                  </div>
                  <div className="flex gap-4">
                    <span className="text-subtle select-none w-5 text-right">2</span>
                    <span>
                      <span className="text-terracotta">from</span> src.services.order_service <span className="text-terracotta">import</span> create_order
                    </span>
                  </div>
                  <div className="flex gap-4">
                    <span className="text-subtle select-none w-5 text-right">3</span>
                    <span className="text-subtle select-none">&nbsp;</span>
                  </div>
                  <div className="flex gap-4 bg-raised/40 -mx-4 px-4 border-l-2 border-green-bright">
                    <span className="text-subtle select-none w-5 text-right">4</span>
                    <span>
                      <span className="text-terracotta">def</span>{' '}
                      <span className="text-green-bright font-semibold">place_order</span>(payload: Dict[str, Any]):
                    </span>
                  </div>
                  <div className="flex gap-4">
                    <span className="text-subtle select-none w-5 text-right">5</span>
                    <span className="text-muted pl-4">
                      &quot;&quot;&quot;Validate customer payload and dispatch payment.&quot;&quot;&quot;
                    </span>
                  </div>
                  <div className="flex gap-4">
                    <span className="text-subtle select-none w-5 text-right">6</span>
                    <span className="pl-4">
                      user_id = payload.get(<span className="text-ember">&quot;user_id&quot;</span>)
                    </span>
                  </div>
                  <div className="flex gap-4">
                    <span className="text-subtle select-none w-5 text-right">7</span>
                    <span className="pl-4">
                      amount = payload.get(<span className="text-ember">&quot;amount&quot;</span>, 0.0)
                    </span>
                  </div>
                  <div className="flex gap-4">
                    <span className="text-subtle select-none w-5 text-right">8</span>
                    <span className="pl-4">
                      order = <span className="text-slate">create_order</span>(user_id, amount)
                    </span>
                  </div>
                  <div className="flex gap-4">
                    <span className="text-subtle select-none w-5 text-right">9</span>
                    <span className="pl-4">
                      <span className="text-terracotta">return</span> &#123; <span className="text-ember">&quot;order_id&quot;</span>: order.id, <span className="text-ember">&quot;status&quot;</span>: <span className="text-green-bright">&quot;paid&quot;</span> &#125;
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Pane: Small Graph (5-7 nodes with VISIBLE edges) + Grounded AI (4 cols) */}
              <div className="lg:col-span-4 flex flex-col divide-y divide-line bg-surface/30">
                {/* Small Graph Section (5 to 7 nodes with visible edges) */}
                <div className="p-3 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-muted font-semibold flex items-center gap-1.5">
                      <Network className="w-3.5 h-3.5 text-green-bright" />
                      AST Call Graph
                    </span>
                    <span className="text-[10px] text-subtle">6 nodes • 6 edges</span>
                  </div>

                  {/* Graph Canvas with VISIBLE directional SVG edges */}
                  <div className="relative h-44 bg-ide rounded border border-line p-2 overflow-hidden select-none">
                    <svg
                      className="absolute inset-0 w-full h-full pointer-events-none"
                      style={{ overflow: 'visible' }}
                    >
                      <defs>
                        <marker
                          id="arrow-green"
                          viewBox="0 0 10 10"
                          refX="6"
                          refY="5"
                          markerWidth="5"
                          markerHeight="5"
                          orient="auto-start-reverse"
                        >
                          <path d="M 0 1 L 8 5 L 0 9 z" fill="#1BA94C" />
                        </marker>
                        <marker
                          id="arrow-subtle"
                          viewBox="0 0 10 10"
                          refX="6"
                          refY="5"
                          markerWidth="5"
                          markerHeight="5"
                          orient="auto-start-reverse"
                        >
                          <path d="M 0 1 L 8 5 L 0 9 z" fill="#737373" />
                        </marker>
                      </defs>

                      {/* Explicit, visible connector lines */}
                      {/* Node 1 to Node 2 */}
                      <line
                        x1="80"
                        y1="24"
                        x2="80"
                        y2="66"
                        stroke="#1BA94C"
                        strokeWidth="1.5"
                        markerEnd="url(#arrow-green)"
                      />
                      {/* Node 2 to Node 3 */}
                      <line
                        x1="80"
                        y1="88"
                        x2="80"
                        y2="130"
                        stroke="#1BA94C"
                        strokeWidth="1.5"
                        markerEnd="url(#arrow-green)"
                      />
                      {/* Node 2 to Node 4 (hub) */}
                      <path
                        d="M 125 76 C 160 76, 175 45, 195 35"
                        fill="none"
                        stroke="#737373"
                        strokeWidth="1.5"
                        markerEnd="url(#arrow-subtle)"
                      />
                      {/* Node 3 to Node 4 */}
                      <path
                        d="M 130 140 C 165 140, 180 65, 195 45"
                        fill="none"
                        stroke="#737373"
                        strokeWidth="1.5"
                        markerEnd="url(#arrow-subtle)"
                      />
                      {/* Node 4 to Node 5 */}
                      <line
                        x1="225"
                        y1="48"
                        x2="225"
                        y2="88"
                        stroke="#737373"
                        strokeWidth="1.5"
                        markerEnd="url(#arrow-subtle)"
                      />
                      {/* Node 5 to Node 6 */}
                      <line
                        x1="225"
                        y1="108"
                        x2="225"
                        y2="138"
                        stroke="#737373"
                        strokeWidth="1.5"
                        markerEnd="url(#arrow-subtle)"
                      />
                    </svg>

                    {/* Nodes positioned absolutely */}
                    <div className="absolute top-2 left-5 px-2 py-1 rounded bg-raised border border-green-bright text-[10px] font-mono text-green-bright shadow">
                      place_order
                    </div>
                    <div className="absolute top-[66px] left-5 px-2 py-1 rounded bg-surface border border-line-strong text-[10px] font-mono text-text">
                      create_order
                    </div>
                    <div className="absolute top-[130px] left-4 px-2 py-1 rounded bg-surface border border-line text-[10px] font-mono text-muted">
                      charge_payment
                    </div>
                    <div className="absolute top-4 left-[175px] px-2 py-1 rounded bg-raised border border-terracotta text-[10px] font-mono text-terracotta">
                      validate_amount (hub)
                    </div>
                    <div className="absolute top-[88px] left-[185px] px-2 py-1 rounded bg-surface border border-line text-[10px] font-mono text-slate">
                      Payment (model)
                    </div>
                    <div className="absolute top-[138px] left-[180px] px-2 py-1 rounded bg-surface border border-line text-[10px] font-mono text-subtle">
                      Notification
                    </div>
                  </div>
                </div>

                {/* AI Answer with Citation & Verified Verdict */}
                <div className="p-3 space-y-2 flex-1 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-mono text-text">
                      <Sparkles className="w-3.5 h-3.5 text-green-bright" />
                      <span className="font-semibold">AI Architectural Assistant</span>
                    </div>

                    <p className="text-[11px] text-muted leading-relaxed">
                      Tracing downstream impact from <span className="font-mono text-green-bright">place_order</span>: calls{' '}
                      <span className="font-mono text-text">create_order</span>, which delegates validation to central hub{' '}
                      <span className="font-mono text-terracotta">validate_amount</span>.
                    </p>

                    {/* One Citation Evidence */}
                    <div className="p-2 rounded bg-raised border border-line font-mono text-[10px] space-y-1">
                      <div className="flex items-center justify-between text-subtle">
                        <span className="text-text font-medium">src/services/order_service.py:18-24</span>
                        <Badge variant="success">AST Verified</Badge>
                      </div>
                      <div className="text-muted truncate">
                        validate_amount(amount) -&gt; charge_payment(order.id)
                      </div>
                    </div>
                  </div>

                  {/* Verified Verdict Banner */}
                  <VerdictBanner
                    status="passed"
                    title="Verified 100%"
                    summary="All call paths grounded in deterministic AST citations with 0 hallucinated edges."
                    metadata="14ms latency"
                    className="py-2 px-2.5 text-xs"
                  />
                </div>
              </div>
            </div>
          </CodeWindow>
        </div>
      </section>

      {/* Sections Stack: 96px vertical padding (py-24), hairline separators */}

      {/* FEATURES SECTION (Bento Grid) */}
      <section
        id="features"
        className="py-24 border-t border-line px-6 max-w-6xl mx-auto space-y-12"
      >
        <div className="max-w-2xl space-y-3">
          <div className="text-xs font-mono font-semibold text-green-bright uppercase tracking-wider">
            Capabilities
          </div>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-text">
            Architecture understanding at AST scale
          </h2>
          <p className="text-muted text-base leading-relaxed">
            Deterministic compiler parsing beats probabilistic guessing. DevGraph
            constructs exact relational graphs from your abstract syntax trees.
          </p>
        </div>

        {/* Bento Grid: 3 bordered cards with mini visuals */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Explore dependencies */}
          <div className="p-6 rounded-lg border border-line bg-surface space-y-4 flex flex-col justify-between hover:border-line-strong transition-colors">
            <div className="space-y-2">
              <div className="w-9 h-9 rounded bg-raised border border-line flex items-center justify-center text-text mb-2">
                <Network className="w-5 h-5 text-green-bright" />
              </div>
              <h3 className="font-semibold text-text text-lg tracking-tight">
                Explore dependencies
              </h3>
              <p className="text-sm text-subtle leading-relaxed">
                Traverse call hierarchies, module imports, and class inheritance trees.
                Every edge links directly to source line numbers.
              </p>
            </div>

            {/* Mini Visual: Node & Edge Pills */}
            <div className="p-3 rounded bg-ide border border-line font-mono text-xs space-y-2">
              <div className="flex items-center justify-between text-subtle text-[11px]">
                <span>54 symbols</span>
                <span className="text-green-bright">90 resolved edges</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-raised border border-line text-[11px] text-text">
                  place_order
                </span>
                <span className="text-green-bright font-bold">→</span>
                <span className="px-2 py-0.5 rounded bg-raised border border-line text-[11px] text-text">
                  create_order
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: Predict change impact */}
          <div className="p-6 rounded-lg border border-line bg-surface space-y-4 flex flex-col justify-between hover:border-line-strong transition-colors">
            <div className="space-y-2">
              <div className="w-9 h-9 rounded bg-raised border border-line flex items-center justify-center text-text mb-2">
                <ShieldCheck className="w-5 h-5 text-terracotta" />
              </div>
              <h3 className="font-semibold text-text text-lg tracking-tight">
                Predict change impact
              </h3>
              <p className="text-sm text-subtle leading-relaxed">
                Compute blast-radius depth across all upstream callers and downstream
                dependencies before merging refactors or schema shifts.
              </p>
            </div>

            {/* Mini Visual: Risk Pill & Stats */}
            <div className="p-3 rounded bg-ide border border-line font-mono text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-subtle text-[11px]">Target: validate_amount</span>
                <RiskPill risk="high" />
              </div>
              <div className="flex items-center justify-between text-[11px] text-subtle">
                <span>Blast radius: 4 hops</span>
                <span className="text-text font-medium">9 affected symbols</span>
              </div>
            </div>
          </div>

          {/* Card 3: Ask grounded AI */}
          <div className="p-6 rounded-lg border border-line bg-surface space-y-4 flex flex-col justify-between hover:border-line-strong transition-colors">
            <div className="space-y-2">
              <div className="w-9 h-9 rounded bg-raised border border-line flex items-center justify-center text-text mb-2">
                <Sparkles className="w-5 h-5 text-green-bright" />
              </div>
              <h3 className="font-semibold text-text text-lg tracking-tight">
                Ask grounded AI
              </h3>
              <p className="text-sm text-subtle leading-relaxed">
                Query an architectural assistant that cannot hallucinate. Every statement
                is paired with verified AST citations and file offsets.
              </p>
            </div>

            {/* Mini Visual: Citation Snippet */}
            <div className="p-3 rounded bg-ide border border-line font-mono text-xs space-y-1.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-green-bright font-medium">Verified citation</span>
                <span className="text-subtle">18ms</span>
              </div>
              <div className="text-[11px] text-muted truncate">
                def charge_payment(order_id: str)...
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS SECTION */}
      <section
        id="how-it-works"
        className="py-24 border-t border-line px-6 max-w-6xl mx-auto space-y-12"
      >
        <div className="max-w-2xl space-y-3">
          <div className="text-xs font-mono font-semibold text-green-bright uppercase tracking-wider">
            Pipeline
          </div>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-text">
            From raw repository to verifiable graph
          </h2>
          <p className="text-muted text-base leading-relaxed">
            Three automated stages transform source code into a queryable knowledge graph.
          </p>
        </div>

        {/* Three Numbered Columns: 01, 02, 03 in Geist Mono */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="space-y-3 p-6 rounded-lg border border-line bg-surface">
            <div className="font-mono text-2xl font-semibold text-green-bright">
              01
            </div>
            <h3 className="font-semibold text-text text-base">
              Connect repository &amp; index AST
            </h3>
            <p className="text-sm text-subtle leading-relaxed">
              Authenticate via GitHub OAuth. DevGraph fetches your default branch,
              parses module scopes, and extracts classes, functions, and import statements in-memory.
            </p>
          </div>

          <div className="space-y-3 p-6 rounded-lg border border-line bg-surface">
            <div className="font-mono text-2xl font-semibold text-green-bright">
              02
            </div>
            <h3 className="font-semibold text-text text-base">
              Traverse deterministic call graph
            </h3>
            <p className="text-sm text-subtle leading-relaxed">
              Nodes and directional edges are organized into an interactive DAG.
              Blast-radius algorithms compute shortest paths across all dependents.
            </p>
          </div>

          <div className="space-y-3 p-6 rounded-lg border border-line bg-surface">
            <div className="font-mono text-2xl font-semibold text-green-bright">
              03
            </div>
            <h3 className="font-semibold text-text text-base">
              Verify and refactor with grounded AI
            </h3>
            <p className="text-sm text-subtle leading-relaxed">
              Inspect test cases, run symbol connection traces, and ask architectural
              questions with mathematically grounded code citations.
            </p>
          </div>
        </div>
      </section>

      {/* DOCUMENTATION SECTION */}
      <section
        id="documentation"
        className="py-24 border-t border-line px-6 max-w-6xl mx-auto space-y-12"
      >
        <div className="max-w-2xl space-y-3">
          <div className="text-xs font-mono font-semibold text-green-bright uppercase tracking-wider">
            Documentation
          </div>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-text">
            Built for developers and platform teams
          </h2>
          <p className="text-muted text-base leading-relaxed">
            Everything you need to know about DevGraph’s AST engine and architecture.
          </p>
        </div>

        {/* Three Bordered Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link
            to="/docs/getting-started"
            className="p-6 rounded-lg border border-line bg-surface space-y-3 flex flex-col justify-between hover:border-line-strong hover:bg-raised/40 transition-all group block cursor-pointer"
          >
            <div className="space-y-2">
              <span className="text-[11px] font-mono text-subtle uppercase">Guide</span>
              <h3 className="font-semibold text-text text-base group-hover:text-green-bright transition-colors">
                Getting started
              </h3>
              <p className="text-xs text-subtle leading-relaxed">
                Learn how to authorize DevGraph with read-only OAuth, choose your repository,
                and inspect your first interactive call hierarchy in under 60 seconds.
              </p>
            </div>
            <div className="pt-2">
              <span className="text-xs font-mono text-green-bright flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                Read quickstart <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </Link>

          <Link
            to="/docs/architecture"
            className="p-6 rounded-lg border border-line bg-surface space-y-3 flex flex-col justify-between hover:border-line-strong hover:bg-raised/40 transition-all group block cursor-pointer"
          >
            <div className="space-y-2">
              <span className="text-[11px] font-mono text-subtle uppercase">Architecture</span>
              <h3 className="font-semibold text-text text-base group-hover:text-green-bright transition-colors">
                How indexing works
              </h3>
              <p className="text-xs text-subtle leading-relaxed">
                Explore the internal AST parser, symbol resolution algorithm, import
                path resolver, and the Dagre layout engine for dependency rendering.
              </p>
            </div>
            <div className="pt-2">
              <span className="text-xs font-mono text-green-bright flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                View architecture <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </Link>

          <Link
            to="/docs/specifications"
            className="p-6 rounded-lg border border-line bg-surface space-y-3 flex flex-col justify-between hover:border-line-strong hover:bg-raised/40 transition-all group block cursor-pointer"
          >
            <div className="space-y-2">
              <span className="text-[11px] font-mono text-subtle uppercase">Specifications</span>
              <h3 className="font-semibold text-text text-base group-hover:text-green-bright transition-colors">
                Current limits
              </h3>
              <p className="text-xs text-subtle leading-relaxed">
                Python 3.9+ AST syntax support, default branch indexing, max 500 files
                per repository, and in-memory execution guarantees with zero code persistence.
              </p>
            </div>
            <div className="pt-2">
              <span className="text-xs font-mono text-green-bright flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                Review limits <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </div>
          </Link>
        </div>
      </section>

      {/* FINAL CTA BAND */}
      <section className="py-24 border-t border-line px-6">
        <div className="max-w-4xl mx-auto rounded-xl border border-line-strong bg-surface p-10 sm:p-14 text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-line bg-raised font-mono text-xs text-muted">
            <span className="w-2 h-2 rounded-full bg-green-bright" />
            <span>Ready for production</span>
          </div>

          <h2 className="text-3xl sm:text-5xl font-semibold tracking-[-0.03em] text-text max-w-2xl mx-auto">
            Your codebase. Connected.
          </h2>

          <p className="text-muted text-base max-w-xl mx-auto leading-relaxed">
            Stop guessing what breaks when you refactor. Index your repository in seconds
            and verify change impact with mathematical certainty.
          </p>

          <div className="pt-2">
            <Button
              variant="white"
              size="lg"
              onClick={handleConnect}
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Connect GitHub
            </Button>
          </div>
        </div>
      </section>

      {/* FOOTER: 4 Columns with copyright */}
      <footer className="border-t border-line px-6 py-16 bg-bg text-xs font-sans text-subtle">
        <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 pb-12 border-b border-line">
          <div className="space-y-3">
            <div className="font-semibold text-text uppercase tracking-wider text-[11px] font-mono">
              Product
            </div>
            <ul className="space-y-2">
              <li>
                <a href="#features" className="hover:text-text transition-colors">
                  Features
                </a>
              </li>
              <li>
                <button
                  type="button"
                  onClick={handleExploreSample}
                  className="hover:text-text transition-colors text-left"
                >
                  Interactive Workspace
                </button>
              </li>
              <li>
                <a href="#features" className="hover:text-text transition-colors">
                  Impact Engine
                </a>
              </li>
              <li>
                <a href="#features" className="hover:text-text transition-colors">
                  AST Parser
                </a>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <div className="font-semibold text-text uppercase tracking-wider text-[11px] font-mono">
              Resources
            </div>
            <ul className="space-y-2">
              <li>
                <Link to="/docs/getting-started" className="hover:text-text transition-colors">
                  Getting Started
                </Link>
              </li>
              <li>
                <Link to="/docs/architecture" className="hover:text-text transition-colors">
                  Architecture
                </Link>
              </li>
              <li>
                <Link to="/docs/specifications" className="hover:text-text transition-colors">
                  Specifications
                </Link>
              </li>
              <li>
                <span className="text-muted">API Reference (v1)</span>
              </li>
              <li>
                <span className="text-muted">System Status: Operational</span>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <div className="font-semibold text-text uppercase tracking-wider text-[11px] font-mono">
              GitHub
            </div>
            <ul className="space-y-2">
              <li>
                <button
                  type="button"
                  onClick={handleConnect}
                  className="hover:text-text transition-colors text-left"
                >
                  Connect Repository
                </button>
              </li>
              <li>
                <span className="text-muted">Release Notes</span>
              </li>
              <li>
                <span className="text-muted">Discussions</span>
              </li>
              <li>
                <span className="text-muted">Security Advisories</span>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <div className="font-semibold text-text uppercase tracking-wider text-[11px] font-mono">
              Legal
            </div>
            <ul className="space-y-2">
              <li>
                <span className="hover:text-text cursor-pointer transition-colors">
                  Privacy Policy
                </span>
              </li>
              <li>
                <span className="hover:text-text cursor-pointer transition-colors">
                  Terms of Service
                </span>
              </li>
              <li>
                <span className="hover:text-text cursor-pointer transition-colors">
                  Security Model
                </span>
              </li>
              <li>
                <span className="hover:text-text cursor-pointer transition-colors">
                  Read-Only Guarantee
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="max-w-6xl mx-auto pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-[11px]">
          <div>&copy; 2026 DevGraph. All rights reserved.</div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-muted">
              <span className="w-1.5 h-1.5 rounded-full bg-green-bright" />
              AST Engine: Ready
            </span>
            <span>acme / my-store</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;

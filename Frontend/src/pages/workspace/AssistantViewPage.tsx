import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Plus,
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  Send,
  Loader2,
  FileCode,
  ChevronRight,
  GitBranch,
  BookOpen,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { ask } from '../../api/client';
import { Button } from '../../components/ui/Button';
import { EvidenceCard } from '../../components/ui/EvidenceCard';
import { Badge } from '../../components/ui/Badge';
import { KbdHint } from '../../components/ui/KbdHint';

interface SuggestedPrompt {
  id: string;
  title: string;
  query: string;
  desc: string;
  category: string;
}

const FIVE_SUGGESTED_PROMPTS: SuggestedPrompt[] = [
  {
    id: 'p1',
    title: 'Explain the architecture of orders.py',
    query: 'Explain the architecture and order creation flow in orders.py',
    desc: 'Trace order creation from HTTP handler to domain models and fulfillment',
    category: 'Architecture',
  },
  {
    id: 'p2',
    title: 'Who calls the place_order function?',
    query: 'Who calls place_order across the codebase?',
    desc: 'Inspect incoming test suites and callers from the AST call graph',
    category: 'Hierarchy',
  },
  {
    id: 'p3',
    title: 'What depends on validators.py?',
    query: 'What depends on src/utils/validators.py module?',
    desc: 'Identify modules importing validation primitives and helper functions',
    category: 'Dependencies',
  },
  {
    id: 'p4',
    title: 'What might break if I change validate_amount?',
    query: 'What might break if I change validate_amount function?',
    desc: 'Compute blast radius across payment and order checkout services',
    category: 'Blast Radius',
  },
  {
    id: 'p5',
    title: 'How does payment settlement work?',
    query: 'How does payment processing and settlement work?',
    desc: 'Examine payment gateway delegation and Payment model hierarchy',
    category: 'Flow Trace',
  },
];

const RECENT_CONVERSATIONS = [
  { id: 'rc-1', title: 'Payment settlement flow', date: 'Today' },
  { id: 'rc-2', title: 'Order dispatch & validation', date: 'Yesterday' },
  { id: 'rc-3', title: 'Validate amount blast radius', date: 'Oct 20' },
  { id: 'rc-4', title: 'Caller hierarchy test trace', date: 'Oct 19' },
];

export const AssistantViewPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    conversation,
    addMessage,
    clearConversation,
    selectedRepo,
  } = useAppStore();

  const repoId = selectedRepo?.repo_name || 'my-store';
  const repoName = selectedRepo?.full_name || 'acme/my-store';

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation, loading]);

  // Default selected answer to the latest assistant message with citations
  const selectedMessage = React.useMemo(() => {
    if (selectedMsgId) {
      const match = conversation.find(m => m.id === selectedMsgId);
      if (match) return match;
    }
    // Fallback to the latest assistant message
    for (let i = conversation.length - 1; i >= 0; i--) {
      if (conversation[i].sender === 'assistant') {
        return conversation[i];
      }
    }
    return null;
  }, [conversation, selectedMsgId]);

  const handleAsk = async (queryText?: string) => {
    const prompt = (queryText || input).trim();
    if (!prompt || loading) return;

    setInput('');
    addMessage({
      sender: 'user',
      content: prompt,
    });

    setLoading(true);

    try {
      const result = await ask(prompt, repoId);
      addMessage({
        sender: 'assistant',
        content: result.answer,
        verified: result.verified,
        latency_ms: result.latency_ms,
        citations: result.citations,
      });
    } catch {
      addMessage({
        sender: 'assistant',
        content: 'Failed to query codebase index. Please retry.',
        verified: false,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex h-full bg-ide text-text font-sans select-none overflow-hidden">
      {/* 1. LEFT SIDEBAR (repo context, recent conversations, New conversation) */}
      <aside className="w-64 bg-surface border-r border-line flex flex-col shrink-0 overflow-hidden text-xs">
        {/* Repo Context Card */}
        <div className="p-4 border-b border-line space-y-2.5 bg-surface">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] font-semibold text-subtle uppercase tracking-wider">
              Repository Context
            </span>
            <Badge variant="success">AST Ready</Badge>
          </div>

          <div className="space-y-1">
            <div className="font-semibold text-text text-sm truncate">{repoName}</div>
            <div className="flex items-center gap-2 text-subtle text-[11px] font-mono">
              <span className="flex items-center gap-1">
                <GitBranch className="w-3 h-3 text-slate" />
                <span>main</span>
              </span>
              <span>•</span>
              <span>Python 3.11</span>
            </div>
            <div className="text-[11px] text-muted font-mono pt-1">
              16 files • 54 symbols • 90 edges
            </div>
          </div>

          {/* New Conversation Button */}
          <Button
            variant="secondary"
            size="sm"
            onClick={clearConversation}
            className="w-full text-xs justify-start"
            leftIcon={<Plus className="w-3.5 h-3.5 text-green-bright" />}
          >
            New conversation
          </Button>
        </div>

        {/* Recent Conversations */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          <div className="text-[10px] font-mono uppercase text-subtle tracking-wider px-2">
            Recent Inquiries
          </div>

          <div className="space-y-1">
            {RECENT_CONVERSATIONS.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleAsk(item.title)}
                className="w-full p-2 rounded hover:bg-raised text-left flex items-center justify-between text-muted hover:text-text transition-colors group"
              >
                <div className="flex items-center gap-2 truncate">
                  <MessageSquare className="w-3.5 h-3.5 text-subtle group-hover:text-green-bright transition-colors shrink-0" />
                  <span className="truncate">{item.title}</span>
                </div>
                <span className="text-[10px] text-subtle shrink-0">{item.date}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Grounding Status Indicator */}
        <div className="p-3 border-t border-line bg-raised/30 font-mono text-[11px] text-subtle flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-bright" />
            <span>Citation engine</span>
          </span>
          <span className="text-green-bright font-semibold">100% Deterministic</span>
        </div>
      </aside>

      {/* 2. CENTER CONVERSATION COLUMN (centered 720px, composer pinned to bottom) */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-ide relative">
        <div className="flex-1 overflow-y-auto p-6 select-text">
          <div className="max-w-[720px] w-full mx-auto space-y-6">
            {conversation.length === 0 ? (
              /* WELCOME STATE: 'Ask your codebase anything.' with 5 suggested prompts as bordered cards */
              <div className="py-12 space-y-8 select-none">
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-line bg-raised font-mono text-xs text-muted">
                    <Sparkles className="w-3.5 h-3.5 text-green-bright" />
                    <span>Deterministic Codebase Assistant</span>
                  </div>
                  <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-text">
                    Ask your codebase anything.
                  </h1>
                  <p className="text-muted text-sm leading-relaxed max-w-xl">
                    Queries are synthesized from verified abstract syntax trees, symbol inheritance hierarchies, and shortest-path blast radius calculations.
                  </p>
                </div>

                {/* 5 Suggested Prompts as Bordered Cards */}
                <div className="space-y-3">
                  <div className="text-[11px] font-mono uppercase text-subtle tracking-wider">
                    Recommended Architectural Questions
                  </div>

                  <div className="grid grid-cols-1 gap-2.5">
                    {FIVE_SUGGESTED_PROMPTS.map(p => (
                      <div
                        key={p.id}
                        onClick={() => handleAsk(p.query)}
                        className="p-3.5 rounded-lg border border-line bg-surface hover:bg-raised hover:border-line-strong cursor-pointer transition-all flex items-center justify-between group"
                      >
                        <div className="space-y-1 min-w-0 pr-4">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-raised border border-line text-subtle">
                              {p.category}
                            </span>
                            <span className="font-semibold text-text text-xs group-hover:text-green-bright transition-colors truncate">
                              {p.title}
                            </span>
                          </div>
                          <p className="text-subtle text-[11px] line-clamp-1">
                            {p.desc}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-subtle group-hover:text-green-bright group-hover:translate-x-0.5 transition-all shrink-0" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* ACTIVE CONVERSATION THREAD */
              conversation.map(msg => {
                const isSelected = selectedMsgId === msg.id || selectedMessage?.id === msg.id;

                return (
                  <div
                    key={msg.id}
                    onClick={() => {
                      if (msg.sender === 'assistant') setSelectedMsgId(msg.id);
                    }}
                    className={`space-y-2 cursor-pointer transition-opacity ${
                      msg.sender === 'assistant' && !isSelected ? 'opacity-85 hover:opacity-100' : ''
                    }`}
                  >
                    {/* Header: Sender tag */}
                    <div
                      className={`flex items-center gap-2 text-[10px] font-mono text-subtle px-1 ${
                        msg.sender === 'user' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <span>{msg.sender === 'user' ? 'You' : 'DevGraph AI'}</span>
                      {msg.latency_ms && msg.sender === 'assistant' && (
                        <span>• {msg.latency_ms}ms</span>
                      )}
                    </div>

                    {/* Bubble Content */}
                    {msg.sender === 'user' ? (
                      /* User message as a raised bubble */
                      <div className="flex justify-end">
                        <div className="p-3.5 rounded-lg border border-line-strong bg-raised text-text max-w-[85%] text-xs leading-relaxed font-sans shadow-md">
                          {msg.content}
                        </div>
                      </div>
                    ) : (
                      /* Assistant Answer: VISUALLY SEPARATE VERIFIED EVIDENCE FROM INFERRED STATEMENTS */
                      <div className="space-y-3">
                        {/* 1. Verified Evidence Banner */}
                        {typeof msg.verified === 'boolean' && (
                          <div>
                            {msg.verified ? (
                              <div className="p-3 rounded-lg bg-green-soft border border-green/40 flex items-center justify-between text-xs text-green-bright font-mono">
                                <div className="flex items-center gap-2">
                                  <CheckCircle2 className="w-4 h-4 text-green-bright shrink-0" />
                                  <span className="font-semibold uppercase tracking-wider text-[11px]">
                                    Verified Evidence
                                  </span>
                                  <span className="text-[10px] text-green-bright/80 hidden sm:inline">
                                    • Exact AST proofs matched
                                  </span>
                                </div>
                                <span className="text-[10px] text-green-bright/70 font-mono">
                                  {msg.citations?.length || 0} citations
                                </span>
                              </div>
                            ) : (
                              <div className="p-3 rounded-lg bg-ember/10 border border-ember/40 flex items-center justify-between text-xs text-ember font-mono">
                                <div className="flex items-center gap-2">
                                  <AlertTriangle className="w-4 h-4 text-ember shrink-0" />
                                  <span className="font-semibold uppercase tracking-wider text-[11px]">
                                    Could not verify this answer
                                  </span>
                                </div>
                                <span className="text-[10px] text-subtle">Unverified</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* 2. Inferred Statements & Architectural Analysis */}
                        <div className="p-4 rounded-lg border border-line bg-surface space-y-3 font-sans">
                          <div className="text-[10px] font-mono font-semibold uppercase tracking-wider text-subtle flex items-center gap-1.5">
                            <Sparkles className="w-3 h-3 text-green-bright" />
                            <span>Synthesized Architectural Analysis</span>
                          </div>
                          <div className="text-text text-xs leading-relaxed whitespace-pre-wrap">
                            {msg.content}
                          </div>
                        </div>

                        {/* 3. Citations Summary if verified */}
                        {msg.citations && msg.citations.length > 0 && (
                          <div className="p-3 rounded-lg border border-line bg-ide font-mono text-xs space-y-2">
                            <div className="text-[10px] uppercase font-semibold text-subtle flex items-center justify-between">
                              <span>Underlying Source Evidence</span>
                              <span className="text-green-bright text-[10px]">
                                {msg.citations.length} AST citations mapped
                              </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {msg.citations.map(cit => (
                                <div
                                  key={cit.id}
                                  className="p-2 rounded bg-surface border border-line flex items-center justify-between text-[11px]"
                                >
                                  <span className="text-text font-medium truncate">{cit.symbol}</span>
                                  <span className="text-subtle text-[10px] truncate">{cit.file_path}:{cit.start_line}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {/* Loading Indicator */}
            {loading && (
              <div className="p-3.5 rounded-lg bg-surface border border-line flex items-center gap-3 text-xs text-subtle font-mono animate-pulse">
                <Loader2 className="w-4 h-4 text-green-bright animate-spin" />
                <span>Searching codebase AST &amp; calculating blast radius...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* PINNED COMPOSER AT BOTTOM (Centered 720px) */}
        <div className="p-4 border-t border-line bg-surface/90 backdrop-blur-sm shrink-0 select-none">
          <div className="max-w-[720px] w-full mx-auto">
            <form
              onSubmit={e => {
                e.preventDefault();
                handleAsk();
              }}
              className="relative rounded-lg border border-line-strong bg-ide focus-within:border-text transition-colors p-2.5 space-y-2"
            >
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    handleAsk();
                  }
                }}
                placeholder="Ask about call chains, module dependencies, or change impact..."
                rows={2}
                className="w-full resize-none bg-transparent text-xs text-text placeholder:text-subtle outline-none font-sans leading-relaxed"
              />

              <div className="flex items-center justify-between pt-1 text-[11px] font-mono text-subtle">
                <div className="flex items-center gap-1.5 text-[10px]">
                  <KbdHint>⌘</KbdHint>
                  <KbdHint>↵</KbdHint>
                  <span>to ask</span>
                </div>

                <Button
                  type="submit"
                  variant="green"
                  size="sm"
                  disabled={!input.trim() || loading}
                  isLoading={loading}
                  leftIcon={<Send className="w-3 h-3" />}
                >
                  Ask DevGraph
                </Button>
              </div>
            </form>
          </div>
        </div>
      </main>

      {/* 3. RIGHT EVIDENCE PANEL FOR THE SELECTED ANSWER */}
      <aside className="w-80 bg-surface border-l border-line flex flex-col shrink-0 overflow-hidden font-sans text-xs">
        <div className="h-10 px-4 border-b border-line flex items-center justify-between shrink-0 bg-surface">
          <div className="flex items-center gap-2">
            <BookOpen className="w-3.5 h-3.5 text-green-bright" />
            <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-text">
              Evidence Detail
            </span>
          </div>
          {selectedMessage?.citations && (
            <span className="font-mono text-[10px] text-subtle">
              {selectedMessage.citations.length} citations
            </span>
          )}
        </div>

        {/* Citations List for Selected Answer */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3 select-text">
          {selectedMessage?.citations && selectedMessage.citations.length > 0 ? (
            <div className="space-y-3">
              <div className="text-[10px] font-mono uppercase text-subtle tracking-wider">
                AST Grounded Proofs
              </div>
              {selectedMessage.citations.map(cit => (
                <EvidenceCard key={cit.id} citation={cit} />
              ))}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-subtle space-y-3 select-none">
              <FileCode className="w-8 h-8 text-line-strong" />
              <div className="space-y-1">
                <div className="text-xs font-semibold text-text">No citations selected</div>
                <p className="text-[11px] text-subtle">
                  Ask a question or click on an assistant response to inspect its exact AST evidence cards and line citations.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Return to workspace button */}
        <div className="p-3 border-t border-line bg-surface shrink-0">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate(`/w/${repoId}`)}
            className="w-full text-xs"
          >
            Back to Code Workspace
          </Button>
        </div>
      </aside>
    </div>
  );
};

export default AssistantViewPage;

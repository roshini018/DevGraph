import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  PanelRightClose,
  Trash2,
  Maximize2,
  FileCode,
  Network,
  ShieldAlert,
  X,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Send,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { ask } from '../../api/client';
import { Button } from '../ui/Button';
import { EvidenceCard } from '../ui/EvidenceCard';
import { Tooltip } from '../ui/Tooltip';
import { KbdHint } from '../ui/KbdHint';

const SUGGESTED_CHIPS = [
  'Explain this file',
  'Who calls this function?',
  'What depends on this module?',
  'What might break if I change this function?',
];

export const RightAIPanel: React.FC = () => {
  const navigate = useNavigate();
  const {
    conversation,
    addMessage,
    clearConversation,
    toggleRightPanel,
    activeFile,
    setActiveFile,
    graphSelection,
    setGraphSelection,
    impactTargets,
    setImpactTargets,
    selectedRepo,
  } = useAppStore();

  const repoId = selectedRepo?.repo_name || 'my-store';

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorState, setErrorState] = useState<string | null>(null);
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string>('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation, loading]);

  const handleAsk = async (customPrompt?: string) => {
    const prompt = (customPrompt || input).trim();
    if (!prompt || loading) return;

    setErrorState(null);
    setInput('');

    // Add user message to conversation
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
    } catch (err: unknown) {
      setLastFailedPrompt(prompt);
      setErrorState('Failed to query codebase index. Please check network and retry.');
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    if (lastFailedPrompt) {
      handleAsk(lastFailedPrompt);
    }
  };

  // Derive real context chips (active file, selected symbol/function, graph selection)
  const contextChips: Array<{ id: string; label: string; icon: React.ReactNode; onRemove: () => void }> = [];

  if (activeFile) {
    const fileName = activeFile.split('/').pop() || activeFile;
    contextChips.push({
      id: 'ctx-file',
      label: `File: ${fileName}`,
      icon: <FileCode className="w-3 h-3 text-slate shrink-0" />,
      onRemove: () => setActiveFile(null),
    });
  }

  if (graphSelection) {
    contextChips.push({
      id: 'ctx-graph',
      label: `Symbol: ${graphSelection}`,
      icon: <Network className="w-3 h-3 text-green-bright shrink-0" />,
      onRemove: () => setGraphSelection(null),
    });
  }

  if (impactTargets.length > 0) {
    contextChips.push({
      id: 'ctx-impact',
      label: `Target: ${impactTargets[0]}`,
      icon: <ShieldAlert className="w-3 h-3 text-terracotta shrink-0" />,
      onRemove: () => setImpactTargets([]),
    });
  }

  return (
    <aside
      aria-label="AI Assistant"
      className="h-full flex flex-col bg-surface border-l border-line select-none overflow-hidden font-sans"
    >
      {/* Header with Title and 'Open in full assistant' */}
      <div className="h-9 px-3 border-b border-line flex items-center justify-between shrink-0 bg-surface">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-green-bright" />
          <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-text">
            Assistant
          </span>
          <span className="px-1.5 py-0.2 rounded bg-raised text-[10px] font-mono text-subtle border border-line">
            AI-grounded
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Link: Open in full assistant */}
          <Tooltip content="Open full assistant screen" side="bottom">
            <button
              type="button"
              onClick={() => navigate(`/w/${repoId}/assistant`)}
              className="text-subtle hover:text-text p-1 rounded transition-colors"
              aria-label="Open in full assistant"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </Tooltip>

          {conversation.length > 0 && (
            <Tooltip content="Clear conversation history" side="bottom">
              <button
                type="button"
                onClick={clearConversation}
                className="text-subtle hover:text-text p-1 rounded transition-colors"
                aria-label="Clear conversation history"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </Tooltip>
          )}

          <Tooltip content="Collapse Assistant" side="bottom">
            <button
              type="button"
              onClick={toggleRightPanel}
              className="text-subtle hover:text-text p-1 rounded transition-colors"
              aria-label="Collapse Assistant"
            >
              <PanelRightClose className="w-3.5 h-3.5" />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Context Chips (only appear when context is active, removable) */}
      {contextChips.length > 0 && (
        <div className="px-3 py-1.5 border-b border-line bg-raised/40 flex items-center gap-1.5 overflow-x-auto shrink-0 select-none">
          <span className="text-[10px] font-mono text-subtle uppercase tracking-wider mr-1 shrink-0">
            Context:
          </span>
          {contextChips.map(chip => (
            <div
              key={chip.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface border border-line text-[11px] font-mono text-text shrink-0"
            >
              {chip.icon}
              <span className="truncate max-w-[130px]">{chip.label}</span>
              <button
                type="button"
                onClick={chip.onRemove}
                className="text-subtle hover:text-text ml-0.5 p-0.5 rounded"
                aria-label={`Remove ${chip.label}`}
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Messages Stream or Empty State */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4 text-xs select-text">
        {conversation.length === 0 ? (
          /* EMPTY STATE: Starts empty with 'Ask a question about this repository' and suggested chips */
          <div className="h-full flex flex-col justify-center items-center text-center p-4 space-y-5 select-none">
            <div className="w-10 h-10 rounded-full bg-raised border border-line flex items-center justify-center text-text mx-auto">
              <Sparkles className="w-5 h-5 text-green-bright" />
            </div>

            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-text tracking-tight">
                Ask a question about this repository
              </h3>
              <p className="text-xs text-subtle max-w-xs mx-auto leading-relaxed">
                Queries are answered using deterministic AST call hierarchies and exact code line citations.
              </p>
            </div>

            {/* Suggested Chips */}
            <div className="w-full space-y-1.5 pt-2 text-left">
              <div className="text-[10px] font-mono uppercase tracking-wider text-subtle">
                Suggested questions:
              </div>
              <div className="flex flex-col gap-1.5">
                {SUGGESTED_CHIPS.map((chip, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleAsk(chip)}
                    className="p-2 rounded bg-raised hover:bg-raised/80 border border-line hover:border-line-strong text-left text-xs font-mono text-muted hover:text-text transition-colors flex items-center justify-between group"
                  >
                    <span>{chip}</span>
                    <span className="text-green-bright opacity-0 group-hover:opacity-100 transition-opacity">
                      ↵
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* CONVERSATION HISTORY */
          conversation.map(msg => (
            <div
              key={msg.id}
              className={`flex flex-col space-y-1.5 ${
                msg.sender === 'user' ? 'items-end' : 'items-start'
              }`}
            >
              <div className="text-[10px] font-mono text-subtle px-1">
                {msg.sender === 'user' ? 'You' : 'DevGraph AI'}
              </div>

              {/* Message Bubble */}
              {msg.sender === 'user' ? (
                /* User message as a raised bubble */
                <div className="p-3 rounded-lg border border-line-strong bg-raised text-text max-w-[90%] text-xs leading-relaxed font-sans shadow-sm">
                  {msg.content}
                </div>
              ) : (
                /* Assistant answer as plain text in sections with Verdict strip & EvidenceCards */
                <div className="w-full space-y-3 font-sans">
                  {/* VerdictBanner-style strip: green-soft with check + 'Verified', otherwise ember notice */}
                  {typeof msg.verified === 'boolean' && (
                    <div>
                      {msg.verified ? (
                        <div className="p-2.5 rounded bg-green-soft border border-green/40 flex items-center justify-between text-xs text-green-bright font-mono">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-green-bright shrink-0" />
                            <span className="font-semibold uppercase tracking-wider text-[11px]">
                              Verified
                            </span>
                            <span className="text-[10px] text-green-bright/80 hidden sm:inline">
                              • Grounded in AST call graph
                            </span>
                          </div>
                          {msg.latency_ms && (
                            <span className="text-[10px] text-green-bright/70">
                              {msg.latency_ms}ms
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="p-2.5 rounded bg-ember/10 border border-ember/40 flex items-center justify-between text-xs text-ember font-mono">
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

                  {/* Answer Text in Clean Sections */}
                  <div className="p-3 rounded-lg border border-line bg-ide text-text leading-relaxed text-xs whitespace-pre-wrap font-sans">
                    {msg.content}
                  </div>

                  {/* EvidenceCards for citations */}
                  {msg.citations && msg.citations.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <div className="text-[10px] font-mono uppercase text-subtle tracking-wider flex items-center justify-between">
                        <span>AST Citations ({msg.citations.length})</span>
                        <span className="text-subtle font-mono text-[9px]">Click to jump to line</span>
                      </div>
                      <div className="space-y-1.5">
                        {msg.citations.map(cit => (
                          <EvidenceCard key={cit.id} citation={cit} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}

        {/* Loading State: 'Searching code...' */}
        {loading && (
          <div className="p-3 rounded-lg bg-ide border border-line flex items-center gap-2.5 text-xs text-subtle font-mono animate-pulse">
            <Loader2 className="w-3.5 h-3.5 text-green-bright animate-spin shrink-0" />
            <span>Searching code &amp; resolving AST graph citations...</span>
          </div>
        )}

        {/* Error State with Retry */}
        {errorState && (
          <div className="p-3 rounded-lg bg-danger/10 border border-danger/40 flex items-center justify-between gap-2 text-xs text-danger font-mono">
            <span>{errorState}</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRetry}
              leftIcon={<RefreshCw className="w-3 h-3" />}
            >
              Retry
            </Button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Composer at the bottom: bordered textarea, Cmd+Enter hint, green send button */}
      <div className="p-3 border-t border-line bg-surface shrink-0 select-none">
        <form
          onSubmit={e => {
            e.preventDefault();
            handleAsk();
          }}
          className="space-y-2"
        >
          <div className="relative rounded border border-line bg-ide focus-within:border-line-strong transition-colors">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  handleAsk();
                }
              }}
              placeholder="Ask about orders, payments, callers, or blast radius..."
              rows={2}
              className="w-full resize-none p-2.5 bg-transparent text-xs text-text placeholder:text-subtle outline-none font-sans leading-relaxed"
            />

            <div className="flex items-center justify-between px-2.5 pb-2 text-[11px] text-subtle font-mono select-none">
              <div className="flex items-center gap-1 text-[10px]">
                <KbdHint>⌘</KbdHint>
                <KbdHint>↵</KbdHint>
                <span>to send</span>
              </div>

              {/* Green send button */}
              <Button
                type="submit"
                variant="green"
                size="sm"
                disabled={!input.trim() || loading}
                isLoading={loading}
                leftIcon={<Send className="w-3 h-3" />}
              >
                Send
              </Button>
            </div>
          </div>
        </form>

        {/* Footer Link: Open in full assistant */}
        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={() => navigate(`/w/${repoId}/assistant`)}
            className="text-[11px] font-mono text-subtle hover:text-text underline cursor-pointer transition-colors"
          >
            Open in full assistant &rarr;
          </button>
        </div>
      </div>
    </aside>
  );
};

export default RightAIPanel;

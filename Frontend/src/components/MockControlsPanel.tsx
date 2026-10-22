import React, { useState, useEffect } from 'react';
import {
  getMockControlsState,
  setMockControlsState,
  subscribeMockControls,
  resetMockControls,
  type MockControlsState,
} from '../api/mockState';
import { Sliders, AlertTriangle, Database, ZapOff, Clock, RotateCcw, ChevronDown } from 'lucide-react';

export const MockControlsPanel: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [state, setState] = useState<MockControlsState>(getMockControlsState());

  useEffect(() => {
    return subscribeMockControls(setState);
  }, []);

  const activeCount = Object.values(state).filter(Boolean).length;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 font-sans text-xs select-none"
      aria-label="Developer Mock Controls"
    >
      {/* Floating Toggle Pill */}
      {!isOpen ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 bg-surface hover:bg-raised border border-line hover:border-line-strong text-text px-3 py-1.5 rounded transition-colors"
          aria-label="Open Mock Controls"
        >
          <Sliders className="w-3.5 h-3.5 text-muted" />
          <span className="font-mono text-muted">Mock Controls</span>
          {activeCount > 0 && (
            <span
              className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-green-soft text-green-bright font-mono text-[10px]"
              aria-label={`${activeCount} active mock overrides`}
            >
              {activeCount}
            </span>
          )}
        </button>
      ) : (
        /* Expanded Controls Card */
        <div className="w-72 bg-surface border border-line-strong rounded-lg p-3.5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-line">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-green-bright" />
              <span className="font-semibold text-text tracking-tight">Mock Controls</span>
              <span className="px-1.5 py-0.5 rounded bg-raised text-subtle text-[10px] font-mono">
                DEV
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 text-muted hover:text-text rounded transition-colors"
              aria-label="Collapse Mock Controls"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2">
            {/* Force Error */}
            <label className="flex items-center justify-between p-2 rounded bg-raised/60 hover:bg-raised border border-line cursor-pointer transition-colors">
              <div className="flex items-center gap-2">
                <AlertTriangle className={`w-3.5 h-3.5 ${state.forceError ? 'text-danger' : 'text-muted'}`} />
                <div>
                  <div className="text-text font-medium">Force Error</div>
                  <div className="text-subtle text-[10px]">Simulate 500 / API failure</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={state.forceError}
                onChange={e => setMockControlsState({ forceError: e.target.checked })}
                className="w-3.5 h-3.5 rounded border-line accent-green cursor-pointer"
                aria-label="Toggle Force Error"
              />
            </label>

            {/* Force Empty */}
            <label className="flex items-center justify-between p-2 rounded bg-raised/60 hover:bg-raised border border-line cursor-pointer transition-colors">
              <div className="flex items-center gap-2">
                <Database className={`w-3.5 h-3.5 ${state.forceEmpty ? 'text-amber' : 'text-muted'}`} />
                <div>
                  <div className="text-text font-medium">Force Empty</div>
                  <div className="text-subtle text-[10px]">Return zero items/results</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={state.forceEmpty}
                onChange={e => setMockControlsState({ forceEmpty: e.target.checked })}
                className="w-3.5 h-3.5 rounded border-line accent-green cursor-pointer"
                aria-label="Toggle Force Empty"
              />
            </label>

            {/* Force Indexing Failure */}
            <label className="flex items-center justify-between p-2 rounded bg-raised/60 hover:bg-raised border border-line cursor-pointer transition-colors">
              <div className="flex items-center gap-2">
                <ZapOff className={`w-3.5 h-3.5 ${state.forceIndexingFailure ? 'text-danger' : 'text-muted'}`} />
                <div>
                  <div className="text-text font-medium">Indexing Failure</div>
                  <div className="text-subtle text-[10px]">Simulate AST parse error</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={state.forceIndexingFailure}
                onChange={e => setMockControlsState({ forceIndexingFailure: e.target.checked })}
                className="w-3.5 h-3.5 rounded border-line accent-green cursor-pointer"
                aria-label="Toggle Force Indexing Failure"
              />
            </label>

            {/* Slow Network */}
            <label className="flex items-center justify-between p-2 rounded bg-raised/60 hover:bg-raised border border-line cursor-pointer transition-colors">
              <div className="flex items-center gap-2">
                <Clock className={`w-3.5 h-3.5 ${state.slowNetwork ? 'text-slate' : 'text-muted'}`} />
                <div>
                  <div className="text-text font-medium">Slow Network</div>
                  <div className="text-subtle text-[10px]">2500ms latency delay</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={state.slowNetwork}
                onChange={e => setMockControlsState({ slowNetwork: e.target.checked })}
                className="w-3.5 h-3.5 rounded border-line accent-green cursor-pointer"
                aria-label="Toggle Slow Network"
              />
            </label>
          </div>

          <div className="flex items-center justify-between pt-1 text-[11px]">
            <button
              type="button"
              onClick={resetMockControls}
              className="flex items-center gap-1.5 text-subtle hover:text-text transition-colors"
              aria-label="Reset all mock controls"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
            <span className="text-subtle font-mono text-[10px]">acme/my-store</span>
          </div>
        </div>
      )}
    </div>
  );
};

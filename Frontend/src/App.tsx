import React from 'react';
import { MockControlsPanel } from './components/MockControlsPanel';

export const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-bg text-text flex flex-col items-center justify-center p-6 selection:bg-green-soft selection:text-green-bright">
      <div className="max-w-md w-full border border-line bg-surface p-6 rounded-lg text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-raised border border-line text-xs font-mono text-muted">
          <span className="w-2 h-2 rounded-full bg-green-bright animate-pulse" />
          DevGraph Foundation Ready
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-text">
          Phase 0: Foundation
        </h1>
        <p className="text-sm text-subtle">
          Mock repository <span className="font-mono text-muted">acme/my-store</span> loaded with 16 analyzed Python files, 54 symbols, 90 edges, and full test suite passing.
        </p>
      </div>

      {/* Floating dev mock controls panel */}
      <MockControlsPanel />
    </div>
  );
};

export default App;

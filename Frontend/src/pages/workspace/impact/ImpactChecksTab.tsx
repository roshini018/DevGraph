import React, { useState } from 'react';
import {
  CheckSquare,
  Square,
  AlertTriangle,
  Beaker,
  ShieldCheck,
  ExternalLink,
  Info,
} from 'lucide-react';
import type { TestCaseItem } from './types';

interface ImpactChecksTabProps {
  targets: string[];
  testsToRun: TestCaseItem[];
  callersToReview: TestCaseItem[];
  callersWithoutTests: TestCaseItem[];
  totalDirect: number;
  totalIndirect: number;
  totalModules: number;
  onOpenSource: (filePath: string, line: number) => void;
}

export const ImpactChecksTab: React.FC<ImpactChecksTabProps> = ({
  targets,
  testsToRun,
  callersToReview,
  callersWithoutTests,
  totalDirect,
  totalIndirect,
  totalModules,
  onOpenSource,
}) => {
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  const toggleCheck = (id: string) => {
    setCheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Templated 'What could break' paragraph
  const targetLabel = targets.join(', ');
  const whatCouldBreakText = `Modifying ${targetLabel} creates potential breaking consequences across ${totalDirect} direct caller${
    totalDirect === 1 ? '' : 's'
  } and ${totalIndirect} indirect caller${
    totalIndirect === 1 ? '' : 's'
  } distributed through ${totalModules} distinct module${
    totalModules === 1 ? '' : 's'
  }. Key failure modes include signature mismatches at invocation call sites, unhandled return value exceptions, and cascading regressions in downstream order orchestration and billing pipelines. Executing the ${
    testsToRun.length
  } verified test suite${
    testsToRun.length === 1 ? '' : 's'
  } below is essential to validate that contract boundaries remain intact.`;

  return (
    <div className="space-y-6 font-sans">
      {/* What could break paragraph */}
      <div className="p-4 rounded-lg bg-surface border border-line space-y-2">
        <div className="flex items-center gap-2 text-xs font-mono font-semibold text-text uppercase tracking-wider">
          <Info className="w-3.5 h-3.5 text-green-bright" />
          <span>What could break</span>
        </div>
        <p className="text-xs text-muted leading-relaxed font-sans">
          {whatCouldBreakText}
        </p>
      </div>

      {/* Section 1: Tests to run */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-subtle font-semibold border-b border-line pb-1.5">
          <span className="flex items-center gap-1.5">
            <Beaker className="w-3.5 h-3.5 text-muted" />
            <span>Tests to Run ({testsToRun.length})</span>
          </span>
          <span className="text-[10px] text-green">
            {testsToRun.filter(t => checkedIds.has(t.id)).length} of {testsToRun.length} passed
          </span>
        </div>

        {testsToRun.length === 0 ? (
          <div className="p-3 rounded bg-surface border border-line text-xs font-mono text-subtle">
            No specific test suites directly target this change. Manual verification recommended.
          </div>
        ) : (
          <div className="space-y-1.5">
            {testsToRun.map(test => {
              const isChecked = checkedIds.has(test.id);
              return (
                <div
                  key={test.id}
                  onClick={() => toggleCheck(test.id)}
                  className={`px-3 py-2.5 rounded-lg border flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                    isChecked
                      ? 'bg-green-soft/20 border-green/40 text-text'
                      : 'bg-surface border-line hover:border-line-strong'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    {isChecked ? (
                      <CheckSquare className="w-4 h-4 text-green-bright shrink-0" />
                    ) : (
                      <Square className="w-4 h-4 text-subtle shrink-0" />
                    )}
                    <span
                      className={`font-mono text-xs truncate ${
                        isChecked ? 'text-green-bright font-semibold line-through opacity-80' : 'text-text font-medium'
                      }`}
                    >
                      {test.name}
                    </span>
                    <span className="text-[10px] font-mono text-subtle truncate">
                      {test.file}:{test.line}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="px-1.5 py-0.5 rounded bg-green-soft text-green-bright text-[9px] font-mono font-bold tracking-wider uppercase border border-green/30">
                      covers this change
                    </span>
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        onOpenSource(test.file, test.line);
                      }}
                      className="text-subtle hover:text-text p-1 rounded"
                      title="Open test source"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section 2: Callers to review */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-subtle font-semibold border-b border-line pb-1.5">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-muted" />
            <span>Callers to Review ({callersToReview.length})</span>
          </span>
          <span className="text-[10px] text-subtle">
            {callersToReview.filter(c => checkedIds.has(c.id)).length} of {callersToReview.length} reviewed
          </span>
        </div>

        {callersToReview.length === 0 ? (
          <div className="p-3 rounded bg-surface border border-line text-xs font-mono text-subtle">
            No callers in this index require review.
          </div>
        ) : (
          <div className="space-y-1.5">
            {callersToReview.map(caller => {
              const isChecked = checkedIds.has(caller.id);
              return (
                <div
                  key={caller.id}
                  onClick={() => toggleCheck(caller.id)}
                  className={`px-3 py-2.5 rounded-lg border flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                    isChecked
                      ? 'bg-raised/80 border-line-strong text-muted'
                      : 'bg-surface border-line hover:border-line-strong'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    {isChecked ? (
                      <CheckSquare className="w-4 h-4 text-green-bright shrink-0" />
                    ) : (
                      <Square className="w-4 h-4 text-subtle shrink-0" />
                    )}
                    <span
                      className={`font-mono text-xs truncate ${
                        isChecked ? 'text-subtle line-through' : 'text-text font-medium'
                      }`}
                    >
                      {caller.name}
                    </span>
                    <span className="text-[10px] font-mono text-subtle truncate">
                      {caller.file}:{caller.line}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-mono tracking-wider uppercase border ${
                        isChecked
                          ? 'bg-green-soft text-green border-green/30'
                          : 'bg-raised text-subtle border-line'
                      }`}
                    >
                      {isChecked ? 'Reviewed' : 'Review needed'}
                    </span>
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        onOpenSource(caller.file, caller.line);
                      }}
                      className="text-subtle hover:text-text p-1 rounded"
                      title="Open caller source"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section 3: Callers without tests (ember warning icon) */}
      {callersWithoutTests.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-ember font-semibold border-b border-ember/30 pb-1.5">
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-ember" />
              <span>Callers Without Tests ({callersWithoutTests.length})</span>
            </span>
            <span className="text-[10px] text-ember">Missing Test Coverage</span>
          </div>

          <div className="space-y-1.5">
            {callersWithoutTests.map(caller => (
              <div
                key={caller.id}
                className="px-3 py-2.5 rounded-lg bg-ember/5 border border-ember/30 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2.5 truncate">
                  <AlertTriangle className="w-4 h-4 text-ember shrink-0" />
                  <span className="font-mono text-xs text-text font-medium truncate">
                    {caller.name}
                  </span>
                  <span className="text-[10px] font-mono text-subtle truncate">
                    {caller.file}:{caller.line}
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="px-1.5 py-0.5 rounded bg-ember/15 text-ember text-[9px] font-mono font-semibold border border-ember/30">
                    No test coverage
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenSource(caller.file, caller.line)}
                    className="text-subtle hover:text-text p-1 rounded"
                    title="Open caller source"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quiet Note at the bottom */}
      <div className="pt-4 border-t border-line text-[11px] font-sans text-subtle italic leading-relaxed">
        Impact analysis identifies potential effects based on indexed relationships. It does not
        guarantee that every runtime dependency or behavioral consequence has been detected.
      </div>
    </div>
  );
};

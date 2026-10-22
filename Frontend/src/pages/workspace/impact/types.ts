import type { RiskLevel } from '../../../types/api';

export interface EnrichedFinding {
  id: string;
  symbol: string;
  file: string;
  line: number;
  start_line: number;
  end_line: number;
  kind: 'function' | 'class' | 'method';
  distance: number;
  relationship: string;
  why_affected: string;
  is_test: boolean;
  has_unresolved: boolean;
  snippet?: string;
  path: string[];
}

export interface TestCaseItem {
  id: string;
  name: string;
  file: string;
  line: number;
  label: string;
  coversChange: boolean;
  hasWarning?: boolean;
  warningText?: string;
}

export interface ImpactStateData {
  targets: string[];
  depth: number;
  totalDirect: number;
  totalIndirect: number;
  totalTests: number;
  totalModules: number;
  riskLevel: RiskLevel;
  riskReason: string;
  hasUnresolved: boolean;
  findings: EnrichedFinding[];
  testsToRun: TestCaseItem[];
  callersToReview: TestCaseItem[];
  callersWithoutTests: TestCaseItem[];
  affectedModules: Array<{ path: string; count: number }>;
}

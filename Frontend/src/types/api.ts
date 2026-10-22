/**
 * DevGraph API Types and Domain Models
 * Adheres strictly to the DevGraph core specifications.
 */

export interface GithubRepo {
  id: string | number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  description: string | null;
  default_branch: string;
  language: string | null;
  stars?: number;
  updated_at: string;
}

export type IndexState =
  | 'queued'
  | 'fetching'
  | 'parsing'
  | 'graphing'
  | 'embedding'
  | 'ready'
  | 'failed';

export interface IndexStatus {
  state: IndexState;
  stage: string;
  progress: number; // 0 to 100 percentage
  files_total: number;
  files_done: number;
  error: string | null;
  updated_at: string;
}

export interface ConnectedRepo {
  id: string;
  repo_name: string;
  full_name: string;
  branch: string;
  status: IndexStatus;
  file_count: number;
  symbol_count: number;
  edge_count: number;
  language: string;
  updated_at: string;
}

export interface TreeNode {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
  size?: number;
  language?: string;
  analyzed?: boolean;
}

export interface FileContent {
  path: string;
  content: string;
  language: string;
  lines: number;
  analyzed: boolean;
  symbols?: string[];
  size_bytes?: number;
  summary?: string;
}

export type SymbolKind = 'function' | 'class' | 'method' | 'variable' | 'file';

export interface GraphNode {
  id: string;
  label: string;
  kind: SymbolKind;
  file: string;
  start_line?: number;
  end_line?: number;
  description?: string;
  metrics?: {
    in_degree?: number;
    out_degree?: number;
    symbol_count?: number;
    [key: string]: number | undefined;
  };
}

export type EdgeKind = 'calls' | 'imports' | 'inherits';

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  line: number;
  resolved: boolean;
  count?: number; // Aggregated edge count when used in file graph
  is_heuristic?: boolean;
}

export interface NodeDetail {
  node: GraphNode;
  callers: GraphNode[];
  callees: GraphNode[];
  imports: GraphNode[];
  imported_by: GraphNode[];
  inherits: GraphNode[];
  inherited_by: GraphNode[];
  source_snippet?: string;
}

export interface ConnectionResult {
  source: string;
  target: string;
  connected: boolean;
  paths: string[][];
  edges: GraphEdge[];
}

export type RiskLevel = 'high' | 'medium' | 'low';

export interface ImpactedNode {
  node_id: string;
  distance: number;
  path: string[];
  risk: RiskLevel;
  direct: boolean;
}

export interface ImpactResult {
  target_ids: string[];
  impacted_nodes: ImpactedNode[];
  total_impacted: number;
  max_depth: number;
}

export interface Citation {
  id: string;
  file_path: string;
  start_line: number;
  end_line: number;
  symbol: string;
  snippet: string;
  sources?: string[];
}

export interface AskResult {
  answer: string;
  verified: boolean;
  citations: Citation[];
  latency_ms: number;
}

export interface SearchMatch {
  id: string;
  type: 'file' | 'symbol' | 'code';
  name: string;
  file_path: string;
  line?: number;
  match_snippet?: string;
  score: number;
}

export interface SearchResult {
  query: string;
  matches: SearchMatch[];
  total: number;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface RepoStats {
  files_count: number;
  symbols_count: number;
  edges_count: number;
  unresolved_edges_count: number;
  languages: string[];
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

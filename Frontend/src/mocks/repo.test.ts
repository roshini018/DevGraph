import { describe, it, expect } from 'vitest';
import {
  MOCK_FILES,
  MOCK_SYMBOLS,
  MOCK_EDGES,
  getStats,
  getImpact,
  getFileGraph,
  findPaths,
} from './repo';

describe('DevGraph Mock Repository Validation Suite', () => {
  // Test 1: An edge endpoint does not exist
  it('FAILS if an edge endpoint does not exist in symbols', () => {
    const symbolIds = new Set(MOCK_SYMBOLS.map(s => s.id));

    for (const edge of MOCK_EDGES) {
      expect(
        symbolIds.has(edge.source),
        `Edge ${edge.id} has invalid source endpoint: "${edge.source}"`
      ).toBe(true);

      expect(
        symbolIds.has(edge.target),
        `Edge ${edge.id} has invalid target endpoint: "${edge.target}"`
      ).toBe(true);
    }
  });

  // Test 2: An edge line is outside its file
  it('FAILS if an edge line is outside its file line range', () => {
    const symbolMap = new Map(MOCK_SYMBOLS.map(s => [s.id, s]));
    const fileLineMap = new Map(MOCK_FILES.map(f => [f.path, f.lines]));

    for (const edge of MOCK_EDGES) {
      const sourceSymbol = symbolMap.get(edge.source);
      expect(sourceSymbol, `Source symbol "${edge.source}" not found`).toBeDefined();

      const maxLines = fileLineMap.get(sourceSymbol!.file);
      expect(
        maxLines,
        `File "${sourceSymbol!.file}" for symbol "${sourceSymbol!.id}" not found in MOCK_FILES`
      ).toBeDefined();

      expect(
        edge.line,
        `Edge ${edge.id} line ${edge.line} must be >= 1 in "${sourceSymbol!.file}"`
      ).toBeGreaterThanOrEqual(1);

      expect(
        edge.line,
        `Edge ${edge.id} line ${edge.line} exceeds max file lines (${maxLines}) in "${sourceSymbol!.file}"`
      ).toBeLessThanOrEqual(maxLines!);
    }
  });

  // Test 3: A symbol range exceeds its file
  it('FAILS if a symbol range exceeds its file line bounds or has invalid range', () => {
    const fileLineMap = new Map(MOCK_FILES.map(f => [f.path, f.lines]));

    for (const symbol of MOCK_SYMBOLS) {
      const maxLines = fileLineMap.get(symbol.file);
      expect(
        maxLines,
        `File "${symbol.file}" for symbol "${symbol.id}" not found in MOCK_FILES`
      ).toBeDefined();

      expect(
        symbol.start_line,
        `Symbol "${symbol.id}" start_line must be defined`
      ).toBeDefined();

      expect(
        symbol.end_line,
        `Symbol "${symbol.id}" end_line must be defined`
      ).toBeDefined();

      expect(
        symbol.start_line!,
        `Symbol "${symbol.id}" start_line (${symbol.start_line}) must be >= 1`
      ).toBeGreaterThanOrEqual(1);

      expect(
        symbol.end_line!,
        `Symbol "${symbol.id}" end_line (${symbol.end_line}) exceeds file lines (${maxLines}) in "${symbol.file}"`
      ).toBeLessThanOrEqual(maxLines!);

      expect(
        symbol.start_line!,
        `Symbol "${symbol.id}" start_line (${symbol.start_line}) must be <= end_line (${symbol.end_line})`
      ).toBeLessThanOrEqual(symbol.end_line!);
    }
  });

  // Test 4: getImpact returns a target in its own results
  it('FAILS if getImpact returns any target in its own results or fails to de-duplicate by shortest distance', () => {
    const testTargets = [
      ['validate_amount'],
      ['charge_payment'],
      ['Order'],
      ['place_order', 'create_order'],
      ['validate_email'],
    ];

    for (const targets of testTargets) {
      const impact = getImpact(targets, 4);

      // Verify NO target is ever included in impacted_nodes
      for (const node of impact.impacted_nodes) {
        expect(
          targets.includes(node.node_id),
          `getImpact returned target "${node.node_id}" inside its own results!`
        ).toBe(false);
      }

      // Verify de-duplication: every node_id in impacted_nodes is unique
      const seenIds = new Set<string>();
      for (const node of impact.impacted_nodes) {
        expect(
          seenIds.has(node.node_id),
          `getImpact returned duplicate node_id "${node.node_id}"`
        ).toBe(false);
        seenIds.add(node.node_id);
      }

      // Verify sorted by distance ascending
      for (let i = 0; i < impact.impacted_nodes.length - 1; i++) {
        expect(
          impact.impacted_nodes[i].distance
        ).toBeLessThanOrEqual(impact.impacted_nodes[i + 1].distance);
      }
    }
  });

  // Test 5: getStats differs from the arrays
  it('FAILS if getStats differs from the actual underlying arrays', () => {
    const stats = getStats();

    expect(stats.files_count).toBe(MOCK_FILES.length);
    expect(stats.symbols_count).toBe(MOCK_SYMBOLS.length);
    expect(stats.edges_count).toBe(MOCK_EDGES.length);

    const actualUnresolved = MOCK_EDGES.filter(e => !e.resolved).length;
    expect(stats.unresolved_edges_count).toBe(actualUnresolved);

    const actualLanguages = Array.from(new Set(MOCK_FILES.map(f => f.language)));
    expect(stats.languages.sort()).toEqual(actualLanguages.sort());
  });

  // Test 6: Verify required graph shapes
  it('verifies required graph shapes: chain, class hierarchy, hub, tests, isolated file, and unresolved edge count', () => {
    // Shape 1: Chain (place_order -> create_order -> charge_payment -> validate_amount)
    const paths = findPaths('place_order', 'validate_amount', 5);
    const hasChain = paths.some(p =>
      p.join(' -> ') === 'place_order -> create_order -> charge_payment -> validate_amount'
    );
    expect(hasChain, 'Chain place_order -> create_order -> charge_payment -> validate_amount must exist').toBe(true);

    // Shape 2: Class hierarchy (RefundPayment inherits Payment inherits BaseModel)
    const refundInheritsPayment = MOCK_EDGES.some(
      e => e.source === 'RefundPayment' && e.target === 'Payment' && e.kind === 'inherits'
    );
    expect(refundInheritsPayment, 'RefundPayment must inherit Payment').toBe(true);

    const paymentInheritsBase = MOCK_EDGES.some(
      e => e.source === 'Payment' && e.target === 'BaseModel' && e.kind === 'inherits'
    );
    expect(paymentInheritsBase, 'Payment must inherit BaseModel').toBe(true);

    // Shape 3: Hub (validators used by many files)
    const validatorSymbols = ['validate_email', 'validate_amount', 'validate_uuid', 'validate_currency'];
    const validatorEdges = MOCK_EDGES.filter(e => validatorSymbols.includes(e.target));
    expect(validatorEdges.length, 'Validators hub must have multiple incoming edges').toBeGreaterThanOrEqual(15);

    // Shape 4: Tests that call what they test
    const testOrderCalls = MOCK_EDGES.filter(
      e => e.source === 'test_place_order_success' && e.target === 'place_order'
    );
    expect(testOrderCalls.length).toBeGreaterThan(0);

    const testPaymentCalls = MOCK_EDGES.filter(
      e => e.source === 'test_charge_payment_flow' && e.target === 'charge_payment'
    );
    expect(testPaymentCalls.length).toBeGreaterThan(0);

    // Shape 5: Isolated file (zero incoming or outgoing edges)
    const isolatedSymbols = ['calculate_checksum', 'compute_sha256_digest', 'verify_payload_integrity'];
    for (const sym of isolatedSymbols) {
      const connections = MOCK_EDGES.filter(e => e.source === sym || e.target === sym);
      expect(connections.length, `Isolated symbol "${sym}" must have zero connections`).toBe(0);
    }

    // Unresolved edges count: 6 to 8
    const unresolvedCount = MOCK_EDGES.filter(e => !e.resolved).length;
    expect(unresolvedCount).toBeGreaterThanOrEqual(6);
    expect(unresolvedCount).toBeLessThanOrEqual(8);

    // Analyzed files: ~16 files with 20 to 50 lines each
    const analyzedFiles = MOCK_FILES.filter(f => f.analyzed);
    expect(analyzedFiles.length).toBe(16);
    for (const file of analyzedFiles) {
      expect(file.lines, `File ${file.path} must have between 20 and 50 lines`).toBeGreaterThanOrEqual(20);
      expect(file.lines, `File ${file.path} must have between 20 and 50 lines`).toBeLessThanOrEqual(50);
    }

    // File graph aggregation check
    const fileGraph = getFileGraph();
    expect(fileGraph.nodes.length).toBe(16);
    expect(fileGraph.edges.length).toBeGreaterThan(0);
  });
});

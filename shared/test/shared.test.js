import { describe, it, expect } from 'vitest';
import {
  ProcessMapSchema,
  parseProcessMap,
  validateMapStructure,
  repairMapStructure,
  blankMap,
  layoutMap,
  applyAutoLayout,
  analyzeMap,
  applyOperations,
  toMermaid,
  toBpmnXml,
  toDrawioXml,
  toSvg,
  toCsv,
  activityRows,
  raciRows,
  documentModel,
  sampleOrderFulfilmentMap,
} from '../src/index.js';

const sample = () => sampleOrderFulfilmentMap();

describe('schema', () => {
  it('accepts the sample map', () => {
    const res = parseProcessMap(sample());
    expect(res.ok).toBe(true);
    expect(res.map.nodes.length).toBe(11);
  });

  it('rejects a map without nodes', () => {
    const res = parseProcessMap({ name: 'x', nodes: [] });
    expect(res.ok).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it('applies defaults for optional fields', () => {
    const map = ProcessMapSchema.parse({
      name: 'Minimal',
      nodes: [{ id: 'a', type: 'task', label: 'Do a thing' }],
    });
    expect(map.lanes).toEqual([]);
    expect(map.nodes[0].automation).toBe('manual');
    expect(map.nodes[0].raci).toEqual({
      responsible: '',
      accountable: '',
      consulted: '',
      informed: '',
    });
  });

  it('detects dangling edges and repairs them', () => {
    const map = ProcessMapSchema.parse({
      name: 'Broken',
      nodes: [{ id: 'a', type: 'task', label: 'A' }],
      edges: [{ id: 'e1', source: 'a', target: 'ghost' }],
    });
    const check = validateMapStructure(map);
    expect(check.ok).toBe(false);
    const repaired = repairMapStructure(map);
    expect(validateMapStructure(repaired).ok).toBe(true);
    expect(repaired.edges).toHaveLength(0);
  });

  it('parseProcessMap auto-repairs duplicate ids', () => {
    const raw = {
      name: 'Dups',
      nodes: [
        { id: 'a', type: 'task', label: 'A1' },
        { id: 'a', type: 'task', label: 'A2' },
      ],
    };
    const res = parseProcessMap(raw);
    expect(res.ok).toBe(true);
    const ids = res.map.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('creates a valid blank map', () => {
    const res = parseProcessMap(blankMap('Test'));
    expect(res.ok).toBe(true);
  });
});

describe('layout', () => {
  it('positions every node inside its lane band', () => {
    const map = sample();
    const { positions, laneGeom } = layoutMap(map);
    expect(positions.size).toBe(map.nodes.length);
    for (const n of map.nodes) {
      const p = positions.get(n.id);
      const lane = laneGeom.find((l) => l.id === n.laneId);
      expect(p.y).toBeGreaterThanOrEqual(lane.y);
      expect(p.y).toBeLessThan(lane.y + lane.height);
    }
  });

  it('orders columns by flow (start before end)', () => {
    const { positions } = layoutMap(sample());
    expect(positions.get('n_start').x).toBeLessThan(positions.get('n_pick').x);
    expect(positions.get('n_pick').x).toBeLessThan(positions.get('n_end').x);
  });

  it('survives cycles', () => {
    const map = ProcessMapSchema.parse({
      name: 'Loop',
      nodes: [
        { id: 'a', type: 'task', label: 'A' },
        { id: 'b', type: 'task', label: 'B' },
      ],
      edges: [
        { id: 'e1', source: 'a', target: 'b' },
        { id: 'e2', source: 'b', target: 'a' },
      ],
    });
    const { positions } = layoutMap(map);
    expect(positions.size).toBe(2);
  });

  it('applyAutoLayout fills positions', () => {
    const laid = applyAutoLayout(sample());
    expect(laid.nodes.every((n) => n.position)).toBe(true);
  });

  it('handles 2000 nodes quickly', () => {
    const nodes = [];
    const edges = [];
    for (let i = 0; i < 2000; i++) {
      nodes.push({ id: `n${i}`, type: 'task', label: `Task ${i}`, laneId: `lane${i % 8}` });
      if (i > 0) edges.push({ id: `e${i}`, source: `n${i - 1}`, target: `n${i}` });
    }
    const map = ProcessMapSchema.parse({
      name: 'Big',
      lanes: Array.from({ length: 8 }, (_, i) => ({ id: `lane${i}`, name: `Lane ${i}`, order: i })),
      nodes,
      edges,
    });
    const t0 = performance.now();
    const { positions } = layoutMap(map);
    const elapsed = performance.now() - t0;
    expect(positions.size).toBe(2000);
    expect(elapsed).toBeLessThan(2000);
  });
});

describe('analysis', () => {
  it('produces scores and findings for the sample', () => {
    const a = analyzeMap(sample());
    expect(a.healthScore).toBeGreaterThan(0);
    expect(a.healthScore).toBeLessThanOrEqual(100);
    expect(a.complexityScore).toBeGreaterThan(0);
    expect(a.counts.lanes).toBe(5);
    expect(a.bottlenecks.length).toBeGreaterThan(0);
    expect(a.automationOpportunities.length).toBeGreaterThan(0);
    expect(a.cycleTimeMins).toBeGreaterThan(0);
    expect(a.waitingTimeMins).toBeGreaterThan(0);
  });

  it('flags missing start/end and KPI-less maps', () => {
    const a = analyzeMap(
      ProcessMapSchema.parse({ name: 'x', nodes: [{ id: 'a', type: 'task', label: 'Only task' }] })
    );
    expect(a.issues.join(' ')).toMatch(/start/i);
    expect(a.suggestedKpis.length).toBeGreaterThan(0);
  });
});

describe('operations', () => {
  it('adds a node between two nodes', () => {
    const map = sample();
    const { map: out, applied, errors } = applyOperations(map, [
      {
        op: 'add_node',
        node: { type: 'approval', label: 'Finance approval', laneId: 'lane_fin' },
        betweenSource: 'n_qc',
        betweenTarget: 'n_book',
      },
    ]);
    expect(errors).toEqual([]);
    expect(applied).toHaveLength(1);
    const added = out.nodes.find((n) => n.label === 'Finance approval');
    expect(added).toBeTruthy();
    // the old direct edge must now route through the new node
    expect(out.edges.some((e) => e.source === 'n_qc' && e.target === added.id)).toBe(true);
    expect(out.edges.some((e) => e.source === added.id && e.target === 'n_book')).toBe(true);
    expect(out.edges.some((e) => e.source === 'n_qc' && e.target === 'n_book')).toBe(false);
  });

  it('removes a node and reconnects the flow', () => {
    const { map: out, errors } = applyOperations(sample(), [{ op: 'remove_node', id: 'n_qc' }]);
    expect(errors).toEqual([]);
    expect(out.nodes.some((n) => n.id === 'n_qc')).toBe(false);
    expect(out.edges.some((e) => e.source === 'n_pick' && e.target === 'n_book')).toBe(true);
  });

  it('merges and splits lanes', () => {
    const merged = applyOperations(sample(), [
      { op: 'merge_lanes', laneIds: ['lane_wh', 'lane_log'], name: 'Fulfilment' },
    ]);
    expect(merged.errors).toEqual([]);
    expect(merged.map.lanes).toHaveLength(4);
    expect(merged.map.nodes.find((n) => n.id === 'n_book').laneId).toBe('lane_wh');

    const split = applyOperations(sample(), [
      {
        op: 'split_lane',
        id: 'lane_wh',
        newLanes: [
          { name: 'Picking', nodeIds: ['n_pick'] },
          { name: 'Quality', nodeIds: ['n_qc'] },
        ],
      },
    ]);
    expect(split.errors).toEqual([]);
    expect(split.map.lanes).toHaveLength(6);
  });

  it('never corrupts the map on a bad operation', () => {
    const before = sample();
    const { map: out, errors } = applyOperations(before, [
      { op: 'remove_node', id: 'does-not-exist' },
      { op: 'update_lane', id: 'nope', changes: { name: 'X' } },
      { op: 'update_process', changes: { owner: 'COO' } },
    ]);
    expect(errors).toHaveLength(2);
    expect(out.owner).toBe('COO');
    expect(out.nodes).toHaveLength(before.nodes.length);
    expect(validateMapStructure(out).ok).toBe(true);
  });
});

describe('exporters', () => {
  it('mermaid contains lanes and edges', () => {
    const mmd = toMermaid(sample());
    expect(mmd).toContain('flowchart LR');
    expect(mmd).toContain('subgraph');
    expect(mmd).toContain('Warehouse');
    expect(mmd).toContain('-->');
    expect(mmd).toContain('|"Yes"|');
  });

  it('bpmn is well-formed and contains lanes, tasks, gateways, DI', () => {
    const xml = toBpmnXml(sample());
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('bpmn:startEvent');
    expect(xml).toContain('bpmn:endEvent');
    expect(xml).toContain('bpmn:exclusiveGateway');
    expect(xml).toContain('bpmn:lane ');
    expect(xml).toContain('bpmndi:BPMNShape');
    expect(xml).toContain('bpmndi:BPMNEdge');
    // Balanced definitions tag
    expect(xml).toContain('</bpmn:definitions>');
  });

  it('drawio contains a swimlane pool and nodes', () => {
    const xml = toDrawioXml(sample());
    expect(xml).toContain('<mxfile');
    expect(xml).toContain('swimlane');
    expect(xml).toContain('Pick &amp; pack order');
  });

  it('svg renders lanes, nodes and arrows', () => {
    const svg = toSvg(sample());
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('marker-end="url(#arrow)"');
    expect(svg).toContain('Warehouse');
    expect((svg.match(/<rect/g) || []).length).toBeGreaterThan(5);
  });

  it('csv escapes properly and documentModel is complete', () => {
    const csv = toCsv(activityRows(sample()));
    expect(csv.split('\n')[0]).toContain('Activity');
    expect(csv).toContain('Pick & pack order');
    const dm = documentModel(sample());
    expect(dm.title).toBe('Order Fulfilment & Delivery');
    expect(dm.activities.length).toBe(11);
    expect(dm.raci.length).toBeGreaterThan(0);
    expect(dm.analysis.healthScore).toBeGreaterThan(0);
    expect(raciRows(sample())[0]).toHaveProperty('Responsible');
  });
});

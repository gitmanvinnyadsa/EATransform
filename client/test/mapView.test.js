import { describe, it, expect } from 'vitest';
import { deriveView, laneAtY } from '../src/lib/mapView.js';
import { sampleOrderFulfilmentMap } from '@eatransform/shared';

describe('mapView derivation', () => {
  it('creates a lane band and a proc node per model element', () => {
    const map = sampleOrderFulfilmentMap();
    const view = deriveView(map);
    expect(view.rfNodes.filter((n) => n.type === 'lane')).toHaveLength(map.lanes.length);
    expect(view.rfNodes.filter((n) => n.type === 'proc')).toHaveLength(map.nodes.length);
    expect(view.rfEdges).toHaveLength(map.edges.length);
  });

  it('hides nodes and their edges when a lane is collapsed', () => {
    const map = sampleOrderFulfilmentMap();
    map.lanes.find((l) => l.id === 'lane_wh').collapsed = true;
    const view = deriveView(map);
    const hidden = map.nodes.filter((n) => n.laneId === 'lane_wh').map((n) => n.id);
    expect(view.rfNodes.some((n) => hidden.includes(n.id))).toBe(false);
    expect(view.rfEdges.some((e) => hidden.includes(e.source) || hidden.includes(e.target))).toBe(false);
    // Connections in other lanes survive.
    expect(view.rfEdges.length).toBeGreaterThan(0);
  });

  it('collapse never breaks the underlying model connections', () => {
    const map = sampleOrderFulfilmentMap();
    map.lanes.forEach((l) => (l.collapsed = true));
    const view = deriveView(map);
    expect(view.rfEdges).toHaveLength(0);
    expect(map.edges).toHaveLength(11); // model untouched
  });

  it('respects manual positions and grows the canvas', () => {
    const map = sampleOrderFulfilmentMap();
    map.nodes[1].position = { x: 5000, y: 100 };
    const view = deriveView(map);
    expect(view.width).toBeGreaterThan(5000);
    expect(view.rfNodes.find((n) => n.id === map.nodes[1].id).position.x).toBe(5000);
  });

  it('marks highlighted nodes', () => {
    const map = sampleOrderFulfilmentMap();
    const view = deriveView(map, { highlight: new Set(['n_pick']) });
    expect(view.rfNodes.find((n) => n.id === 'n_pick').data.highlighted).toBe(true);
  });

  it('laneAtY resolves the correct band', () => {
    const view = deriveView(sampleOrderFulfilmentMap());
    const band = view.bands[2];
    expect(laneAtY(view.bands, band.y + band.height / 2)).toBe(band.id);
  });
});

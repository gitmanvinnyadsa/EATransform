/**
 * Derives the React Flow view (lane band nodes + process nodes + edges)
 * from the canonical process map. Manual node positions are respected;
 * unpositioned nodes use the deterministic auto-layout.
 */
import { layoutMap, NODE_W, NODE_H, CANVAS_PAD, COLLAPSED_LANE_H } from '@eatransform/shared';

export { NODE_W, NODE_H };

export function deriveView(map, { highlight = new Set() } = {}) {
  const layout = layoutMap(map);
  const lanes = [...(map.lanes || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  // Effective node positions (manual first, else auto).
  const pos = new Map();
  for (const n of map.nodes) {
    pos.set(n.id, n.position || layout.positions.get(n.id) || { x: CANVAS_PAD + 80, y: CANVAS_PAD + 40 });
  }

  // Lane bands: start from auto geometry, grow to cover manual positions.
  const bands = [];
  let y = CANVAS_PAD;
  let maxX = layout.width;
  for (const g of layout.laneGeom) {
    const lane = lanes.find((l) => l.id === g.id);
    const nodesIn = map.nodes.filter((n) => (n.laneId || '__none__') === g.id);
    let height = g.collapsed ? COLLAPSED_LANE_H : g.height;
    if (!g.collapsed) {
      for (const n of nodesIn) {
        const p = n.position;
        if (!p) continue;
        maxX = Math.max(maxX, p.x + NODE_W + 120);
      }
    }
    bands.push({ ...g, lane, y, height });
    y += height;
  }
  const width = Math.max(900, maxX);
  const height = Math.max(y + CANVAS_PAD, 400);

  const collapsedLanes = new Set(bands.filter((b) => b.collapsed).map((b) => b.id));

  const rfNodes = [
    ...bands.map((b, i) => ({
      id: `lane:${b.id}`,
      type: 'lane',
      position: { x: CANVAS_PAD, y: b.y },
      draggable: false,
      selectable: b.id !== '__none__',
      focusable: false,
      zIndex: -10,
      data: { band: b, index: i, width: width - CANVAS_PAD * 2 },
      style: { width: width - CANVAS_PAD * 2, height: b.height },
    })),
    ...map.nodes
      .filter((n) => !collapsedLanes.has(n.laneId || '__none__'))
      .map((n) => ({
        id: n.id,
        type: 'proc',
        position: pos.get(n.id),
        zIndex: 10,
        data: { node: n, highlighted: highlight.has(n.id) },
      })),
  ];

  const hiddenNode = (id) => {
    const n = map.nodes.find((x) => x.id === id);
    return !n || collapsedLanes.has(n.laneId || '__none__');
  };

  const rfEdges = (map.edges || [])
    .filter((e) => !hiddenNode(e.source) && !hiddenNode(e.target))
    .map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label || e.condition || undefined,
      type: 'smoothstep',
      zIndex: 5,
      markerEnd: { type: 'arrowclosed', width: 18, height: 18, color: '#5b6b84' },
      style:
        e.kind === 'exception'
          ? { strokeDasharray: '6 4', stroke: '#b23a3a' }
          : e.kind === 'message'
            ? { strokeDasharray: '2 3' }
            : undefined,
      data: { edge: e },
    }));

  return { rfNodes, rfEdges, bands, width, height };
}

/** Which lane band contains a given canvas y (node center)? */
export function laneAtY(bands, cy) {
  for (const b of bands) {
    if (cy >= b.y && cy < b.y + b.height) return b.id === '__none__' ? null : b.id;
  }
  return bands.length ? (bands[bands.length - 1].id === '__none__' ? null : bands[bands.length - 1].id) : null;
}

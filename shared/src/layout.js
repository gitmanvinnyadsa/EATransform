/**
 * Deterministic swimlane auto-layout.
 *
 * Nodes are placed on columns computed with a longest-path layering of the
 * flow graph (cycle-safe), and on rows given by their swimlane. Lane heights
 * grow to fit stacked nodes. Works headless (used by the server-side SVG
 * exporter) and in the browser (used by the editor's auto-layout button).
 */

export const NODE_W = 190;
export const NODE_H = 76;
export const COL_GAP = 90;
export const ROW_GAP = 28;
export const LANE_HEADER_W = 44;
export const LANE_PAD = 26;
export const CANVAS_PAD = 40;
export const COLLAPSED_LANE_H = 44;

/** Compute a cycle-safe longest-path layer for every node. */
export function computeLayers(map) {
  const nodes = map.nodes;
  const index = new Map(nodes.map((n) => [n.id, n]));
  const out = new Map(nodes.map((n) => [n.id, []]));
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  // Ignore self-loops; break cycles by skipping back edges found via DFS.
  const edges = map.edges.filter(
    (e) => e.source !== e.target && index.has(e.source) && index.has(e.target)
  );
  const state = new Map(); // 0=unvisited 1=in-stack 2=done
  const backEdges = new Set();
  const adj = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) adj.get(e.source).push(e);
  const dfs = (id) => {
    state.set(id, 1);
    for (const e of adj.get(id) || []) {
      const s = state.get(e.target) || 0;
      if (s === 1) backEdges.add(e.id);
      else if (s === 0) dfs(e.target);
    }
    state.set(id, 2);
  };
  for (const n of nodes) if (!state.get(n.id)) dfs(n.id);
  const fwd = edges.filter((e) => !backEdges.has(e.id));
  for (const e of fwd) {
    out.get(e.source).push(e.target);
    indeg.set(e.target, (indeg.get(e.target) || 0) + 1);
  }
  // Kahn topological order, then longest-path layer assignment.
  const layer = new Map(nodes.map((n) => [n.id, 0]));
  const queue = nodes.filter((n) => (indeg.get(n.id) || 0) === 0).map((n) => n.id);
  const indegWork = new Map(indeg);
  while (queue.length) {
    const id = queue.shift();
    for (const t of out.get(id) || []) {
      layer.set(t, Math.max(layer.get(t), layer.get(id) + 1));
      indegWork.set(t, indegWork.get(t) - 1);
      if (indegWork.get(t) === 0) queue.push(t);
    }
  }
  return layer;
}

/**
 * Full layout. Returns:
 * {
 *   positions: Map(nodeId -> {x,y}),
 *   laneGeom: [{id, name, y, height, collapsed}],
 *   width, height, columns
 * }
 */
export function layoutMap(map) {
  const layers = computeLayers(map);
  const maxLayer = Math.max(0, ...layers.values());
  const lanes = [...(map.lanes || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const hasLanes = lanes.length > 0;

  // Group nodes per lane (nodes without a lane get a virtual trailing lane).
  const laneList = hasLanes ? lanes.map((l) => l.id) : ['__none__'];
  const unassigned = map.nodes.filter((n) => !n.laneId || !lanes.some((l) => l.id === n.laneId));
  if (hasLanes && unassigned.length > 0) laneList.push('__none__');

  const byLane = new Map(laneList.map((id) => [id, []]));
  for (const n of map.nodes) {
    const key = byLane.has(n.laneId) ? n.laneId : '__none__';
    (byLane.get(key) || byLane.get('__none__')).push(n);
  }

  // Per lane, stack nodes that share a column.
  const positions = new Map();
  const laneGeom = [];
  let y = CANVAS_PAD;
  for (const laneId of laneList) {
    const lane = lanes.find((l) => l.id === laneId);
    const collapsed = lane?.collapsed ?? false;
    const laneNodes = byLane.get(laneId) || [];
    const byCol = new Map();
    for (const n of laneNodes) {
      const c = layers.get(n.id) ?? 0;
      if (!byCol.has(c)) byCol.set(c, []);
      byCol.get(c).push(n);
    }
    const maxStack = Math.max(1, ...[...byCol.values()].map((a) => a.length));
    const height = collapsed
      ? COLLAPSED_LANE_H
      : Math.max(lane?.height ?? 0, LANE_PAD * 2 + maxStack * NODE_H + (maxStack - 1) * ROW_GAP);
    if (!collapsed) {
      for (const [col, arr] of byCol) {
        arr.sort((a, b) => a.id.localeCompare(b.id));
        const stackH = arr.length * NODE_H + (arr.length - 1) * ROW_GAP;
        let ny = y + (height - stackH) / 2;
        for (const n of arr) {
          positions.set(n.id, {
            x: CANVAS_PAD + LANE_HEADER_W + 20 + col * (NODE_W + COL_GAP),
            y: ny,
          });
          ny += NODE_H + ROW_GAP;
        }
      }
    }
    laneGeom.push({
      id: laneId,
      name: lane?.name ?? 'Unassigned',
      color: lane?.color || '',
      y,
      height,
      collapsed,
      locked: lane?.locked ?? false,
    });
    y += height;
  }

  const width =
    CANVAS_PAD * 2 + LANE_HEADER_W + 40 + (maxLayer + 1) * (NODE_W + COL_GAP) - COL_GAP;
  const height = y + CANVAS_PAD;
  return { positions, laneGeom, width: Math.max(width, 600), height, columns: maxLayer + 1 };
}

/**
 * Apply auto-layout positions onto a map copy (fills node.position).
 * Keeps existing manual positions when `respectManual` is true.
 */
export function applyAutoLayout(map, { respectManual = false } = {}) {
  const { positions } = layoutMap(map);
  const out = JSON.parse(JSON.stringify(map));
  for (const n of out.nodes) {
    if (respectManual && n.position) continue;
    const p = positions.get(n.id);
    if (p) n.position = p;
  }
  return out;
}

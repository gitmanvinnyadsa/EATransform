/**
 * Export a process map to draw.io / diagrams.net XML (mxGraph model with
 * swimlane pool). The file opens directly in app.diagrams.net and in
 * Visio-compatible workflows via draw.io's Visio export.
 */
import { layoutMap, NODE_W, NODE_H, LANE_HEADER_W, CANVAS_PAD } from '../layout.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function styleFor(node) {
  switch (node.type) {
    case 'start':
      return 'ellipse;fillColor=#d5e8d4;strokeColor=#82b366;';
    case 'end':
      return 'ellipse;fillColor=#f8cecc;strokeColor=#b85450;';
    case 'decision':
      return 'rhombus;fillColor=#fff2cc;strokeColor=#d6b656;';
    case 'approval':
      return 'rounded=1;fillColor=#e1d5e7;strokeColor=#9673a6;';
    case 'subprocess':
      return 'rounded=1;fillColor=#dae8fc;strokeColor=#6c8ebf;shape=process;';
    case 'document':
      return 'shape=document;fillColor=#f5f5f5;strokeColor=#666666;';
    case 'event':
    case 'wait':
      return 'ellipse;fillColor=#ffe6cc;strokeColor=#d79b00;';
    default:
      return 'rounded=1;fillColor=#ffffff;strokeColor=#333333;';
  }
}

export function toDrawioXml(map) {
  const layout = layoutMap(map);
  const cells = [];
  const poolId = 'pool1';
  const lanes = [...(map.lanes || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const hasLanes = lanes.length > 0;

  if (hasLanes) {
    const poolH = layout.laneGeom.reduce((s, g) => s + g.height, 0);
    cells.push(
      `<mxCell id="${poolId}" value="${esc(map.name)}" style="swimlane;horizontal=0;startSize=30;" vertex="1" parent="1"><mxGeometry x="20" y="20" width="${Math.round(layout.width)}" height="${Math.round(poolH + 30)}" as="geometry"/></mxCell>`
    );
    let ly = 30;
    for (const lane of lanes) {
      const g = layout.laneGeom.find((l) => l.id === lane.id);
      if (!g) continue;
      cells.push(
        `<mxCell id="lane_${esc(lane.id)}" value="${esc(lane.name)}" style="swimlane;horizontal=0;startSize=30;" vertex="1" parent="${poolId}"><mxGeometry x="30" y="${ly}" width="${Math.round(layout.width - 30)}" height="${Math.round(g.height)}" as="geometry"/></mxCell>`
      );
      ly += g.height;
    }
  }

  for (const n of map.nodes) {
    const pos = layout.positions.get(n.id) || { x: 0, y: 0 };
    let parent = '1';
    let x = pos.x;
    let y = pos.y;
    if (hasLanes && n.laneId && lanes.some((l) => l.id === n.laneId)) {
      parent = `lane_${n.laneId}`;
      const g = layout.laneGeom.find((l) => l.id === n.laneId);
      x = pos.x - CANVAS_PAD - LANE_HEADER_W + 20;
      y = pos.y - (g?.y ?? 0);
    }
    cells.push(
      `<mxCell id="node_${esc(n.id)}" value="${esc(n.label)}" style="${styleFor(n)}whiteSpace=wrap;html=1;" vertex="1" parent="${parent}"><mxGeometry x="${Math.round(x)}" y="${Math.round(y)}" width="${NODE_W}" height="${NODE_H}" as="geometry"/></mxCell>`
    );
  }

  for (const e of map.edges || []) {
    const style =
      e.kind === 'exception'
        ? 'edgeStyle=orthogonalEdgeStyle;dashed=1;strokeColor=#b85450;'
        : 'edgeStyle=orthogonalEdgeStyle;rounded=1;';
    cells.push(
      `<mxCell id="edge_${esc(e.id)}" value="${esc(e.label || e.condition || '')}" style="${style}html=1;" edge="1" parent="1" source="node_${esc(e.source)}" target="node_${esc(e.target)}"><mxGeometry relative="1" as="geometry"/></mxCell>`
    );
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="EATransform" type="device">
  <diagram id="d1" name="${esc(map.name)}">
    <mxGraphModel dx="1000" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1600" pageHeight="1200" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        ${cells.join('\n        ')}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
`;
}

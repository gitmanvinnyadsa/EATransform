/**
 * Headless SVG renderer for process maps. Produces a self-contained SVG
 * with swimlanes, shaped nodes, and orthogonal-ish connectors. Used for the
 * SVG export directly, and as the raster source for PNG / PDF / PPTX exports.
 */
import { layoutMap, NODE_W, NODE_H, LANE_HEADER_W, CANVAS_PAD } from '../layout.js';

const COLORS = {
  start: { fill: '#e7f6ec', stroke: '#2e9e5b' },
  end: { fill: '#fdeaea', stroke: '#c0392b' },
  task: { fill: '#ffffff', stroke: '#41506b' },
  decision: { fill: '#fff8e1', stroke: '#c9a227' },
  approval: { fill: '#f3ecfb', stroke: '#8e5bbf' },
  subprocess: { fill: '#e8f0fe', stroke: '#3b6fc9' },
  document: { fill: '#f4f4f4', stroke: '#6b7280' },
  event: { fill: '#fff1e6', stroke: '#d97a1f' },
  wait: { fill: '#fff1e6', stroke: '#d97a1f' },
  milestone: { fill: '#eef7f9', stroke: '#2a8a9d' },
};

const LANE_FILLS = ['#f7f9fc', '#f0f4f9'];

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapText(text, maxChars = 24, maxLines = 3) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = (cur + ' ' + w).trim();
    }
    if (lines.length === maxLines) break;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (words.join(' ').length > lines.join(' ').length && lines.length === maxLines) {
    lines[maxLines - 1] = lines[maxLines - 1].replace(/.{3}$/, '') + '…';
  }
  return lines;
}

function nodeShape(n, x, y) {
  const c = COLORS[n.type] || COLORS.task;
  const cx = x + NODE_W / 2;
  const cy = y + NODE_H / 2;
  const label = wrapText(n.label)
    .map(
      (line, i, arr) =>
        `<tspan x="${cx}" dy="${i === 0 ? -(arr.length - 1) * 7 : 14}">${esc(line)}</tspan>`
    )
    .join('');
  const text = `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="12" font-family="Inter, Segoe UI, Arial, sans-serif" fill="#1c2536">${label}</text>`;
  switch (n.type) {
    case 'start':
    case 'end': {
      return `<ellipse cx="${cx}" cy="${cy}" rx="${NODE_W / 2 - 30}" ry="${NODE_H / 2 - 6}" fill="${c.fill}" stroke="${c.stroke}" stroke-width="${n.type === 'end' ? 2.5 : 1.5}"/>${text}`;
    }
    case 'decision': {
      const pts = `${cx},${y} ${x + NODE_W - 20},${cy} ${cx},${y + NODE_H} ${x + 20},${cy}`;
      return `<polygon points="${pts}" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.5"/>${text}`;
    }
    case 'event':
    case 'wait': {
      return `<circle cx="${cx}" cy="${cy}" r="${NODE_H / 2 - 4}" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.5"/>${text}`;
    }
    case 'subprocess': {
      return (
        `<rect x="${x}" y="${y}" width="${NODE_W}" height="${NODE_H}" rx="8" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.5"/>` +
        `<rect x="${cx - 9}" y="${y + NODE_H - 16}" width="18" height="12" rx="2" fill="none" stroke="${c.stroke}"/>` +
        `<line x1="${cx}" y1="${y + NODE_H - 14}" x2="${cx}" y2="${y + NODE_H - 6}" stroke="${c.stroke}"/>` +
        `<line x1="${cx - 5}" y1="${y + NODE_H - 10}" x2="${cx + 5}" y2="${y + NODE_H - 10}" stroke="${c.stroke}"/>` +
        text
      );
    }
    case 'document': {
      const h = NODE_H;
      const d = `M ${x} ${y} h ${NODE_W} v ${h - 12} q ${-NODE_W / 4} 12 ${-NODE_W / 2} 0 q ${-NODE_W / 4} -12 ${-NODE_W / 2} 0 Z`;
      return `<path d="${d}" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.5"/>${text}`;
    }
    default: {
      const badge =
        n.type === 'approval'
          ? `<text x="${x + 10}" y="${y + 16}" font-size="11" fill="${c.stroke}" font-family="Arial">✓</text>`
          : '';
      return `<rect x="${x}" y="${y}" width="${NODE_W}" height="${NODE_H}" rx="10" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.5"/>${badge}${text}`;
    }
  }
}

export function toSvg(map, { title = true } = {}) {
  const layout = layoutMap(map);
  const parts = [];
  const titleH = title ? 56 : 0;
  const W = Math.round(layout.width);
  const H = Math.round(layout.height + titleH);

  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`);
  if (title) {
    parts.push(
      `<text x="${CANVAS_PAD}" y="34" font-size="20" font-weight="600" font-family="Inter, Segoe UI, Arial, sans-serif" fill="#101828">${esc(map.name)}</text>`
    );
  }

  // lanes
  layout.laneGeom.forEach((g, i) => {
    const y = g.y + titleH;
    parts.push(
      `<rect x="${CANVAS_PAD}" y="${y}" width="${W - CANVAS_PAD * 2}" height="${g.height}" fill="${g.color || LANE_FILLS[i % 2]}" stroke="#d3dce8"/>`
    );
    parts.push(
      `<rect x="${CANVAS_PAD}" y="${y}" width="${LANE_HEADER_W}" height="${g.height}" fill="#eef2f8" stroke="#d3dce8"/>`
    );
    parts.push(
      `<text transform="translate(${CANVAS_PAD + LANE_HEADER_W / 2 + 5}, ${y + g.height / 2}) rotate(-90)" text-anchor="middle" font-size="13" font-weight="600" font-family="Inter, Segoe UI, Arial, sans-serif" fill="#33415c">${esc(
        wrapText(g.name, 26, 1)[0] || ''
      )}</text>`
    );
  });

  // edges under nodes
  parts.push(
    `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#5b6b84"/></marker></defs>`
  );
  for (const e of map.edges || []) {
    const s = layout.positions.get(e.source);
    const t = layout.positions.get(e.target);
    if (!s || !t) continue;
    const x1 = s.x + NODE_W;
    const y1 = s.y + NODE_H / 2 + titleH;
    const x2 = t.x;
    const y2 = t.y + NODE_H / 2 + titleH;
    const dash = e.kind === 'exception' ? ' stroke-dasharray="6 4"' : '';
    let d;
    if (x2 >= x1) {
      const mx = (x1 + x2) / 2;
      d = `M ${x1} ${y1} L ${mx} ${y1} L ${mx} ${y2} L ${x2} ${y2}`;
    } else {
      // back edge — route below both nodes
      const yb = Math.max(y1, y2) + NODE_H;
      d = `M ${x1} ${y1} L ${x1 + 20} ${y1} L ${x1 + 20} ${yb} L ${x2 - 20} ${yb} L ${x2 - 20} ${y2} L ${x2} ${y2}`;
    }
    parts.push(`<path d="${d}" fill="none" stroke="#5b6b84" stroke-width="1.5"${dash} marker-end="url(#arrow)"/>`);
    const lbl = e.label || e.condition;
    if (lbl) {
      const lx = (x1 + x2) / 2;
      const ly = (y1 + y2) / 2 - 6;
      parts.push(
        `<text x="${lx}" y="${ly}" text-anchor="middle" font-size="11" font-family="Inter, Segoe UI, Arial, sans-serif" fill="#475467" paint-order="stroke" stroke="#ffffff" stroke-width="3">${esc(lbl)}</text>`
      );
    }
  }

  // nodes
  for (const n of map.nodes) {
    const p = layout.positions.get(n.id);
    if (!p) continue;
    parts.push(nodeShape(n, p.x, p.y + titleH));
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Inter, Segoe UI, Arial, sans-serif">${parts.join(
    '\n'
  )}</svg>`;
}

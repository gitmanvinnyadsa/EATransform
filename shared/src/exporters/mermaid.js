/** Export a process map to a Mermaid flowchart definition. */

function mid(id) {
  return id.replace(/[^a-zA-Z0-9_]/g, '_');
}

function esc(text) {
  return String(text || '').replace(/"/g, '#quot;').replace(/[\n\r]+/g, ' ');
}

function shape(node) {
  const label = esc(node.label);
  switch (node.type) {
    case 'start':
    case 'end':
      return `${mid(node.id)}(["${label}"])`;
    case 'decision':
      return `${mid(node.id)}{"${label}"}`;
    case 'subprocess':
      return `${mid(node.id)}[["${label}"]]`;
    case 'document':
      return `${mid(node.id)}[/"${label}"/]`;
    case 'event':
    case 'wait':
      return `${mid(node.id)}(("${label}"))`;
    default:
      return `${mid(node.id)}["${label}"]`;
  }
}

export function toMermaid(map) {
  const lines = ['flowchart LR'];
  const lanes = [...(map.lanes || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const byLane = new Map();
  const loose = [];
  for (const n of map.nodes) {
    if (n.laneId && lanes.some((l) => l.id === n.laneId)) {
      if (!byLane.has(n.laneId)) byLane.set(n.laneId, []);
      byLane.get(n.laneId).push(n);
    } else {
      loose.push(n);
    }
  }
  for (const lane of lanes) {
    const nodes = byLane.get(lane.id) || [];
    if (nodes.length === 0) continue;
    lines.push(`  subgraph ${mid(lane.id)}["${esc(lane.name)}"]`);
    for (const n of nodes) lines.push(`    ${shape(n)}`);
    lines.push('  end');
  }
  for (const n of loose) lines.push(`  ${shape(n)}`);
  for (const e of map.edges || []) {
    const label = e.label || e.condition;
    const arrow = e.kind === 'exception' ? '-.->' : e.kind === 'message' ? '==>' : '-->';
    lines.push(
      label
        ? `  ${mid(e.source)} ${arrow}|"${esc(label)}"| ${mid(e.target)}`
        : `  ${mid(e.source)} ${arrow} ${mid(e.target)}`
    );
  }
  return lines.join('\n') + '\n';
}

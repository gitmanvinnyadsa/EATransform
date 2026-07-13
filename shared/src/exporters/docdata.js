/**
 * Tabular/document representations of a process map, shared by the Excel,
 * CSV, Word and PowerPoint exporters (which only differ in file packaging).
 */
import { analyzeMap } from '../analysis.js';

export function activityRows(map) {
  const laneName = (laneId) => map.lanes.find((l) => l.id === laneId)?.name || '';
  return map.nodes.map((n, i) => ({
    '#': i + 1,
    Activity: n.label,
    Type: n.type,
    'Swimlane / Owner lane': laneName(n.laneId),
    Owner: n.owner || '',
    Role: n.role || '',
    Description: n.description || '',
    Inputs: (n.inputs || []).join('; '),
    Outputs: (n.outputs || []).join('; '),
    Systems: (n.systems || []).join('; '),
    Automation: n.automation || 'manual',
    'Duration (min)': n.durationMins ?? '',
    'Waiting (min)': n.waitMins ?? '',
    Risks: (n.risks || []).map((r) => r.name).join('; '),
    Controls: (n.controls || []).join('; '),
    'Business rules': (n.businessRules || []).join('; '),
  }));
}

export function raciRows(map) {
  return map.nodes
    .filter((n) => !['start', 'end'].includes(n.type))
    .map((n) => ({
      Activity: n.label,
      Responsible: n.raci?.responsible || n.role || n.owner || '',
      Accountable: n.raci?.accountable || map.owner || '',
      Consulted: n.raci?.consulted || '',
      Informed: n.raci?.informed || '',
    }));
}

export function edgeRows(map) {
  const label = (id) => map.nodes.find((n) => n.id === id)?.label || id;
  return map.edges.map((e) => ({
    From: label(e.source),
    To: label(e.target),
    Condition: e.condition || e.label || '',
    Kind: e.kind || 'sequence',
  }));
}

export function kpiRows(map) {
  return (map.kpis || []).map((k) => ({
    KPI: k.name,
    Target: k.target || '',
    Unit: k.unit || '',
    Description: k.description || '',
  }));
}

export function riskRows(map) {
  const all = [
    ...(map.risks || []).map((r) => ({ ...r, Where: 'Process level' })),
    ...map.nodes.flatMap((n) => (n.risks || []).map((r) => ({ ...r, Where: n.label }))),
  ];
  return all.map((r) => ({
    Risk: r.name,
    Severity: r.severity || 'medium',
    Where: r.Where,
    Mitigation: r.mitigation || '',
  }));
}

/** Full document model used by DOCX / PPTX exports. */
export function documentModel(map) {
  const analysis = analyzeMap(map);
  return {
    title: map.name,
    overview: {
      Purpose: map.purpose || '—',
      'Business objective': map.objective || '—',
      Scope: map.scope || '—',
      'Process owner': map.owner || '—',
      'Process level': `Level ${map.level ?? 1}`,
      'Map type': map.type,
      Departments: (map.departments || []).join(', ') || '—',
      Stakeholders: (map.stakeholders || []).join(', ') || '—',
      Customers: (map.customers || []).join(', ') || '—',
      Suppliers: (map.suppliers || []).join(', ') || '—',
      Dependencies: (map.dependencies || []).join(', ') || '—',
      Compliance: (map.compliance || []).join(', ') || '—',
    },
    activities: activityRows(map),
    raci: raciRows(map),
    flows: edgeRows(map),
    kpis: kpiRows(map),
    risks: riskRows(map),
    analysis,
  };
}

export function toCsv(rows) {
  if (!rows || rows.length === 0) return '';
  const cols = Object.keys(rows[0]);
  const cell = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n') + '\n';
}

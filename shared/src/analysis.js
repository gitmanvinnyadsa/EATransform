/**
 * Deterministic business-process analysis engine.
 *
 * Computes the metrics shown in the AI Business Analysis panel from the map
 * structure itself, so insights work even with no AI key configured. The AI
 * layer enriches these results with narrative recommendations.
 */

function pct(n) {
  return Math.round(n * 100);
}

export function analyzeMap(map) {
  const nodes = map.nodes || [];
  const edges = map.edges || [];
  const activities = nodes.filter((n) => !['start', 'end', 'milestone', 'event'].includes(n.type));
  const decisions = nodes.filter((n) => n.type === 'decision');
  const approvals = nodes.filter((n) => n.type === 'approval');
  const waits = nodes.filter((n) => n.type === 'wait');
  const manual = activities.filter((n) => (n.automation || 'manual') === 'manual');
  const automated = activities.filter((n) => n.automation === 'automated');

  // --- complexity -------------------------------------------------------
  const branchFactor = decisions.length + edges.filter((e) => e.kind === 'alternative').length;
  const complexityRaw =
    nodes.length * 1 + edges.length * 0.5 + branchFactor * 2 + (map.lanes?.length || 0) * 1.5;
  const complexityScore = Math.min(100, Math.round(complexityRaw * 1.4));
  const complexityLabel =
    complexityScore < 25 ? 'Low' : complexityScore < 55 ? 'Moderate' : complexityScore < 80 ? 'High' : 'Very high';

  // --- time -------------------------------------------------------------
  const cycleTimeMins = activities.reduce((s, n) => s + (n.durationMins || 0), 0);
  const waitingTimeMins =
    nodes.reduce((s, n) => s + (n.waitMins || 0), 0) +
    waits.reduce((s, n) => s + (n.durationMins || 0), 0);
  const totalTime = cycleTimeMins + waitingTimeMins;
  const valueAddRatio = totalTime > 0 ? cycleTimeMins / totalTime : null;

  // --- bottlenecks --------------------------------------------------------
  const indegree = new Map();
  const outdegree = new Map();
  for (const e of edges) {
    outdegree.set(e.source, (outdegree.get(e.source) || 0) + 1);
    indegree.set(e.target, (indegree.get(e.target) || 0) + 1);
  }
  const bottlenecks = [];
  for (const n of activities) {
    const reasons = [];
    if ((indegree.get(n.id) || 0) >= 3) reasons.push('multiple flows converge here');
    if (n.type === 'approval') reasons.push('approval step (queueing / handoff delay)');
    if ((n.waitMins || 0) > 0) reasons.push(`${n.waitMins} min recorded waiting time`);
    if (n.type === 'wait') reasons.push('explicit waiting step');
    if ((n.durationMins || 0) > 0 && cycleTimeMins > 0 && n.durationMins / cycleTimeMins > 0.3) {
      reasons.push(`consumes ${pct(n.durationMins / cycleTimeMins)}% of total cycle time`);
    }
    if (reasons.length > 0) bottlenecks.push({ nodeId: n.id, label: n.label, reasons });
  }

  // --- automation opportunities ------------------------------------------
  const automationOpportunities = manual
    .filter((n) => n.type !== 'approval')
    .map((n) => ({
      nodeId: n.id,
      label: n.label,
      suggestion:
        n.type === 'document'
          ? 'Document handling can usually be digitised or auto-generated.'
          : (n.systems || []).length > 0
            ? `Already touches ${n.systems.join(', ')} — a candidate for system automation or RPA.`
            : 'Manual task — evaluate automation or standard work instructions.',
    }));

  // --- risks / controls ----------------------------------------------------
  const allRisks = [
    ...(map.risks || []).map((r) => ({ ...r, scope: 'process' })),
    ...nodes.flatMap((n) => (n.risks || []).map((r) => ({ ...r, scope: n.label, nodeId: n.id }))),
  ];
  const uncontrolled = nodes.filter((n) => (n.risks || []).length > 0 && (n.controls || []).length === 0);

  // --- structure issues -----------------------------------------------------
  const issues = [];
  if (!nodes.some((n) => n.type === 'start')) issues.push('No clear process start defined.');
  if (!nodes.some((n) => n.type === 'end')) issues.push('No clear process end defined.');
  for (const d of decisions) {
    if ((outdegree.get(d.id) || 0) < 2) {
      issues.push(`Decision "${d.label}" has fewer than two outgoing routes.`);
    }
  }
  const ownerless = activities.filter((n) => !n.owner && !n.role);
  if (ownerless.length > 0 && ownerless.length === activities.length && !map.owner) {
    issues.push('No process owner or activity owners assigned.');
  }
  if (approvals.length >= 3) {
    issues.push(`${approvals.length} approval steps — review whether all are necessary.`);
  }

  // --- health score -----------------------------------------------------------
  let health = 100;
  health -= issues.length * 8;
  health -= bottlenecks.length * 5;
  health -= uncontrolled.length * 4;
  health -= (map.kpis || []).length === 0 ? 8 : 0;
  health -= !map.owner ? 6 : 0;
  if (activities.length > 0) health -= Math.round((manual.length / activities.length) * 15);
  if (valueAddRatio !== null && valueAddRatio < 0.5) health -= 10;
  health = Math.max(5, Math.min(100, health));

  // --- recommendations ----------------------------------------------------------
  const recommendations = [];
  if (!map.owner) recommendations.push('Assign a single accountable process owner.');
  if ((map.kpis || []).length === 0)
    recommendations.push('Define KPIs (e.g. cycle time, first-time-right rate, cost per case).');
  if (approvals.length >= 2)
    recommendations.push('Consolidate sequential approvals or introduce approval thresholds.');
  if (manual.length > automated.length)
    recommendations.push('Prioritise automation of high-volume manual tasks identified below.');
  if (waitingTimeMins > 0 && valueAddRatio !== null && valueAddRatio < 0.6)
    recommendations.push('Waiting time dominates cycle time — investigate handoffs between lanes.');
  if (uncontrolled.length > 0)
    recommendations.push(
      `Add controls for risk-bearing steps: ${uncontrolled.map((n) => n.label).join(', ')}.`
    );
  const laneCount = map.lanes?.length || 0;
  const handoffs = edges.filter((e) => {
    const s = nodes.find((n) => n.id === e.source);
    const t = nodes.find((n) => n.id === e.target);
    return s && t && s.laneId && t.laneId && s.laneId !== t.laneId;
  }).length;
  if (laneCount > 1 && handoffs > nodes.length * 0.6)
    recommendations.push('High number of cross-team handoffs — consider re-sequencing work within teams.');

  const suggestedKpis =
    (map.kpis || []).length > 0
      ? []
      : [
          { name: 'End-to-end cycle time', unit: 'hours', target: '' },
          { name: 'First-time-right rate', unit: '%', target: '≥ 95' },
          { name: 'Cost per transaction', unit: 'currency', target: '' },
        ];

  return {
    healthScore: health,
    complexityScore,
    complexityLabel,
    counts: {
      nodes: nodes.length,
      activities: activities.length,
      decisions: decisions.length,
      approvals: approvals.length,
      lanes: laneCount,
      handoffs,
      manualTasks: manual.length,
      automatedTasks: automated.length,
    },
    cycleTimeMins,
    waitingTimeMins,
    valueAddRatio,
    bottlenecks,
    automationOpportunities,
    manualWork: manual.map((n) => ({ nodeId: n.id, label: n.label })),
    risks: allRisks,
    uncontrolledRiskSteps: uncontrolled.map((n) => ({ nodeId: n.id, label: n.label })),
    issues,
    recommendations,
    suggestedKpis,
    suggestedOwner:
      map.owner ||
      (map.lanes?.[0]?.name ? `${map.lanes[0].name} lead` : 'Operations manager'),
    customerImpact: nodes.some((n) => {
      const lane = (map.lanes || []).find((l) => l.id === n.laneId);
      return lane?.kind === 'customer';
    })
      ? 'Customer directly participates in this process — delays and errors are immediately visible to them.'
      : 'Customer is not directly in the flow — impact is indirect through output quality and lead time.',
  };
}

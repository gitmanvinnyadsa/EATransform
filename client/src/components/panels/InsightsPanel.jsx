import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useEditorStore } from '../../store.js';

function scoreColor(v) {
  return v >= 75 ? 'var(--accent)' : v >= 50 ? 'var(--warn)' : 'var(--danger)';
}

function mins(m) {
  if (m == null) return '—';
  if (m < 60) return `${m} min`;
  if (m < 60 * 24) return `${(m / 60).toFixed(1)} h`;
  return `${(m / 1440).toFixed(1)} days`;
}

export default function InsightsPanel({ processId, onHighlight }) {
  const map = useEditorStore((s) => s.map);
  const saveState = useEditorStore((s) => s.saveState);
  const toast = useEditorStore((s) => s.toast);
  const [analysis, setAnalysis] = useState(null);
  const [aiNarrative, setAiNarrative] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => {
    if (!processId || saveState === 'dirty' || saveState === 'saving') return;
    api.getAnalysis(processId).then(setAnalysis).catch(() => {});
  }, [processId, saveState, map]);

  async function runAiReview() {
    setAiBusy(true);
    try {
      const res = await api.aiInsights(processId);
      setAiNarrative(res);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setAiBusy(false);
    }
  }

  if (!analysis) return <div className="muted"><span className="spinner" /> Analysing process…</div>;

  const a = analysis;
  return (
    <div>
      <div className="score-row">
        <div className="score-tile">
          <div className="val" style={{ color: scoreColor(a.healthScore) }}>{a.healthScore}</div>
          <div className="lbl">Health score</div>
        </div>
        <div className="score-tile">
          <div className="val">{a.complexityScore}</div>
          <div className="lbl">Complexity · {a.complexityLabel}</div>
        </div>
      </div>

      <div className="score-row">
        <div className="score-tile">
          <div className="val" style={{ fontSize: 17 }}>{mins(a.cycleTimeMins)}</div>
          <div className="lbl">Cycle time</div>
        </div>
        <div className="score-tile">
          <div className="val" style={{ fontSize: 17 }}>{mins(a.waitingTimeMins)}</div>
          <div className="lbl">Waiting time</div>
        </div>
        <div className="score-tile">
          <div className="val" style={{ fontSize: 17 }}>{a.counts.handoffs}</div>
          <div className="lbl">Handoffs</div>
        </div>
      </div>

      <div className="insight-section">
        <h4>Customer impact</h4>
        <div className="insight-item">{a.customerImpact}</div>
      </div>

      {a.issues.length > 0 && (
        <div className="insight-section">
          <h4>Structural issues</h4>
          {a.issues.map((s, i) => (
            <div className="insight-item" key={i}>⚠ {s}</div>
          ))}
        </div>
      )}

      <div className="insight-section">
        <h4>
          Bottlenecks{' '}
          {a.bottlenecks.length > 0 && (
            <button className="btn sm ghost" onClick={() => onHighlight?.(a.bottlenecks.map((b) => b.nodeId))}>
              highlight on map
            </button>
          )}
        </h4>
        {a.bottlenecks.length === 0 ? (
          <div className="muted">None detected.</div>
        ) : (
          a.bottlenecks.map((b) => (
            <div className="insight-item" key={b.nodeId}>
              <b>{b.label}</b>
              {b.reasons.join('; ')}
            </div>
          ))
        )}
      </div>

      <div className="insight-section">
        <h4>Manual work &amp; automation opportunities</h4>
        <div className="insight-item">
          {a.counts.manualTasks} manual · {a.counts.automatedTasks} automated activities
        </div>
        {a.automationOpportunities.slice(0, 6).map((o) => (
          <div className="insight-item" key={o.nodeId}>
            <b>{o.label}</b>
            {o.suggestion}
          </div>
        ))}
      </div>

      {a.risks.length > 0 && (
        <div className="insight-section">
          <h4>Risks</h4>
          {a.risks.map((r, i) => (
            <div className="insight-item" key={i}>
              <b>
                {r.name} <span className={`badge ${r.severity === 'high' || r.severity === 'critical' ? 'red' : 'amber'}`}>{r.severity}</span>
              </b>
              {r.scope !== 'process' ? `At: ${r.scope}. ` : ''}
              {r.mitigation ? `Mitigation: ${r.mitigation}` : ''}
            </div>
          ))}
        </div>
      )}

      <div className="insight-section">
        <h4>Recommended improvements</h4>
        {a.recommendations.length === 0 ? (
          <div className="muted">No recommendations — the process looks healthy.</div>
        ) : (
          a.recommendations.map((r, i) => <div className="insight-item" key={i}>→ {r}</div>)
        )}
      </div>

      {a.suggestedKpis.length > 0 && (
        <div className="insight-section">
          <h4>Suggested KPIs</h4>
          {a.suggestedKpis.map((k, i) => (
            <div className="insight-item" key={i}>
              <b>{k.name}</b>
              {k.target ? `Target: ${k.target} ${k.unit}` : k.unit}
            </div>
          ))}
        </div>
      )}

      <div className="insight-section">
        <h4>Suggested process owner</h4>
        <div className="insight-item">{a.suggestedOwner}</div>
      </div>

      <div className="insight-section">
        <h4>AI consultant review</h4>
        {aiNarrative ? (
          <div className="insight-item" style={{ whiteSpace: 'pre-wrap' }}>{aiNarrative.narrative}</div>
        ) : (
          <button className="btn" onClick={runAiReview} disabled={aiBusy}>
            {aiBusy ? 'Reviewing…' : '✦ Ask the AI for a consultant-style review'}
          </button>
        )}
      </div>
    </div>
  );
}

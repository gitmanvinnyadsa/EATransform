import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { NODE_W, NODE_H } from '../../lib/mapView.js';

const TYPE_LABEL = {
  start: 'Start',
  end: 'End',
  task: 'Task',
  decision: 'Decision',
  approval: 'Approval',
  subprocess: 'Sub-process',
  document: 'Document',
  event: 'Event',
  wait: 'Wait',
  milestone: 'Milestone',
};

export default function ProcNode({ data, selected }) {
  const n = data.node;
  const meta = [];
  if (n.owner || n.role) meta.push(`👤 ${n.owner || n.role}`);
  if (n.durationMins) meta.push(`⏱ ${n.durationMins}m`);
  if (n.automation === 'automated') meta.push('⚙ auto');
  if ((n.risks || []).length) meta.push(`⚠ ${n.risks.length}`);
  if ((n.kpis || []).length) meta.push(`📊 ${n.kpis.length}`);

  return (
    <div
      className={`pnode type-${n.type} ${selected ? 'selected' : ''} ${data.highlighted ? 'flag-bottleneck' : ''}`}
      style={{ width: NODE_W, minHeight: NODE_H, background: n.color || undefined }}
    >
      <Handle type="target" position={Position.Left} />
      <span className="ntype">{TYPE_LABEL[n.type] || n.type}</span>
      <span className="nlabel">{n.label}</span>
      {meta.length > 0 && <span className="nmeta">{meta.join('  ')}</span>}
      {n.type === 'subprocess' && (
        <span className="drill">{n.childProcessId ? '⤵ double-click to open detail' : '⊕ double-click to add detail'}</span>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { NODE_TYPES, LANE_KINDS, MAP_TYPES, EDGE_KINDS, AUTOMATION_LEVELS, genId, applyOperations } from '@eatransform/shared';
import { useEditorStore } from '../../store.js';
import { TextField, NumField, SelectField, TagField, ObjListField, Field } from './fields.jsx';

export default function PropertiesPanel() {
  const map = useEditorStore((s) => s.map);
  const selection = useEditorStore((s) => s.selection);
  const setMap = useEditorStore((s) => s.setMap);
  const select = useEditorStore((s) => s.select);
  const nav = useNavigate();

  if (!map) return null;

  if (selection?.kind === 'node') {
    const node = map.nodes.find((n) => n.id === selection.id);
    if (!node) return <ProcessProps map={map} setMap={setMap} />;
    return <NodeProps node={node} map={map} setMap={setMap} select={select} nav={nav} />;
  }
  if (selection?.kind === 'edge') {
    const edge = map.edges.find((e) => e.id === selection.id);
    if (!edge) return <ProcessProps map={map} setMap={setMap} />;
    return <EdgeProps edge={edge} map={map} setMap={setMap} select={select} />;
  }
  if (selection?.kind === 'lane') {
    const lane = map.lanes.find((l) => l.id === selection.id);
    if (!lane) return <ProcessProps map={map} setMap={setMap} />;
    return <LaneProps lane={lane} map={map} setMap={setMap} select={select} />;
  }
  return <ProcessProps map={map} setMap={setMap} />;
}

function ProcessProps({ map, setMap }) {
  const set = (k) => (v) => setMap((m) => ({ ...m, [k]: v }));
  return (
    <div>
      <h3 style={{ marginBottom: 12 }}>Process information</h3>
      <TextField label="Name" value={map.name} onChange={set('name')} />
      <SelectField
        label="Map type"
        value={map.type}
        onChange={set('type')}
        options={MAP_TYPES.map((t) => ({ value: t, label: t }))}
      />
      <TextField label="Purpose" textarea value={map.purpose} onChange={set('purpose')} />
      <TextField label="Business objective" textarea value={map.objective} onChange={set('objective')} />
      <TextField label="Scope" textarea value={map.scope} onChange={set('scope')} />
      <TextField label="Process owner" value={map.owner} onChange={set('owner')} />
      <NumField label="Hierarchy level (0 = enterprise overview, 4 = work instructions)" value={map.level} onChange={(v) => set('level')(Math.max(0, Math.min(4, v ?? 1)))} />
      <TagField label="Departments" values={map.departments} onChange={set('departments')} />
      <TagField label="Stakeholders" values={map.stakeholders} onChange={set('stakeholders')} />
      <TagField label="Customers" values={map.customers} onChange={set('customers')} />
      <TagField label="Suppliers" values={map.suppliers} onChange={set('suppliers')} />
      <TagField label="Dependencies" values={map.dependencies} onChange={set('dependencies')} />
      <TagField label="Compliance requirements" values={map.compliance} onChange={set('compliance')} />
      <ObjListField
        label="Process KPIs"
        values={map.kpis}
        onChange={set('kpis')}
        fields={[
          { key: 'name', label: 'KPI name' },
          { key: 'target', label: 'Target' },
          { key: 'unit', label: 'Unit' },
        ]}
        addLabel="+ Add KPI"
      />
      <ObjListField
        label="Process risks"
        values={map.risks}
        onChange={set('risks')}
        fields={[
          { key: 'name', label: 'Risk' },
          { key: 'severity', label: 'Severity (low/medium/high/critical)' },
          { key: 'mitigation', label: 'Mitigation' },
        ]}
        addLabel="+ Add risk"
      />
      <SwimlaneManager map={map} setMap={setMap} />
    </div>
  );
}

function SwimlaneManager({ map, setMap }) {
  const lanes = [...map.lanes].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const move = (id, dir) => {
    const order = lanes.map((l) => l.id);
    const i = order.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    setMap((m) => applyOperations(m, [{ op: 'reorder_lanes', order }]).map);
  };
  return (
    <div style={{ marginTop: 8 }}>
      <h4 style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 6 }}>Swimlanes</h4>
      {lanes.map((l) => (
        <div key={l.id} className="list-row">
          <div className="grow">
            <div className="name">{l.name}</div>
            <div className="muted">{l.kind}{l.locked ? ' · locked' : ''}{l.collapsed ? ' · collapsed' : ''}</div>
          </div>
          <button className="btn sm icon" title="Move up" onClick={() => move(l.id, -1)}>↑</button>
          <button className="btn sm icon" title="Move down" onClick={() => move(l.id, 1)}>↓</button>
        </div>
      ))}
      <button
        className="btn sm"
        onClick={() =>
          setMap((m) => ({
            ...m,
            lanes: [...m.lanes, { id: genId('lane'), name: 'New swimlane', kind: 'team', order: m.lanes.length, color: '', collapsed: false, locked: false, height: 180 }],
          }))
        }
      >
        + Add swimlane
      </button>
      <p className="muted" style={{ marginTop: 6 }}>Select a lane on the canvas to rename, recolour, lock, merge or split it.</p>
    </div>
  );
}

function NodeProps({ node, map, setMap, select, nav }) {
  const set = (k) => (v) =>
    setMap((m) => ({ ...m, nodes: m.nodes.map((n) => (n.id === node.id ? { ...n, [k]: v } : n)) }));
  const lanes = [...map.lanes].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3>Activity</h3>
        <button
          className="btn sm danger"
          onClick={() => {
            setMap((m) => ({
              ...m,
              nodes: m.nodes.filter((n) => n.id !== node.id),
              edges: m.edges.filter((e) => e.source !== node.id && e.target !== node.id),
            }));
            select(null);
          }}
        >
          Delete
        </button>
      </div>
      <TextField label="Label" value={node.label} onChange={set('label')} />
      <SelectField label="Type" value={node.type} onChange={set('type')} options={NODE_TYPES.map((t) => ({ value: t, label: t }))} />
      <SelectField
        label="Swimlane"
        value={node.laneId ?? ''}
        onChange={(v) => set('laneId')(v || null)}
        options={[{ value: '', label: '(no lane)' }, ...lanes.map((l) => ({ value: l.id, label: l.name }))]}
      />
      <TextField label="Description" textarea value={node.description} onChange={set('description')} />
      <TextField label="Owner" value={node.owner} onChange={set('owner')} />
      <TextField label="Role" value={node.role} onChange={set('role')} />
      <SelectField label="Automation" value={node.automation} onChange={set('automation')} options={AUTOMATION_LEVELS.map((a) => ({ value: a, label: a }))} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <NumField label="Duration (min)" value={node.durationMins} onChange={set('durationMins')} />
        <NumField label="Waiting (min)" value={node.waitMins} onChange={set('waitMins')} />
        <NumField label="Cost" value={node.cost} onChange={set('cost')} />
        <NumField label="SLA (min)" value={node.slaMins} onChange={set('slaMins')} />
      </div>
      <Field label="Colour override">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="color" value={node.color || '#ffffff'} onChange={(e) => set('color')(e.target.value)} aria-label="Node colour" />
          {node.color && <button className="btn sm" onClick={() => set('color')('')}>Reset</button>}
        </div>
      </Field>
      <TagField label="Inputs" values={node.inputs} onChange={set('inputs')} />
      <TagField label="Outputs" values={node.outputs} onChange={set('outputs')} />
      <TagField label="Documents" values={node.documents} onChange={set('documents')} />
      <TagField label="Systems" values={node.systems} onChange={set('systems')} />
      <TagField label="Business rules" values={node.businessRules} onChange={set('businessRules')} />
      <TagField label="Controls" values={node.controls} onChange={set('controls')} />
      <TagField label="Compliance" values={node.compliance} onChange={set('compliance')} />
      <TagField label="Annotations / notes" values={node.annotations} onChange={set('annotations')} />
      <ObjListField
        label="Risks"
        values={node.risks}
        onChange={set('risks')}
        fields={[
          { key: 'name', label: 'Risk' },
          { key: 'severity', label: 'Severity' },
          { key: 'mitigation', label: 'Mitigation' },
        ]}
        addLabel="+ Add risk"
      />
      <ObjListField
        label="KPIs"
        values={node.kpis}
        onChange={set('kpis')}
        fields={[
          { key: 'name', label: 'KPI' },
          { key: 'target', label: 'Target' },
          { key: 'unit', label: 'Unit' },
        ]}
        addLabel="+ Add KPI"
      />
      <h4 style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--text-3)', margin: '10px 0 6px' }}>RACI</h4>
      <TextField label="Responsible" value={node.raci?.responsible} onChange={(v) => set('raci')({ ...node.raci, responsible: v })} />
      <TextField label="Accountable" value={node.raci?.accountable} onChange={(v) => set('raci')({ ...node.raci, accountable: v })} />
      <TextField label="Consulted" value={node.raci?.consulted} onChange={(v) => set('raci')({ ...node.raci, consulted: v })} />
      <TextField label="Informed" value={node.raci?.informed} onChange={(v) => set('raci')({ ...node.raci, informed: v })} />
      {node.type === 'subprocess' && (
        <div style={{ marginTop: 8 }}>
          <h4 style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 6 }}>Sub-process detail</h4>
          {node.childProcessId ? (
            <button className="btn" onClick={() => nav(`/editor/${node.childProcessId}`)}>Open detailed map ⤵</button>
          ) : (
            <p className="muted">Double-click this node on the canvas to create its detailed child process.</p>
          )}
        </div>
      )}
    </div>
  );
}

function EdgeProps({ edge, map, setMap, select }) {
  const set = (k) => (v) =>
    setMap((m) => ({ ...m, edges: m.edges.map((e) => (e.id === edge.id ? { ...e, [k]: v } : e)) }));
  const name = (id) => map.nodes.find((n) => n.id === id)?.label || id;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3>Connection</h3>
        <button
          className="btn sm danger"
          onClick={() => {
            setMap((m) => ({ ...m, edges: m.edges.filter((e) => e.id !== edge.id) }));
            select(null);
          }}
        >
          Delete
        </button>
      </div>
      <p className="muted" style={{ marginBottom: 10 }}>
        {name(edge.source)} → {name(edge.target)}
      </p>
      <TextField label="Label" value={edge.label} onChange={set('label')} />
      <TextField label="Condition / business rule" value={edge.condition} onChange={set('condition')} />
      <SelectField label="Kind" value={edge.kind} onChange={set('kind')} options={EDGE_KINDS.map((k) => ({ value: k, label: k }))} />
    </div>
  );
}

function LaneProps({ lane, map, setMap, select }) {
  const set = (k) => (v) =>
    setMap((m) => ({ ...m, lanes: m.lanes.map((l) => (l.id === lane.id ? { ...l, [k]: v } : l)) }));
  const others = map.lanes.filter((l) => l.id !== lane.id);
  const nodesIn = map.nodes.filter((n) => n.laneId === lane.id);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3>Swimlane</h3>
        <button
          className="btn sm danger"
          onClick={() => {
            if (!window.confirm(`Delete swimlane "${lane.name}"? Its ${nodesIn.length} activities keep their place without a lane.`)) return;
            setMap((m) => applyOperations(m, [{ op: 'remove_lane', id: lane.id }]).map);
            select(null);
          }}
        >
          Delete
        </button>
      </div>
      <TextField label="Name" value={lane.name} onChange={set('name')} />
      <SelectField label="Represents" value={lane.kind} onChange={set('kind')} options={LANE_KINDS.map((k) => ({ value: k, label: k }))} />
      <NumField label="Minimum height (px)" value={lane.height} onChange={(v) => set('height')(v || 180)} />
      <Field label="Colour">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="color" value={lane.color || '#f7f9fc'} onChange={(e) => set('color')(e.target.value)} aria-label="Lane colour" />
          {lane.color && <button className="btn sm" onClick={() => set('color')('')}>Reset</button>}
        </div>
      </Field>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className="btn sm" onClick={() => set('collapsed')(!lane.collapsed)}>
          {lane.collapsed ? 'Expand' : 'Collapse'}
        </button>
        <button className="btn sm" onClick={() => set('locked')(!lane.locked)}>
          {lane.locked ? 'Unlock' : 'Lock'}
        </button>
      </div>
      {others.length > 0 && (
        <Field label="Merge with…">
          <select
            className="input"
            value=""
            onChange={(e) => {
              if (!e.target.value) return;
              const other = others.find((l) => l.id === e.target.value);
              setMap((m) => applyOperations(m, [{ op: 'merge_lanes', laneIds: [lane.id, other.id], name: lane.name }]).map);
            }}
          >
            <option value="">Choose a lane to merge into this one</option>
            {others.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </Field>
      )}
      {nodesIn.length >= 2 && (
        <button
          className="btn sm"
          onClick={() => {
            const half = Math.ceil(nodesIn.length / 2);
            setMap((m) =>
              applyOperations(m, [
                {
                  op: 'split_lane',
                  id: lane.id,
                  newLanes: [
                    { name: `${lane.name} A`, nodeIds: nodesIn.slice(0, half).map((n) => n.id) },
                    { name: `${lane.name} B`, nodeIds: nodesIn.slice(half).map((n) => n.id) },
                  ],
                },
              ]).map
            );
            select(null);
          }}
        >
          Split into two lanes
        </button>
      )}
      <p className="muted" style={{ marginTop: 10 }}>{nodesIn.length} activities in this lane.</p>
    </div>
  );
}

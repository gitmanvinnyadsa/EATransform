/**
 * Export a process map to BPMN 2.0 XML with BPMNDI diagram interchange,
 * including lanes, so the file opens in Camunda Modeler, bpmn.io, Signavio
 * and other BPMN 2.0-compliant tools.
 */
import { layoutMap, NODE_W, NODE_H } from '../layout.js';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function bpmnId(id) {
  const clean = id.replace(/[^a-zA-Z0-9_.-]/g, '_');
  return /^[a-zA-Z_]/.test(clean) ? clean : `id_${clean}`;
}

function elementTag(node) {
  switch (node.type) {
    case 'start':
      return 'startEvent';
    case 'end':
      return 'endEvent';
    case 'decision':
      return 'exclusiveGateway';
    case 'subprocess':
      return 'subProcess';
    case 'approval':
      return 'userTask';
    case 'document':
      return 'task';
    case 'event':
      return 'intermediateCatchEvent';
    case 'wait':
      return 'intermediateCatchEvent';
    case 'milestone':
      return 'intermediateThrowEvent';
    default:
      return 'task';
  }
}

export function toBpmnXml(map) {
  const layout = layoutMap(map);
  const procId = 'Process_1';
  const nodeXml = [];
  const laneXml = [];
  const shapes = [];
  const edgesXml = [];
  const edgeShapes = [];

  const lanes = [...(map.lanes || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (lanes.length > 0) {
    const laneSetChildren = lanes
      .map((lane) => {
        const refs = map.nodes
          .filter((n) => n.laneId === lane.id)
          .map((n) => `        <bpmn:flowNodeRef>${bpmnId(n.id)}</bpmn:flowNodeRef>`)
          .join('\n');
        return `      <bpmn:lane id="${bpmnId(lane.id)}" name="${esc(lane.name)}">\n${refs}\n      </bpmn:lane>`;
      })
      .join('\n');
    laneXml.push(`    <bpmn:laneSet id="LaneSet_1">\n${laneSetChildren}\n    </bpmn:laneSet>`);
  }

  for (const n of map.nodes) {
    const tag = elementTag(n);
    const incoming = (map.edges || []).filter((e) => e.target === n.id);
    const outgoing = (map.edges || []).filter((e) => e.source === n.id);
    const flows = [
      ...incoming.map((e) => `      <bpmn:incoming>${bpmnId(e.id)}</bpmn:incoming>`),
      ...outgoing.map((e) => `      <bpmn:outgoing>${bpmnId(e.id)}</bpmn:outgoing>`),
    ].join('\n');
    const doc = n.description
      ? `      <bpmn:documentation>${esc(n.description)}</bpmn:documentation>\n`
      : '';
    nodeXml.push(
      `    <bpmn:${tag} id="${bpmnId(n.id)}" name="${esc(n.label)}">\n${doc}${flows}\n    </bpmn:${tag}>`
    );
    const pos = layout.positions.get(n.id) || { x: 0, y: 0 };
    const isEvent = ['start', 'end', 'event', 'wait', 'milestone'].includes(n.type);
    const isGateway = n.type === 'decision';
    const w = isEvent ? 36 : isGateway ? 50 : NODE_W;
    const h = isEvent ? 36 : isGateway ? 50 : NODE_H;
    const cx = pos.x + NODE_W / 2 - w / 2;
    const cy = pos.y + NODE_H / 2 - h / 2;
    shapes.push(
      `      <bpmndi:BPMNShape id="${bpmnId(n.id)}_di" bpmnElement="${bpmnId(n.id)}">\n` +
        `        <dc:Bounds x="${Math.round(cx)}" y="${Math.round(cy)}" width="${w}" height="${h}" />\n` +
        `      </bpmndi:BPMNShape>`
    );
  }

  for (const lane of lanes) {
    const g = layout.laneGeom.find((l) => l.id === lane.id);
    if (!g) continue;
    shapes.push(
      `      <bpmndi:BPMNShape id="${bpmnId(lane.id)}_di" bpmnElement="${bpmnId(lane.id)}" isHorizontal="true">\n` +
        `        <dc:Bounds x="40" y="${Math.round(g.y)}" width="${Math.round(layout.width - 80)}" height="${Math.round(g.height)}" />\n` +
        `      </bpmndi:BPMNShape>`
    );
  }

  for (const e of map.edges || []) {
    const cond = e.condition
      ? `\n      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">${esc(e.condition)}</bpmn:conditionExpression>`
      : '';
    edgesXml.push(
      `    <bpmn:sequenceFlow id="${bpmnId(e.id)}" name="${esc(e.label)}" sourceRef="${bpmnId(e.source)}" targetRef="${bpmnId(e.target)}">${cond}\n    </bpmn:sequenceFlow>`
    );
    const s = layout.positions.get(e.source) || { x: 0, y: 0 };
    const t = layout.positions.get(e.target) || { x: 0, y: 0 };
    edgeShapes.push(
      `      <bpmndi:BPMNEdge id="${bpmnId(e.id)}_di" bpmnElement="${bpmnId(e.id)}">\n` +
        `        <di:waypoint x="${Math.round(s.x + NODE_W)}" y="${Math.round(s.y + NODE_H / 2)}" />\n` +
        `        <di:waypoint x="${Math.round(t.x)}" y="${Math.round(t.y + NODE_H / 2)}" />\n` +
        `      </bpmndi:BPMNEdge>`
    );
  }

  const documentation = [map.purpose, map.objective].filter(Boolean).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
    xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
    xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
    xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    id="Definitions_1" targetNamespace="http://eatransform.app/bpmn"
    exporter="EATransform" exporterVersion="1.0">
  <bpmn:process id="${procId}" name="${esc(map.name)}" isExecutable="false">
${documentation ? `    <bpmn:documentation>${esc(documentation)}</bpmn:documentation>\n` : ''}${laneXml.join('\n')}
${nodeXml.join('\n')}
${edgesXml.join('\n')}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${procId}">
${shapes.join('\n')}
${edgeShapes.join('\n')}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`;
}

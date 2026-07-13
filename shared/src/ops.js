/**
 * Surgical edit operations on a process map.
 *
 * The AI editing endpoint asks the model for a list of these operations
 * instead of a full regenerated map, so user edits elsewhere in the map are
 * preserved and only the relevant sections change. The same operations back
 * several UI actions (merge/split lanes, etc.).
 */
import { z } from 'zod';
import { NodeSchema, EdgeSchema, LaneSchema, genId } from './schema.js';

const id = z.string().min(1);

export const OperationSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('add_node'),
    node: NodeSchema.partial().extend({ label: z.string().min(1), type: NodeSchema.shape.type }),
    // Optional insertion point: splice the node into an existing edge.
    betweenSource: id.optional().nullable(),
    betweenTarget: id.optional().nullable(),
    afterNodeId: id.optional().nullable(),
  }),
  z.object({ op: z.literal('update_node'), id, changes: NodeSchema.partial() }),
  z.object({ op: z.literal('remove_node'), id, reconnect: z.boolean().optional().default(true) }),
  z.object({ op: z.literal('add_edge'), edge: EdgeSchema.partial().extend({ source: id, target: id }) }),
  z.object({ op: z.literal('update_edge'), id, changes: EdgeSchema.partial() }),
  z.object({ op: z.literal('remove_edge'), id }),
  z.object({ op: z.literal('add_lane'), lane: LaneSchema.partial().extend({ name: z.string().min(1) }) }),
  z.object({ op: z.literal('update_lane'), id, changes: LaneSchema.partial() }),
  z.object({ op: z.literal('remove_lane'), id, moveNodesToLaneId: id.optional().nullable() }),
  z.object({ op: z.literal('reorder_lanes'), order: z.array(id).min(1) }),
  z.object({ op: z.literal('merge_lanes'), laneIds: z.array(id).min(2), name: z.string().min(1) }),
  z.object({
    op: z.literal('split_lane'),
    id,
    newLanes: z.array(z.object({ name: z.string().min(1), nodeIds: z.array(id) })).min(2),
  }),
  z.object({ op: z.literal('move_node_to_lane'), id, laneId: id.nullable() }),
  z.object({
    op: z.literal('update_process'),
    changes: z
      .object({
        name: z.string().optional(),
        purpose: z.string().optional(),
        objective: z.string().optional(),
        scope: z.string().optional(),
        owner: z.string().optional(),
        type: z.string().optional(),
        stakeholders: z.array(z.string()).optional(),
        departments: z.array(z.string()).optional(),
        kpis: z.array(z.any()).optional(),
        risks: z.array(z.any()).optional(),
        dependencies: z.array(z.string()).optional(),
        compliance: z.array(z.string()).optional(),
      })
      .passthrough(),
  }),
]);

export const OperationListSchema = z.array(OperationSchema);

/**
 * Apply operations to a copy of the map.
 * Returns { map, applied: string[], errors: string[] }.
 * Operations that reference missing ids are skipped with an error recorded —
 * one bad operation never corrupts the map.
 */
export function applyOperations(map, operations) {
  const out = JSON.parse(JSON.stringify(map));
  const applied = [];
  const errors = [];
  const findNode = (nid) => out.nodes.find((n) => n.id === nid);
  const findLane = (lid) => out.lanes.find((l) => l.id === lid);

  for (const raw of operations) {
    const parsed = OperationSchema.safeParse(raw);
    if (!parsed.success) {
      errors.push(`Invalid operation ${JSON.stringify(raw?.op ?? raw)}: ${parsed.error.issues[0]?.message}`);
      continue;
    }
    const op = parsed.data;
    try {
      switch (op.op) {
        case 'add_node': {
          const node = NodeSchema.parse({ id: genId('n'), ...op.node, position: op.node.position ?? null });
          if (findNode(node.id)) node.id = genId('n');
          if (node.laneId && !findLane(node.laneId)) node.laneId = out.lanes[0]?.id ?? null;
          out.nodes.push(node);
          if (op.betweenSource && op.betweenTarget) {
            const edge = out.edges.find((e) => e.source === op.betweenSource && e.target === op.betweenTarget);
            if (edge) {
              out.edges.push(
                EdgeSchema.parse({ id: genId('e'), source: node.id, target: edge.target, kind: edge.kind })
              );
              edge.target = node.id;
            } else if (findNode(op.betweenSource) && findNode(op.betweenTarget)) {
              out.edges.push(EdgeSchema.parse({ id: genId('e'), source: op.betweenSource, target: node.id }));
              out.edges.push(EdgeSchema.parse({ id: genId('e'), source: node.id, target: op.betweenTarget }));
            }
          } else if (op.afterNodeId && findNode(op.afterNodeId)) {
            const outgoing = out.edges.filter((e) => e.source === op.afterNodeId);
            for (const e of outgoing) {
              out.edges.push(EdgeSchema.parse({ id: genId('e'), source: node.id, target: e.target, label: e.label, kind: e.kind }));
            }
            out.edges = out.edges.filter((e) => !outgoing.includes(e));
            out.edges.push(EdgeSchema.parse({ id: genId('e'), source: op.afterNodeId, target: node.id }));
          }
          applied.push(`Added ${node.type} "${node.label}"`);
          break;
        }
        case 'update_node': {
          const node = findNode(op.id);
          if (!node) throw new Error(`node "${op.id}" not found`);
          const merged = NodeSchema.parse({ ...node, ...op.changes, id: node.id });
          Object.assign(node, merged);
          applied.push(`Updated "${node.label}"`);
          break;
        }
        case 'remove_node': {
          const node = findNode(op.id);
          if (!node) throw new Error(`node "${op.id}" not found`);
          const incoming = out.edges.filter((e) => e.target === op.id);
          const outgoing = out.edges.filter((e) => e.source === op.id);
          out.edges = out.edges.filter((e) => e.source !== op.id && e.target !== op.id);
          if (op.reconnect) {
            for (const i of incoming) {
              for (const o of outgoing) {
                if (i.source !== o.target && !out.edges.some((e) => e.source === i.source && e.target === o.target)) {
                  out.edges.push(EdgeSchema.parse({ id: genId('e'), source: i.source, target: o.target, kind: i.kind }));
                }
              }
            }
          }
          out.nodes = out.nodes.filter((n) => n.id !== op.id);
          applied.push(`Removed "${node.label}"`);
          break;
        }
        case 'add_edge': {
          if (!findNode(op.edge.source)) throw new Error(`source "${op.edge.source}" not found`);
          if (!findNode(op.edge.target)) throw new Error(`target "${op.edge.target}" not found`);
          out.edges.push(EdgeSchema.parse({ id: genId('e'), ...op.edge }));
          applied.push('Added connection');
          break;
        }
        case 'update_edge': {
          const edge = out.edges.find((e) => e.id === op.id);
          if (!edge) throw new Error(`edge "${op.id}" not found`);
          Object.assign(edge, EdgeSchema.parse({ ...edge, ...op.changes, id: edge.id }));
          applied.push('Updated connection');
          break;
        }
        case 'remove_edge': {
          const before = out.edges.length;
          out.edges = out.edges.filter((e) => e.id !== op.id);
          if (out.edges.length === before) throw new Error(`edge "${op.id}" not found`);
          applied.push('Removed connection');
          break;
        }
        case 'add_lane': {
          const lane = LaneSchema.parse({ id: genId('lane'), order: out.lanes.length, ...op.lane });
          if (findLane(lane.id)) lane.id = genId('lane');
          out.lanes.push(lane);
          applied.push(`Added swimlane "${lane.name}"`);
          break;
        }
        case 'update_lane': {
          const lane = findLane(op.id);
          if (!lane) throw new Error(`lane "${op.id}" not found`);
          Object.assign(lane, LaneSchema.parse({ ...lane, ...op.changes, id: lane.id }));
          applied.push(`Updated swimlane "${lane.name}"`);
          break;
        }
        case 'remove_lane': {
          const lane = findLane(op.id);
          if (!lane) throw new Error(`lane "${op.id}" not found`);
          const fallback = op.moveNodesToLaneId && findLane(op.moveNodesToLaneId) ? op.moveNodesToLaneId : null;
          for (const n of out.nodes) if (n.laneId === op.id) n.laneId = fallback;
          out.lanes = out.lanes.filter((l) => l.id !== op.id);
          applied.push(`Removed swimlane "${lane.name}"`);
          break;
        }
        case 'reorder_lanes': {
          out.lanes.forEach((l) => {
            const idx = op.order.indexOf(l.id);
            l.order = idx === -1 ? op.order.length + (l.order ?? 0) : idx;
          });
          out.lanes.sort((a, b) => a.order - b.order);
          applied.push('Reordered swimlanes');
          break;
        }
        case 'merge_lanes': {
          const lanesToMerge = op.laneIds.map(findLane).filter(Boolean);
          if (lanesToMerge.length < 2) throw new Error('merge_lanes needs at least two existing lanes');
          const keep = lanesToMerge[0];
          keep.name = op.name;
          const dropIds = lanesToMerge.slice(1).map((l) => l.id);
          for (const n of out.nodes) if (dropIds.includes(n.laneId)) n.laneId = keep.id;
          out.lanes = out.lanes.filter((l) => !dropIds.includes(l.id));
          applied.push(`Merged ${lanesToMerge.length} swimlanes into "${op.name}"`);
          break;
        }
        case 'split_lane': {
          const lane = findLane(op.id);
          if (!lane) throw new Error(`lane "${op.id}" not found`);
          const baseOrder = lane.order ?? 0;
          const created = op.newLanes.map((nl, i) =>
            LaneSchema.parse({ id: genId('lane'), name: nl.name, kind: lane.kind, order: baseOrder + i })
          );
          for (const l of out.lanes) if ((l.order ?? 0) > baseOrder) l.order += created.length - 1;
          for (let i = 0; i < op.newLanes.length; i++) {
            for (const nid of op.newLanes[i].nodeIds) {
              const n = findNode(nid);
              if (n) n.laneId = created[i].id;
            }
          }
          // remaining nodes of the old lane go to the first new lane
          for (const n of out.nodes) if (n.laneId === lane.id) n.laneId = created[0].id;
          out.lanes = out.lanes.filter((l) => l.id !== lane.id).concat(created);
          out.lanes.sort((a, b) => a.order - b.order);
          applied.push(`Split swimlane "${lane.name}" into ${created.length}`);
          break;
        }
        case 'move_node_to_lane': {
          const node = findNode(op.id);
          if (!node) throw new Error(`node "${op.id}" not found`);
          if (op.laneId && !findLane(op.laneId)) throw new Error(`lane "${op.laneId}" not found`);
          node.laneId = op.laneId;
          node.position = null; // let auto-layout reposition it
          applied.push(`Moved "${node.label}" to another swimlane`);
          break;
        }
        case 'update_process': {
          const allowed = [
            'name', 'purpose', 'objective', 'scope', 'owner', 'type',
            'stakeholders', 'departments', 'kpis', 'risks', 'dependencies', 'compliance',
          ];
          for (const k of allowed) {
            if (op.changes[k] !== undefined) out[k] = op.changes[k];
          }
          applied.push('Updated process information');
          break;
        }
        default:
          errors.push(`Unknown operation`);
      }
    } catch (err) {
      errors.push(`${op.op}: ${err.message}`);
    }
  }
  return { map: out, applied, errors };
}

import React, { useCallback, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import { useNavigate } from 'react-router-dom';
import { genId } from '@eatransform/shared';
import { deriveView, laneAtY, NODE_W, NODE_H } from '../lib/mapView.js';
import { useEditorStore } from '../store.js';
import LaneNode from './nodes/LaneNode.jsx';
import ProcNode from './nodes/ProcNode.jsx';
import { api } from '../api.js';

const nodeTypes = { lane: LaneNode, proc: ProcNode };

function CanvasInner({ highlight }) {
  const map = useEditorStore((s) => s.map);
  const setMap = useEditorStore((s) => s.setMap);
  const select = useEditorStore((s) => s.select);
  const toast = useEditorStore((s) => s.toast);
  const processMeta = useEditorStore((s) => s.processMeta);
  const load = useEditorStore((s) => s.load);
  const nav = useNavigate();
  const { screenToFlowPosition } = useReactFlow();
  const wrapRef = useRef(null);

  const view = useMemo(() => deriveView(map, { highlight }), [map, highlight]);

  const onNodeDragStop = useCallback(
    (evt, rfNode) => {
      if (rfNode.type !== 'proc') return;
      const cy = rfNode.position.y + NODE_H / 2;
      const laneId = laneAtY(view.bands, cy);
      const band = view.bands.find((b) => (b.id === '__none__' ? laneId === null : b.id === laneId));
      if (band?.locked) {
        toast(`Swimlane "${band.name}" is locked.`, 'error');
        setMap((m) => ({ ...m })); // re-render snaps node back
        return;
      }
      setMap((m) => ({
        ...m,
        nodes: m.nodes.map((n) =>
          n.id === rfNode.id ? { ...n, position: { x: rfNode.position.x, y: rfNode.position.y }, laneId } : n
        ),
      }));
    },
    [setMap, view.bands, toast]
  );

  const onConnect = useCallback(
    (conn) => {
      if (!conn.source || !conn.target || conn.source === conn.target) return;
      setMap((m) => {
        if (m.edges.some((e) => e.source === conn.source && e.target === conn.target)) return m;
        return {
          ...m,
          edges: [...m.edges, { id: genId('e'), source: conn.source, target: conn.target, label: '', condition: '', kind: 'sequence' }],
        };
      });
    },
    [setMap]
  );

  const onSelectionChange = useCallback(
    ({ nodes, edges }) => {
      const n = nodes[0];
      const e = edges[0];
      if (n?.type === 'proc') select({ kind: 'node', id: n.id });
      else if (n?.type === 'lane') select({ kind: 'lane', id: n.id.slice(5) });
      else if (e) select({ kind: 'edge', id: e.id });
      else select(null);
    },
    [select]
  );

  const onNodesDelete = useCallback(
    (deleted) => {
      const ids = new Set(deleted.filter((d) => d.type === 'proc').map((d) => d.id));
      if (ids.size === 0) return;
      setMap((m) => ({
        ...m,
        nodes: m.nodes.filter((n) => !ids.has(n.id)),
        edges: m.edges.filter((e) => !ids.has(e.source) && !ids.has(e.target)),
      }));
    },
    [setMap]
  );

  const onEdgesDelete = useCallback(
    (deleted) => {
      const ids = new Set(deleted.map((d) => d.id));
      setMap((m) => ({ ...m, edges: m.edges.filter((e) => !ids.has(e.id)) }));
    },
    [setMap]
  );

  const onDrop = useCallback(
    (evt) => {
      evt.preventDefault();
      const type = evt.dataTransfer.getData('application/eatransform-node');
      if (!type) return;
      const p = screenToFlowPosition({ x: evt.clientX, y: evt.clientY });
      const position = { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2 };
      const laneId = laneAtY(view.bands, p.y);
      const id = genId('n');
      setMap((m) => ({
        ...m,
        nodes: [
          ...m.nodes,
          {
            id,
            type,
            label:
              type === 'start' ? 'Start' : type === 'end' ? 'End' : type === 'decision' ? 'Decision?' : `New ${type}`,
            laneId,
            position,
          },
        ],
      }));
      select({ kind: 'node', id });
    },
    [screenToFlowPosition, setMap, view.bands, select]
  );

  const onNodeDoubleClick = useCallback(
    async (evt, rfNode) => {
      if (rfNode.type !== 'proc') return;
      const node = map.nodes.find((n) => n.id === rfNode.id);
      if (!node || node.type !== 'subprocess') return;
      if (node.childProcessId) {
        nav(`/editor/${node.childProcessId}`);
        return;
      }
      try {
        const child = await api.createProcess({
          projectId: processMeta.projectId,
          parentId: processMeta.id,
          name: node.label,
          level: Math.min(4, (map.level ?? 1) + 1),
        });
        setMap((m) => ({
          ...m,
          nodes: m.nodes.map((n) => (n.id === node.id ? { ...n, childProcessId: child.id } : n)),
        }));
        await useEditorStore.getState().saveNow();
        nav(`/editor/${child.id}`);
      } catch (e) {
        toast(e.message, 'error');
      }
    },
    [map, processMeta, nav, setMap, toast, load]
  );

  return (
    <div ref={wrapRef} style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={view.rfNodes}
        edges={view.rfEdges}
        nodeTypes={nodeTypes}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onNodeDoubleClick={onNodeDoubleClick}
        onDrop={onDrop}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }}
        fitView
        minZoom={0.05}
        maxZoom={2.5}
        snapToGrid
        snapGrid={[10, 10]}
        deleteKeyCode={['Delete', 'Backspace']}
        proOptions={{ hideAttribution: true }}
        onlyRenderVisibleElements
      >
        <Background gap={20} color="#d8dfea" />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => (n.type === 'lane' ? '#e6ecf5' : '#8fa5c8')}
          style={{ width: 180, height: 120 }}
        />
      </ReactFlow>
    </div>
  );
}

export default function Canvas(props) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { NODE_TYPES } from '@eatransform/shared';
import { useEditorStore } from '../store.js';
import { api } from '../api.js';
import Canvas from '../components/Canvas.jsx';
import PropertiesPanel from '../components/panels/PropertiesPanel.jsx';
import AiPanel from '../components/panels/AiPanel.jsx';
import InsightsPanel from '../components/panels/InsightsPanel.jsx';
import VersionsPanel from '../components/panels/VersionsPanel.jsx';
import ExportPanel from '../components/panels/ExportPanel.jsx';

const PALETTE = [
  { type: 'start', label: 'Start' },
  { type: 'task', label: 'Task / Activity' },
  { type: 'decision', label: 'Decision' },
  { type: 'approval', label: 'Approval' },
  { type: 'subprocess', label: 'Sub-process' },
  { type: 'document', label: 'Document' },
  { type: 'event', label: 'Event' },
  { type: 'wait', label: 'Wait / Delay' },
  { type: 'milestone', label: 'Milestone' },
  { type: 'end', label: 'End' },
];

const TABS = ['Properties', 'AI Assistant', 'Insights', 'Versions', 'Export'];

export default function EditorPage() {
  const { processId } = useParams();
  const nav = useNavigate();
  const map = useEditorStore((s) => s.map);
  const processMeta = useEditorStore((s) => s.processMeta);
  const saveState = useEditorStore((s) => s.saveState);
  const load = useEditorStore((s) => s.load);
  const setMap = useEditorStore((s) => s.setMap);
  const adoptServerMap = useEditorStore((s) => s.adoptServerMap);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const saveNow = useEditorStore((s) => s.saveNow);
  const select = useEditorStore((s) => s.select);
  const toast = useEditorStore((s) => s.toast);
  const selection = useEditorStore((s) => s.selection);

  const [tab, setTab] = useState('Properties');
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [breadcrumb, setBreadcrumb] = useState([]);
  const [highlight, setHighlight] = useState(new Set());

  useEffect(() => {
    setError(null);
    load(processId).catch((e) => setError(e.message));
  }, [processId, load]);

  // When the AI/properties selection changes, show the right tab.
  useEffect(() => {
    if (selection) setTab('Properties');
  }, [selection?.id, selection?.kind]);

  // Build breadcrumb chain (project + parents).
  useEffect(() => {
    let cancelled = false;
    async function build() {
      if (!processMeta) return;
      const chain = [];
      let cur = processMeta;
      let guard = 0;
      while (cur?.parentId && guard++ < 6) {
        try {
          cur = await api.getProcess(cur.parentId);
          chain.unshift({ id: cur.id, name: cur.name });
        } catch {
          break;
        }
      }
      if (!cancelled) setBreadcrumb(chain);
    }
    build();
    return () => {
      cancelled = true;
    };
  }, [processMeta]);

  // Keyboard shortcuts.
  useEffect(() => {
    function onKey(e) {
      const inField = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !inField) {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !inField) {
        e.preventDefault();
        redo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveNow({ snapshot: true, versionLabel: 'Manual save' });
        toast('Saved.');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, saveNow, toast]);

  // Flush pending changes when leaving the page.
  useEffect(() => {
    const flush = () => {
      const st = useEditorStore.getState();
      if (st.saveState === 'dirty' && st.processId && st.map) {
        navigator.sendBeacon?.(
          `/api/processes/${st.processId}/map?snapshot=0`,
          new Blob([JSON.stringify({ map: st.map })], { type: 'application/json' })
        );
      }
    };
    window.addEventListener('beforeunload', flush);
    return () => {
      flush();
      window.removeEventListener('beforeunload', flush);
    };
  }, [processId]);

  const searchMatches = useMemo(() => {
    if (!map || !search.trim()) return new Set();
    const q = search.toLowerCase();
    return new Set(
      map.nodes
        .filter(
          (n) =>
            n.label.toLowerCase().includes(q) ||
            (n.description || '').toLowerCase().includes(q) ||
            (n.owner || '').toLowerCase().includes(q)
        )
        .map((n) => n.id)
    );
  }, [map, search]);

  const effectiveHighlight = search.trim() ? searchMatches : highlight;

  const doAutoLayout = useCallback(async () => {
    try {
      await saveNow();
      const res = await api.autoLayout(processId);
      adoptServerMap(res.map);
      toast('Auto-layout applied.');
    } catch (e) {
      toast(e.message, 'error');
    }
  }, [processId, saveNow, adoptServerMap, toast]);

  if (error) {
    return (
      <div className="workspace">
        <div className="dash">
          <div className="card" style={{ padding: 24 }}>
            <h3>Could not open process</h3>
            <p className="muted">{error}</p>
            <Link to="/">Back to dashboard</Link>
          </div>
        </div>
      </div>
    );
  }
  if (!map) {
    return (
      <div className="workspace" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div><span className="spinner" /> Loading process…</div>
      </div>
    );
  }

  const counts = { nodes: map.nodes.length, edges: map.edges.length, lanes: map.lanes.length };

  return (
    <div className="workspace">
      <div className="editor-topbar">
        <div className="breadcrumbs">
          <Link to="/">Dashboard</Link>
          <span>/</span>
          {processMeta && <Link to={`/projects/${processMeta.projectId}`}>Project</Link>}
          {breadcrumb.map((b) => (
            <React.Fragment key={b.id}>
              <span>/</span>
              <Link to={`/editor/${b.id}`}>{b.name}</Link>
            </React.Fragment>
          ))}
          <span>/</span>
        </div>
        <input
          className="title-input"
          value={map.name}
          onChange={(e) => setMap((m) => ({ ...m, name: e.target.value }))}
          aria-label="Process name"
        />
        <span className="badge gray">Level {map.level ?? 1}</span>
        <div style={{ flex: 1 }} />
        <input
          className="input"
          style={{ width: 180 }}
          placeholder="🔍 Find activity…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search activities"
        />
        <button className="btn sm" onClick={undo} title="Undo (Ctrl+Z)">↶ Undo</button>
        <button className="btn sm" onClick={redo} title="Redo (Ctrl+Shift+Z)">↷ Redo</button>
        <button className="btn sm" onClick={doAutoLayout}>Auto-layout</button>
        <span className="save-state" role="status">
          {saveState === 'saved' ? '✓ Saved' : saveState === 'saving' ? 'Saving…' : saveState === 'error' ? '⚠ Save failed' : '● Unsaved'}
        </span>
      </div>

      <div className="workspace-body">
        <aside className="left-rail" aria-label="Shape palette">
          <h4>Drag onto canvas</h4>
          {PALETTE.map((p) => (
            <div
              key={p.type}
              className="palette-item"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/eatransform-node', p.type);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              title={`Drag to add a ${p.label}`}
            >
              <span className={`shape ${p.type}`} />
              {p.label}
            </div>
          ))}
          <h4>Tips</h4>
          <p className="muted" style={{ lineHeight: 1.5 }}>
            Drag between node handles to connect. Double-click a sub-process to drill down. Select a
            lane to rename, merge, split, lock or collapse it. Delete removes the selection.
          </p>
        </aside>

        <main className="canvas-wrap">
          <Canvas highlight={effectiveHighlight} />
        </main>

        <aside className="right-panel" aria-label="Details panel">
          <div className="right-tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
                {t === 'AI Assistant' ? '✦ AI' : t}
              </button>
            ))}
          </div>
          <div className="right-body">
            {tab === 'Properties' && <PropertiesPanel />}
            {tab === 'AI Assistant' && (
              <AiPanel
                processId={processId}
                projectId={processMeta?.projectId}
                onHighlight={(ids) => {
                  setHighlight(new Set(ids));
                  setSearch('');
                }}
              />
            )}
            {tab === 'Insights' && (
              <InsightsPanel processId={processId} onHighlight={(ids) => setHighlight(new Set(ids))} />
            )}
            {tab === 'Versions' && <VersionsPanel processId={processId} />}
            {tab === 'Export' && <ExportPanel processId={processId} />}
          </div>
        </aside>
      </div>

      <div className="bottombar">
        <span>{counts.nodes} activities</span>
        <span>{counts.edges} connections</span>
        <span>{counts.lanes} swimlanes</span>
        {effectiveHighlight.size > 0 && (
          <span>
            {effectiveHighlight.size} highlighted{' '}
            <button className="btn sm ghost" onClick={() => { setHighlight(new Set()); setSearch(''); }}>clear</button>
          </span>
        )}
        <span style={{ flex: 1 }} />
        <span className="muted">Ctrl+Z undo · Ctrl+S snapshot · Del removes selection</span>
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import TopNav from '../components/TopNav.jsx';
import AiIntake from '../components/AiIntake.jsx';
import DocumentsPanel from '../components/DocumentsPanel.jsx';
import { api } from '../api.js';
import { useEditorStore } from '../store.js';

export default function ProjectPage() {
  const { projectId } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const toast = useEditorStore((s) => s.toast);
  const [project, setProject] = useState(null);
  const [error, setError] = useState(null);
  const [showAi, setShowAi] = useState(params.get('ai') === '1');
  const [query, setQuery] = useState('');

  const refresh = () =>
    api
      .getProject(projectId)
      .then(setProject)
      .catch((e) => setError(e.message));
  useEffect(() => {
    refresh();
  }, [projectId]);

  const tree = useMemo(() => {
    if (!project) return [];
    const list = project.processes.filter(
      (p) => !query || p.name.toLowerCase().includes(query.toLowerCase())
    );
    const roots = list.filter((p) => !p.parentId || !list.some((x) => x.id === p.parentId));
    const childrenOf = (id) => list.filter((p) => p.parentId === id);
    const walk = (p, depth) => [{ ...p, depth }, ...childrenOf(p.id).flatMap((c) => walk(c, depth + 1))];
    return roots.flatMap((r) => walk(r, 0));
  }, [project, query]);

  async function addBlank() {
    try {
      const proc = await api.createProcess({ projectId, name: 'Untitled process' });
      nav(`/editor/${proc.id}`);
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function removeProcess(id, name) {
    if (!window.confirm(`Delete process "${name}"? Its version history is removed too.`)) return;
    try {
      await api.deleteProcess(id);
      refresh();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function removeProject() {
    if (!window.confirm(`Delete project "${project.name}" and all its processes?`)) return;
    try {
      await api.deleteProject(projectId);
      nav('/');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  if (error)
    return (
      <div>
        <TopNav />
        <div className="dash">
          <div className="card" style={{ padding: 24 }}>
            <h3>Could not load project</h3>
            <p className="muted">{error}</p>
            <Link to="/">Back to dashboard</Link>
          </div>
        </div>
      </div>
    );
  if (!project)
    return (
      <div>
        <TopNav />
        <div className="dash"><span className="spinner" /> Loading…</div>
      </div>
    );

  return (
    <div>
      <TopNav />
      <div className="dash">
        <div className="breadcrumbs" style={{ marginBottom: 8 }}>
          <Link to="/">Dashboard</Link> <span>/</span> <span>{project.name}</span>
        </div>
        <div className="dash-head">
          <div>
            <h1 style={{ fontSize: 22 }}>{project.name}</h1>
            <div className="muted">{project.description || ''}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={addBlank}>+ Blank process</button>
            <button className="btn primary" onClick={() => setShowAi(true)}>✦ Create with AI</button>
            <button className="btn danger" onClick={removeProject}>Delete project</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: showAi ? '1fr 440px' : '1fr', gap: 20, alignItems: 'start' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <h3 style={{ fontSize: 15 }}>Processes</h3>
              <input className="input" style={{ width: 220 }} placeholder="Search processes…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search processes" />
            </div>
            {tree.length === 0 ? (
              <div className="card" style={{ padding: 24, textAlign: 'center' }}>
                <p className="muted">No processes yet. Describe your business with “Create with AI”, or start a blank map.</p>
              </div>
            ) : (
              tree.map((p) => (
                <div key={p.id} className="list-row" style={{ marginLeft: p.depth * 24 }}>
                  <div className="grow" role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => nav(`/editor/${p.id}`)} onKeyDown={(e) => e.key === 'Enter' && nav(`/editor/${p.id}`)}>
                    <div className="name">
                      {p.depth > 0 && <span className="muted">↳ </span>}
                      {p.name} <span className="badge gray">L{p.level}</span>
                    </div>
                    <div className="muted">Updated {new Date(p.updatedAt).toLocaleString()}</div>
                  </div>
                  <button className="btn sm" onClick={() => nav(`/editor/${p.id}`)}>Open</button>
                  <button className="btn sm danger" onClick={() => removeProcess(p.id, p.name)}>Delete</button>
                </div>
              ))
            )}

            <div style={{ marginTop: 26 }}>
              <DocumentsPanel projectId={projectId} />
            </div>
          </div>

          {showAi && (
            <div className="card" style={{ padding: 16, position: 'sticky', top: 16, height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <h3 style={{ fontSize: 15 }}>AI Business Analyst</h3>
                <button className="btn sm ghost" onClick={() => setShowAi(false)} aria-label="Close AI panel">✕</button>
              </div>
              <AiIntake
                projectId={projectId}
                onProcessCreated={(processId) => {
                  refresh();
                  nav(`/editor/${processId}`);
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

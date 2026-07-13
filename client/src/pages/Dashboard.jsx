import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import TopNav from '../components/TopNav.jsx';
import { api } from '../api.js';
import { useEditorStore } from '../store.js';

const TEMPLATES = [
  {
    id: 'ai',
    name: 'Start with AI',
    desc: 'Describe your business and objectives — the AI analyst builds the process map with you.',
  },
  {
    id: 'sample',
    name: 'Order fulfilment example',
    desc: 'A complete cross-functional swimlane map for an e-commerce delivery process.',
  },
  {
    id: 'blank',
    name: 'Blank process',
    desc: 'Start from an empty canvas and model the process manually.',
  },
];

export default function Dashboard() {
  const nav = useNavigate();
  const toast = useEditorStore((s) => s.toast);
  const [projects, setProjects] = useState(null);
  const [query, setQuery] = useState('');
  const [folder, setFolder] = useState('');
  const [creating, setCreating] = useState(null); // template id or 'plain'
  const [form, setForm] = useState({ name: '', description: '', folder: '' });
  const [busy, setBusy] = useState(false);

  const refresh = () => api.listProjects().then(setProjects).catch((e) => toast(e.message, 'error'));
  useEffect(() => {
    refresh();
  }, []);

  const folders = useMemo(
    () => [...new Set((projects || []).map((p) => p.folder).filter(Boolean))].sort(),
    [projects]
  );
  const filtered = useMemo(
    () =>
      (projects || []).filter(
        (p) =>
          (!folder || p.folder === folder) &&
          (!query ||
            p.name.toLowerCase().includes(query.toLowerCase()) ||
            (p.description || '').toLowerCase().includes(query.toLowerCase()))
      ),
    [projects, query, folder]
  );

  async function createProject(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      const project = await api.createProject(form);
      if (creating === 'sample') {
        const proc = await api.createProcess({ projectId: project.id, name: 'Order Fulfilment & Delivery', template: 'sample' });
        nav(`/editor/${proc.id}`);
      } else if (creating === 'blank') {
        const proc = await api.createProcess({ projectId: project.id, name: form.name });
        nav(`/editor/${proc.id}`);
      } else if (creating === 'ai') {
        nav(`/projects/${project.id}?ai=1`);
      } else {
        nav(`/projects/${project.id}`);
      }
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <TopNav />
      <div className="dash">
        <h2 style={{ fontSize: 14, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
          Start a new initiative
        </h2>
        <div className="template-strip">
          {TEMPLATES.map((t) => (
            <div
              key={t.id}
              className="card template-card"
              role="button"
              tabIndex={0}
              onClick={() => setCreating(t.id)}
              onKeyDown={(e) => e.key === 'Enter' && setCreating(t.id)}
            >
              <h3 style={{ fontSize: 14, marginBottom: 4 }}>{t.name}</h3>
              <div className="muted">{t.desc}</div>
            </div>
          ))}
        </div>

        <div className="dash-head">
          <h1 style={{ fontSize: 20 }}>Projects</h1>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select className="input" style={{ width: 160 }} value={folder} onChange={(e) => setFolder(e.target.value)} aria-label="Filter by folder">
              <option value="">All folders</option>
              {folders.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
            <input
              className="input"
              style={{ width: 220 }}
              placeholder="Search projects…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search projects"
            />
            <button className="btn primary" onClick={() => setCreating('plain')}>+ New project</button>
          </div>
        </div>

        {projects === null ? (
          <div className="muted"><span className="spinner" /> Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="card" style={{ padding: 32, textAlign: 'center' }}>
            <h3 style={{ marginBottom: 6 }}>No projects yet</h3>
            <p className="muted">Create a project, or pick “Start with AI” above and simply describe your business.</p>
          </div>
        ) : (
          <div className="grid">
            {filtered.map((p) => (
              <div key={p.id} className="card proj-card" role="button" tabIndex={0} onClick={() => nav(`/projects/${p.id}`)} onKeyDown={(e) => e.key === 'Enter' && nav(`/projects/${p.id}`)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <h3>{p.name}</h3>
                  {p.folder && <span className="badge gray">{p.folder}</span>}
                </div>
                <div className="muted" style={{ minHeight: 32 }}>{p.description || 'No description'}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
                  <span className="badge">{p.processCount} process{p.processCount === 1 ? '' : 'es'}</span>
                  <span className="muted">Updated {new Date(p.updatedAt).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {creating && (
        <div className="modal-backdrop" onClick={() => !busy && setCreating(null)}>
          <form className="card modal" onClick={(e) => e.stopPropagation()} onSubmit={createProject}>
            <h2>
              {creating === 'ai'
                ? 'New AI-guided project'
                : creating === 'sample'
                  ? 'New project from example'
                  : 'New project'}
            </h2>
            <label className="field">
              <span>Project name</span>
              <input className="input" autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Delivery delays reduction" required />
            </label>
            <label className="field">
              <span>Description (optional)</span>
              <textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What is this initiative about?" />
            </label>
            <label className="field">
              <span>Folder (optional)</span>
              <input className="input" value={form.folder} onChange={(e) => setForm({ ...form, folder: e.target.value })} placeholder="e.g. Supply Chain" list="folders" />
              <datalist id="folders">{folders.map((f) => <option key={f} value={f} />)}</datalist>
            </label>
            <div className="actions">
              <button type="button" className="btn" onClick={() => setCreating(null)} disabled={busy}>Cancel</button>
              <button type="submit" className="btn primary" disabled={busy || !form.name.trim()}>
                {busy ? 'Creating…' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

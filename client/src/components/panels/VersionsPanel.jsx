import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { useEditorStore } from '../../store.js';

export default function VersionsPanel({ processId }) {
  const adoptServerMap = useEditorStore((s) => s.adoptServerMap);
  const saveNow = useEditorStore((s) => s.saveNow);
  const toast = useEditorStore((s) => s.toast);
  const [versions, setVersions] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => api.listVersions(processId).then(setVersions).catch(() => setVersions([]));
  useEffect(() => {
    refresh();
  }, [processId]);

  async function snapshot() {
    setBusy(true);
    try {
      await saveNow({ snapshot: true, versionLabel: 'Manual snapshot' });
      refresh();
      toast('Snapshot saved.');
    } finally {
      setBusy(false);
    }
  }

  async function restore(v) {
    if (!window.confirm(`Restore the version from ${new Date(v.createdAt).toLocaleString()}? Current state is snapshotted first.`)) return;
    setBusy(true);
    try {
      const res = await api.restoreVersion(processId, v.id);
      adoptServerMap(res.map);
      refresh();
      toast('Version restored.');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h3>Version history</h3>
        <button className="btn sm" onClick={snapshot} disabled={busy}>+ Snapshot now</button>
      </div>
      {!versions ? (
        <span className="spinner" />
      ) : versions.length === 0 ? (
        <p className="muted">No versions yet. Versions are saved automatically before AI edits, restores, layouts, and manual snapshots.</p>
      ) : (
        versions.map((v) => (
          <div key={v.id} className="list-row">
            <div className="grow">
              <div className="name">{v.label || '(autosnapshot)'} <span className="badge gray">{v.source}</span></div>
              <div className="muted">{new Date(v.createdAt).toLocaleString()}</div>
            </div>
            <button className="btn sm" onClick={() => restore(v)} disabled={busy}>Restore</button>
          </div>
        ))
      )}
    </div>
  );
}

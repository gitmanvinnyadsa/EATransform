import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useEditorStore } from '../store.js';

const ACCEPT = '.pdf,.docx,.doc,.xlsx,.xls,.csv,.pptx,.txt,.md,.png,.jpg,.jpeg';

export default function DocumentsPanel({ projectId }) {
  const toast = useEditorStore((s) => s.toast);
  const [docs, setDocs] = useState([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const refresh = () => api.listDocuments(projectId).then(setDocs).catch(() => setDocs([]));
  useEffect(() => {
    refresh();
  }, [projectId]);

  async function upload(files) {
    for (const file of files) {
      setBusy(true);
      try {
        const doc = await api.uploadDocument(projectId, file);
        toast(
          doc.textChars > 0
            ? `Analysed "${file.name}" — ${doc.textChars.toLocaleString()} characters of business content extracted.`
            : `Uploaded "${file.name}" — no text could be extracted from this file type.`
        );
      } catch (e) {
        toast(`${file.name}: ${e.message}`, 'error');
      } finally {
        setBusy(false);
      }
    }
    refresh();
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <h3 style={{ fontSize: 15 }}>Business documents</h3>
          <div className="muted">SOPs, requirements, meeting notes… The AI analyst uses these as context.</div>
        </div>
        <button className="btn" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? 'Analysing…' : '⇧ Upload document'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            upload([...e.target.files]);
            e.target.value = '';
          }}
        />
      </div>
      {docs.length === 0 ? (
        <div className="muted" style={{ padding: '8px 0' }}>No documents uploaded.</div>
      ) : (
        docs.map((d) => (
          <div key={d.id} className="list-row">
            <div className="grow">
              <div className="name">{d.name}</div>
              <div className="muted">
                {d.textChars > 0 ? `${d.textChars.toLocaleString()} chars extracted` : 'no text extracted'} ·{' '}
                {new Date(d.createdAt).toLocaleString()}
              </div>
            </div>
            <button
              className="btn sm danger"
              onClick={async () => {
                await api.deleteDocument(d.id);
                refresh();
              }}
            >
              Remove
            </button>
          </div>
        ))
      )}
    </div>
  );
}

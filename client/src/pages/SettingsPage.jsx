import React, { useEffect, useState } from 'react';
import TopNav from '../components/TopNav.jsx';
import { api } from '../api.js';

export default function SettingsPage() {
  const [status, setStatus] = useState(null);
  const [usage, setUsage] = useState(null);

  useEffect(() => {
    api.aiStatus().then(setStatus).catch(() => setStatus({ configured: false, error: 'API unreachable' }));
    api.aiUsage().then(setUsage).catch(() => setUsage(null));
  }, []);

  return (
    <div>
      <TopNav />
      <div className="dash" style={{ maxWidth: 860 }}>
        <h1 style={{ fontSize: 22, marginBottom: 18 }}>Settings</h1>

        <div className="card" style={{ padding: 20, marginBottom: 18 }}>
          <h3 style={{ marginBottom: 8 }}>AI configuration</h3>
          {!status ? (
            <span className="spinner" />
          ) : status.configured ? (
            <div>
              <span className="badge green">Active</span>
              <p style={{ marginTop: 8 }}>
                Provider: <b>{status.provider}</b> · Model: <b>{status.model}</b>
              </p>
              <p className="muted">
                To switch providers (Gemini, Claude, OpenAI) or models, change <code>AI_PROVIDER</code> /{' '}
                <code>AI_MODEL</code> in the <code>.env</code> file and restart the server. No code changes needed.
              </p>
            </div>
          ) : (
            <div>
              <span className="badge amber">Not configured — demo analyst active</span>
              <p style={{ marginTop: 10, lineHeight: 1.6 }}>
                The platform is fully usable, and AI features run on a built-in offline demo analyst.
                To activate real AI analysis:
              </p>
              <ol style={{ lineHeight: 1.9, paddingLeft: 20 }}>
                <li>
                  Get a free Google Gemini API key at{' '}
                  <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
                    aistudio.google.com/apikey
                  </a>
                </li>
                <li>In the project folder, copy <code>.env.example</code> to a new file named <code>.env</code></li>
                <li>Paste your key after <code>AI_API_KEY=</code></li>
                <li>Restart the application (<code>npm run dev</code>)</li>
              </ol>
              <p className="muted">Full instructions: <code>docs/AI_SETUP.md</code> in the project folder.</p>
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ marginBottom: 8 }}>AI usage</h3>
          {!usage || !usage.total?.calls ? (
            <p className="muted">No AI calls recorded yet.</p>
          ) : (
            <div>
              <p>
                {usage.total.calls} calls · {usage.total.ok} successful ·{' '}
                {Math.round((usage.total.ms || 0) / 1000)}s total ·{' '}
                {(usage.total.inc || 0).toLocaleString()} chars in / {(usage.total.outc || 0).toLocaleString()} chars out
              </p>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginTop: 8 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--text-3)' }}>
                    <th style={{ padding: 4 }}>When</th>
                    <th>Action</th>
                    <th>Provider</th>
                    <th>OK</th>
                    <th>ms</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.recent.map((r) => (
                    <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: 4 }}>{new Date(r.created_at).toLocaleTimeString()}</td>
                      <td>{r.action}</td>
                      <td>{r.provider}</td>
                      <td>{r.ok ? '✓' : '✕'}</td>
                      <td>{r.duration_ms}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

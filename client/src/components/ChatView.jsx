import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useEditorStore } from '../store.js';

/**
 * Shared conversational UI for the AI Business Analyst.
 * Used on the project page (process generation) and in the editor
 * (natural-language editing). The behaviour is driven by the server —
 * this component just renders the conversation.
 */
export default function ChatView({
  projectId,
  processId = null,
  placeholder,
  suggestions = [],
  intro,
  onEvent,
}) {
  const toast = useEditorStore((s) => s.toast);
  const [messages, setMessages] = useState(intro ? [{ role: 'ai', text: intro }] : []);
  const [conversationId, setConversationId] = useState(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const logRef = useRef(null);

  useEffect(() => {
    api.aiStatus().then(setStatus).catch(() => setStatus({ configured: false }));
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  async function send(text) {
    const message = (text ?? input).trim();
    if (!message || busy) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: message }]);
    setBusy(true);
    try {
      const res = await api.aiChat({ conversationId, projectId, processId, message });
      setConversationId(res.conversationId);
      const r = res.reply;
      const parts = [];
      if (r.text) parts.push({ role: 'ai', text: r.text, questions: r.questions });
      if (r.kind === 'error') parts.push({ role: 'system', text: r.text || 'The AI could not complete this request.' });
      setMessages((m) => [...m, ...parts]);
      onEvent?.(r);
    } catch (err) {
      setMessages((m) => [...m, { role: 'system', text: err.message }]);
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="chat">
      {status && !status.configured && (
        <div className="msg system" style={{ marginBottom: 8 }}>
          No AI API key configured — running with the built-in demo analyst. Add a key in{' '}
          <code>.env</code> (see Settings) for full AI capability.
        </div>
      )}
      <div className="chat-log" ref={logRef}>
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.text}
            {m.questions?.map((q, j) => (
              <span className="why" key={j}>
                {j + 1}. {q.question} {q.why ? `— ${q.why}` : ''}
              </span>
            ))}
          </div>
        ))}
        {busy && (
          <div className="msg ai">
            <span className="spinner" /> Analysing…
          </div>
        )}
      </div>
      {suggestions.length > 0 && messages.filter((m) => m.role === 'user').length === 0 && (
        <div className="suggestion-chips">
          {suggestions.map((s) => (
            <button key={s} className="chip" onClick={() => send(s)} disabled={busy}>
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="chat-input">
        <textarea
          className="input"
          placeholder={placeholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          aria-label="Message the AI analyst"
        />
        <button className="btn primary" onClick={() => send()} disabled={busy || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}

import React from 'react';
import { useEditorStore } from '../store.js';

export function Toasts() {
  const toasts = useEditorStore((s) => s.toasts);
  if (toasts.length === 0) return null;
  return (
    <div className="toast-holder" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : ''}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

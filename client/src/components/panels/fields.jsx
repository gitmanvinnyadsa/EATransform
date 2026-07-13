import React, { useState } from 'react';

export function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function TextField({ label, value, onChange, textarea = false, ...rest }) {
  return (
    <Field label={label}>
      {textarea ? (
        <textarea className="input" rows={3} value={value || ''} onChange={(e) => onChange(e.target.value)} {...rest} />
      ) : (
        <input className="input" value={value || ''} onChange={(e) => onChange(e.target.value)} {...rest} />
      )}
    </Field>
  );
}

export function NumField({ label, value, onChange, ...rest }) {
  return (
    <Field label={label}>
      <input
        className="input"
        type="number"
        min="0"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        {...rest}
      />
    </Field>
  );
}

export function SelectField({ label, value, onChange, options }) {
  return (
    <Field label={label}>
      <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value ?? o} value={o.value ?? o}>
            {o.label ?? o}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** Editable list of short strings shown as removable tags. */
export function TagField({ label, values = [], onChange, placeholder = 'Add and press Enter' }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    onChange([...(values || []), v]);
    setDraft('');
  };
  return (
    <Field label={label}>
      <div className="tag-editor" style={{ marginBottom: values?.length ? 6 : 0 }}>
        {(values || []).map((v, i) => (
          <span className="tag" key={`${v}-${i}`}>
            {v}
            <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((_, j) => j !== i))}>
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        className="input"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
      />
    </Field>
  );
}

/** Editable list of {name, ...} objects (KPIs / risks) rendered compactly. */
export function ObjListField({ label, values = [], onChange, fields, addLabel = '+ Add' }) {
  return (
    <Field label={label}>
      {(values || []).map((item, i) => (
        <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8, marginBottom: 6 }}>
          {fields.map((f) => (
            <input
              key={f.key}
              className="input"
              style={{ marginBottom: 4 }}
              placeholder={f.label}
              value={item[f.key] || ''}
              onChange={(e) =>
                onChange(values.map((v, j) => (j === i ? { ...v, [f.key]: e.target.value } : v)))
              }
            />
          ))}
          <button type="button" className="btn sm danger" onClick={() => onChange(values.filter((_, j) => j !== i))}>
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn sm"
        onClick={() => onChange([...(values || []), Object.fromEntries(fields.map((f) => [f.key, '']))])}
      >
        {addLabel}
      </button>
    </Field>
  );
}

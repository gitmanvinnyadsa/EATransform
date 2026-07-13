import React, { useState } from 'react';
import { useEditorStore } from '../../store.js';
import { api } from '../../api.js';
import { exportPng, exportPdf, exportXlsx, exportDocx, exportPptx } from '../../lib/officeExports.js';

const SERVER_FORMATS = [
  { fmt: 'pdf', name: 'PDF report', desc: 'Diagram + full documentation pack', client: exportPdf },
  { fmt: 'png', name: 'PNG image', desc: 'High-resolution diagram image', client: exportPng },
  { fmt: 'svg', name: 'SVG vector', desc: 'Scalable vector diagram' },
  { fmt: 'pptx', name: 'PowerPoint', desc: 'Executive deck: map, summary, KPIs & risks', client: exportPptx },
  { fmt: 'docx', name: 'Word document', desc: 'Process documentation with tables', client: exportDocx },
  { fmt: 'xlsx', name: 'Excel workbook', desc: 'Activities, RACI, KPIs, risks, analysis', client: exportXlsx },
  { fmt: 'bpmn', name: 'BPMN 2.0 XML', desc: 'Opens in Camunda, bpmn.io, Signavio' },
  { fmt: 'drawio', name: 'Draw.io / Visio', desc: 'Opens in diagrams.net (Visio-compatible)' },
  { fmt: 'mermaid', name: 'Mermaid', desc: 'Text-based diagram definition' },
  { fmt: 'json', name: 'JSON', desc: 'Full model incl. metadata & hierarchy links' },
  { fmt: 'csv', name: 'CSV — activities', desc: 'Activity register spreadsheet' },
  { fmt: 'csv-raci', name: 'CSV — RACI', desc: 'RACI matrix' },
  { fmt: 'csv-risks', name: 'CSV — risks', desc: 'Risk register' },
];

export default function ExportPanel({ processId }) {
  const map = useEditorStore((s) => s.map);
  const saveNow = useEditorStore((s) => s.saveNow);
  const toast = useEditorStore((s) => s.toast);
  const [busy, setBusy] = useState('');

  async function run(f) {
    setBusy(f.fmt);
    try {
      await saveNow();
      if (f.client) {
        await f.client(map);
      } else {
        const a = document.createElement('a');
        a.href = api.exportUrl(processId, f.fmt);
        a.download = '';
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      toast(`${f.name} exported.`);
    } catch (e) {
      toast(`${f.name} failed: ${e.message}`, 'error');
    } finally {
      setBusy('');
    }
  }

  return (
    <div>
      <h3 style={{ marginBottom: 4 }}>Export centre</h3>
      <p className="muted" style={{ marginBottom: 12 }}>
        Exports preserve swimlanes, hierarchy links, relationships, annotations and metadata.
      </p>
      {SERVER_FORMATS.map((f) => (
        <div key={f.fmt} className="list-row">
          <div className="grow">
            <div className="name">{f.name}</div>
            <div className="muted">{f.desc}</div>
          </div>
          <button className="btn sm" onClick={() => run(f)} disabled={!!busy}>
            {busy === f.fmt ? <span className="spinner" /> : 'Download'}
          </button>
        </div>
      ))}
    </div>
  );
}

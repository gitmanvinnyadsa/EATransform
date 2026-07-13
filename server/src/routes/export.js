import { Router } from 'express';
import * as store from '../store.js';
import {
  toMermaid,
  toBpmnXml,
  toDrawioXml,
  toSvg,
  toCsv,
  activityRows,
  raciRows,
  kpiRows,
  riskRows,
  edgeRows,
  documentModel,
} from '@eatransform/shared';

const router = Router();

const FORMATS = {
  json: {
    mime: 'application/json',
    ext: 'json',
    render: (proc) => JSON.stringify({ ...proc.map, exportedAt: new Date().toISOString() }, null, 2),
  },
  bpmn: { mime: 'application/xml', ext: 'bpmn', render: (proc) => toBpmnXml(proc.map) },
  mermaid: { mime: 'text/plain', ext: 'mmd', render: (proc) => toMermaid(proc.map) },
  drawio: { mime: 'application/xml', ext: 'drawio', render: (proc) => toDrawioXml(proc.map) },
  svg: { mime: 'image/svg+xml', ext: 'svg', render: (proc) => toSvg(proc.map) },
  csv: { mime: 'text/csv', ext: 'csv', render: (proc) => toCsv(activityRows(proc.map)) },
  'csv-raci': { mime: 'text/csv', ext: 'csv', render: (proc) => toCsv(raciRows(proc.map)) },
  'csv-kpis': { mime: 'text/csv', ext: 'csv', render: (proc) => toCsv(kpiRows(proc.map)) },
  'csv-risks': { mime: 'text/csv', ext: 'csv', render: (proc) => toCsv(riskRows(proc.map)) },
  'csv-flows': { mime: 'text/csv', ext: 'csv', render: (proc) => toCsv(edgeRows(proc.map)) },
};

router.get('/formats', (req, res) => {
  res.json(Object.keys(FORMATS));
});

router.get('/:processId/document-model', (req, res) => {
  const proc = store.getProcess(req.params.processId);
  if (!proc) return res.status(404).json({ error: 'Process not found' });
  res.json(documentModel(proc.map));
});

router.get('/:processId/:format', (req, res) => {
  const proc = store.getProcess(req.params.processId);
  if (!proc) return res.status(404).json({ error: 'Process not found' });
  const fmt = FORMATS[req.params.format];
  if (!fmt) {
    return res
      .status(400)
      .json({ error: `Unknown format "${req.params.format}"`, supported: Object.keys(FORMATS) });
  }
  const safeName = proc.map.name.replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'process';
  res.setHeader('Content-Type', `${fmt.mime}; charset=utf-8`);
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}.${fmt.ext}"`);
  res.send(fmt.render(proc));
});

export default router;

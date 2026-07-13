import { Router } from 'express';
import * as store from '../store.js';
import {
  analyzeMap,
  applyOperations,
  applyAutoLayout,
  parseProcessMap,
  sampleOrderFulfilmentMap,
} from '@eatransform/shared';

const router = Router();

router.post('/', (req, res, next) => {
  try {
    const { projectId, parentId, name, level, template } = req.body || {};
    const map = template === 'sample' ? sampleOrderFulfilmentMap() : req.body?.map;
    if (!projectId || !store.getProject(projectId)) {
      return res.status(400).json({ error: 'A valid projectId is required' });
    }
    if (parentId && !store.getProcess(parentId)) {
      return res.status(400).json({ error: 'parentId does not reference an existing process' });
    }
    const proc = store.createProcess({ projectId, parentId, name, map, level });
    res.status(201).json(proc);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', (req, res) => {
  const proc = store.getProcess(req.params.id);
  if (!proc) return res.status(404).json({ error: 'Process not found' });
  const children = store
    .listProcesses(proc.projectId)
    .filter((p) => p.parentId === proc.id);
  res.json({ ...proc, children });
});

// Replace the map (autosave / manual save). Optional ?snapshot=0 to skip versioning.
router.put('/:id/map', (req, res, next) => {
  try {
    const snapshot = req.query.snapshot !== '0';
    const result = store.updateProcessMap(req.params.id, req.body?.map, {
      versionLabel: req.body?.versionLabel || '',
      source: req.body?.source || 'manual',
      snapshot,
    });
    if (!result) return res.status(404).json({ error: 'Process not found' });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Apply structured edit operations (used by UI bulk actions and tests).
router.post('/:id/operations', (req, res, next) => {
  try {
    const proc = store.getProcess(req.params.id);
    if (!proc) return res.status(404).json({ error: 'Process not found' });
    const ops = req.body?.operations;
    if (!Array.isArray(ops) || ops.length === 0) {
      return res.status(400).json({ error: 'operations must be a non-empty array' });
    }
    const { map, applied, errors } = applyOperations(proc.map, ops);
    const check = parseProcessMap(map);
    if (!check.ok) {
      return res.status(400).json({ error: 'Operations produced an invalid map', details: check.errors });
    }
    const result = store.updateProcessMap(proc.id, check.map, {
      versionLabel: 'Before operations',
      source: 'operations',
    });
    res.json({ ...result, applied, opErrors: errors });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/autolayout', (req, res, next) => {
  try {
    const proc = store.getProcess(req.params.id);
    if (!proc) return res.status(404).json({ error: 'Process not found' });
    const laidOut = applyAutoLayout(proc.map);
    const result = store.updateProcessMap(proc.id, laidOut, {
      versionLabel: 'Before auto-layout',
      source: 'layout',
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', (req, res) => {
  const proc = store.updateProcessMeta(req.params.id, req.body || {});
  if (!proc) return res.status(404).json({ error: 'Process not found' });
  res.json(proc);
});

router.delete('/:id', (req, res) => {
  if (!store.deleteProcess(req.params.id)) {
    return res.status(404).json({ error: 'Process not found' });
  }
  res.json({ ok: true });
});

// Deterministic analysis (works without any AI key).
router.get('/:id/analysis', (req, res) => {
  const proc = store.getProcess(req.params.id);
  if (!proc) return res.status(404).json({ error: 'Process not found' });
  res.json(analyzeMap(proc.map));
});

// ---- versions ----
router.get('/:id/versions', (req, res) => {
  const proc = store.getProcess(req.params.id);
  if (!proc) return res.status(404).json({ error: 'Process not found' });
  res.json(store.listVersions(proc.id));
});

router.get('/:id/versions/:versionId', (req, res) => {
  const v = store.getVersion(req.params.versionId);
  if (!v || v.processId !== req.params.id) return res.status(404).json({ error: 'Version not found' });
  res.json(v);
});

router.post('/:id/versions/:versionId/restore', (req, res, next) => {
  try {
    const result = store.restoreVersion(req.params.id, req.params.versionId);
    if (!result) return res.status(404).json({ error: 'Version not found' });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;

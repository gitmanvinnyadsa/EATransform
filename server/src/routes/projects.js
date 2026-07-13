import { Router } from 'express';
import * as store from '../store.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(store.listProjects());
});

router.post('/', (req, res) => {
  const { name, description, folder } = req.body || {};
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Project name is required' });
  }
  res.status(201).json(store.createProject({ name: name.trim(), description, folder }));
});

router.get('/:id', (req, res) => {
  const project = store.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json({ ...project, processes: store.listProcesses(project.id) });
});

router.patch('/:id', (req, res) => {
  const project = store.updateProject(req.params.id, req.body || {});
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
});

router.delete('/:id', (req, res) => {
  if (!store.deleteProject(req.params.id)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  res.json({ ok: true });
});

export default router;

import { Router } from 'express';
import multer from 'multer';
import { getDb, now } from '../db.js';
import { getProject } from '../store.js';
import { genId } from '@eatransform/shared';
import { extractText } from '../documents/extract.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const router = Router();

router.get('/', (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: 'projectId is required' });
  const rows = getDb()
    .prepare('SELECT id, name, mime, LENGTH(text) AS chars, created_at FROM documents WHERE project_id = ? ORDER BY created_at DESC')
    .all(projectId);
  res.json(rows.map((r) => ({ id: r.id, name: r.name, mime: r.mime, textChars: r.chars, createdAt: r.created_at })));
});

router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    const { projectId } = req.body || {};
    if (!projectId || !getProject(projectId)) return res.status(400).json({ error: 'A valid projectId is required' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { text, note } = await extractText(req.file.originalname, req.file.mimetype || '', req.file.buffer);
    const id = genId('doc');
    getDb()
      .prepare('INSERT INTO documents (id, project_id, name, mime, text, created_at) VALUES (?,?,?,?,?,?)')
      .run(id, projectId, req.file.originalname, req.file.mimetype || '', text.slice(0, 500000), now());
    res.status(201).json({ id, name: req.file.originalname, textChars: text.length, note });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', (req, res) => {
  const changes = getDb().prepare('DELETE FROM documents WHERE id = ?').run(req.params.id).changes;
  if (!changes) return res.status(404).json({ error: 'Document not found' });
  res.json({ ok: true });
});

export default router;

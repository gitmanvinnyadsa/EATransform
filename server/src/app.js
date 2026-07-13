import express from 'express';
import cors from 'cors';
import projectsRouter from './routes/projects.js';
import processesRouter from './routes/processes.js';
import exportRouter from './routes/export.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '20mb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true, name: 'EATransform API' }));

  app.use('/api/projects', projectsRouter);
  app.use('/api/processes', processesRouter);
  app.use('/api/export', exportRouter);

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || 500;
    if (status >= 500) console.error('[api]', err);
    res.status(status).json({ error: err.message || 'Internal server error' });
  });

  return app;
}

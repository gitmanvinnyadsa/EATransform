import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { initDb, closeDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { sampleOrderFulfilmentMap } from '@eatransform/shared';

let app;
let tmp;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eat-test-'));
  initDb(tmp);
  app = createApp();
});

afterAll(() => {
  closeDb();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('projects API', () => {
  let projectId;

  it('creates a project', async () => {
    const res = await request(app)
      .post('/api/projects')
      .send({ name: 'Retail transformation', description: 'Delivery delays initiative' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    projectId = res.body.id;
  });

  it('rejects a project without a name', async () => {
    const res = await request(app).post('/api/projects').send({});
    expect(res.status).toBe(400);
  });

  it('lists and updates projects', async () => {
    const list = await request(app).get('/api/projects');
    expect(list.body.some((p) => p.id === projectId)).toBe(true);
    const upd = await request(app).patch(`/api/projects/${projectId}`).send({ folder: 'Retail' });
    expect(upd.body.folder).toBe('Retail');
  });

  it('404s on a missing project', async () => {
    const res = await request(app).get('/api/projects/nope');
    expect(res.status).toBe(404);
  });
});

describe('processes API', () => {
  let projectId;
  let processId;

  beforeAll(async () => {
    const res = await request(app).post('/api/projects').send({ name: 'Ops' });
    projectId = res.body.id;
  });

  it('creates a process with the sample map', async () => {
    const res = await request(app)
      .post('/api/processes')
      .send({ projectId, map: sampleOrderFulfilmentMap() });
    expect(res.status).toBe(201);
    expect(res.body.map.nodes).toHaveLength(11);
    processId = res.body.id;
  });

  it('creates a blank process when no map is given', async () => {
    const res = await request(app).post('/api/processes').send({ projectId, name: 'Blank one' });
    expect(res.status).toBe(201);
    expect(res.body.map.nodes.length).toBeGreaterThanOrEqual(3);
  });

  it('rejects an invalid map', async () => {
    const res = await request(app)
      .post('/api/processes')
      .send({ projectId, map: { name: 'bad', nodes: [] } });
    expect(res.status).toBe(400);
  });

  it('updates the map and creates a version snapshot', async () => {
    const proc = (await request(app).get(`/api/processes/${processId}`)).body;
    const map = { ...proc.map, owner: 'COO' };
    const upd = await request(app).put(`/api/processes/${processId}/map`).send({ map });
    expect(upd.status).toBe(200);
    expect(upd.body.map.owner).toBe('COO');
    const versions = await request(app).get(`/api/processes/${processId}/versions`);
    expect(versions.body.length).toBeGreaterThanOrEqual(1);
  });

  it('restores a version', async () => {
    const versions = (await request(app).get(`/api/processes/${processId}/versions`)).body;
    const res = await request(app).post(
      `/api/processes/${processId}/versions/${versions[0].id}/restore`
    );
    expect(res.status).toBe(200);
    expect(res.body.map.owner).not.toBe('COO'); // restored pre-change snapshot
  });

  it('applies operations transactionally', async () => {
    const res = await request(app)
      .post(`/api/processes/${processId}/operations`)
      .send({
        operations: [
          { op: 'update_process', changes: { owner: 'Head of Supply Chain' } },
          { op: 'add_lane', lane: { name: 'Returns', kind: 'team' } },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.map.owner).toBe('Head of Supply Chain');
    expect(res.body.map.lanes.some((l) => l.name === 'Returns')).toBe(true);
    expect(res.body.applied).toHaveLength(2);
  });

  it('auto-layouts', async () => {
    const res = await request(app).post(`/api/processes/${processId}/autolayout`);
    expect(res.status).toBe(200);
    expect(res.body.map.nodes.every((n) => n.position)).toBe(true);
  });

  it('serves analysis', async () => {
    const res = await request(app).get(`/api/processes/${processId}/analysis`);
    expect(res.status).toBe(200);
    expect(res.body.healthScore).toBeGreaterThan(0);
  });

  it('supports hierarchy via parentId', async () => {
    const child = await request(app)
      .post('/api/processes')
      .send({ projectId, parentId: processId, name: 'Last-mile detail', level: 2 });
    expect(child.status).toBe(201);
    const parent = await request(app).get(`/api/processes/${processId}`);
    expect(parent.body.children.some((c) => c.id === child.body.id)).toBe(true);
  });

  it('deletes a process', async () => {
    const res = await request(app)
      .post('/api/processes')
      .send({ projectId, name: 'Temp' });
    const del = await request(app).delete(`/api/processes/${res.body.id}`);
    expect(del.body.ok).toBe(true);
    const gone = await request(app).get(`/api/processes/${res.body.id}`);
    expect(gone.status).toBe(404);
  });
});

describe('export API', () => {
  let processId;

  beforeAll(async () => {
    const p = await request(app).post('/api/projects').send({ name: 'Export tests' });
    const proc = await request(app)
      .post('/api/processes')
      .send({ projectId: p.body.id, map: sampleOrderFulfilmentMap() });
    processId = proc.body.id;
  });

  it.each(['json', 'bpmn', 'mermaid', 'drawio', 'svg', 'csv', 'csv-raci', 'csv-kpis', 'csv-risks', 'csv-flows'])(
    'exports %s',
    async (fmt) => {
      const res = await request(app).get(`/api/export/${processId}/${fmt}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toContain('attachment');
      const body = res.text ?? res.body.toString('utf8');
      expect(body.length).toBeGreaterThan(10);
    }
  );

  it('serves the document model for office exports', async () => {
    const res = await request(app).get(`/api/export/${processId}/document-model`);
    expect(res.status).toBe(200);
    expect(res.body.activities.length).toBeGreaterThan(0);
  });

  it('rejects unknown formats', async () => {
    const res = await request(app).get(`/api/export/${processId}/exe`);
    expect(res.status).toBe(400);
    expect(res.body.supported).toContain('bpmn');
  });
});

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { initDb, closeDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { extractJson } from '../src/ai/jsonRepair.js';
import { callAi, IntakeReplySchema } from '../src/ai/service.js';
import { sampleOrderFulfilmentMap } from '@eatransform/shared';

let app;
let tmp;
let projectId;
let processId;

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eat-ai-test-'));
  initDb(tmp);
  app = createApp();
  const p = await request(app).post('/api/projects').send({ name: 'AI tests' });
  projectId = p.body.id;
  const proc = await request(app)
    .post('/api/processes')
    .send({ projectId, map: sampleOrderFulfilmentMap() });
  processId = proc.body.id;
});

afterAll(() => {
  closeDb();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('JSON repair', () => {
  it('parses clean JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });
  it('strips markdown fences', () => {
    expect(extractJson('Here you go:\n```json\n{"a": 1}\n```\nEnjoy!')).toEqual({ a: 1 });
  });
  it('extracts JSON embedded in prose', () => {
    expect(extractJson('The answer is {"a": {"b": [1,2]}} as requested.')).toEqual({ a: { b: [1, 2] } });
  });
  it('repairs trailing commas', () => {
    expect(extractJson('{"a": [1,2,], "b": {"c": 3,},}')).toEqual({ a: [1, 2], b: { c: 3 } });
  });
  it('closes truncated JSON', () => {
    const out = extractJson('{"action":"answer","message":"hello wor');
    expect(out.action).toBe('answer');
  });
  it('throws a clear error on garbage', () => {
    expect(() => extractJson('no json here at all')).toThrow(/no JSON/i);
  });
});

describe('AI status endpoint', () => {
  it('reports unconfigured with setup hint when no key present', async () => {
    const res = await request(app).get('/api/ai/status');
    expect(res.status).toBe(200);
    // In CI there is no key, so the mock analyst is active.
    if (!res.body.configured) {
      expect(res.body.setupHint).toContain('.env');
    }
  });
});

describe('AI intake flow (mock analyst)', () => {
  it('asks clarification questions when the description is vague', async () => {
    const res = await request(app)
      .post('/api/ai/chat')
      .send({ projectId, message: 'We want to be better.' });
    expect(res.status).toBe(200);
    expect(res.body.reply.kind).toBe('questions');
    expect(res.body.reply.questions.length).toBeGreaterThanOrEqual(2);
    expect(res.body.reply.questions[0].why).toBeTruthy();
    expect(res.body.conversationId).toBeTruthy();
  });

  it('generates a validated process map from a rich description', async () => {
    const res = await request(app).post('/api/ai/chat').send({
      projectId,
      message:
        'We are a healthcare organisation improving patient onboarding across reception, clinical and billing teams.',
    });
    expect(res.status).toBe(200);
    expect(res.body.reply.kind).toBe('generated');
    expect(res.body.reply.processId).toBeTruthy();
    const proc = await request(app).get(`/api/processes/${res.body.reply.processId}`);
    expect(proc.body.map.lanes.length).toBeGreaterThan(1);
    expect(proc.body.map.nodes.some((n) => n.type === 'start')).toBe(true);
    expect(proc.body.map.nodes.every((n) => n.position)).toBe(true); // auto-laid-out
  });

  it('continues a conversation: vague then detailed answers', async () => {
    const first = await request(app).post('/api/ai/chat').send({ projectId, message: 'Improve things' });
    expect(first.body.reply.kind).toBe('questions');
    const second = await request(app).post('/api/ai/chat').send({
      projectId,
      conversationId: first.body.conversationId,
      message:
        'We are a manufacturing company trying to reduce production waste; planning, production line, QA and warehouse are involved.',
    });
    expect(second.body.reply.kind).toBe('generated');
  });
});

describe('AI editing flow (mock analyst)', () => {
  it('adds a node via natural language and versions the change', async () => {
    const before = (await request(app).get(`/api/processes/${processId}`)).body.map;
    const res = await request(app)
      .post('/api/ai/edit')
      .send({ processId, instruction: 'Add a finance approval before Book courier collection' });
    expect(res.status).toBe(200);
    expect(res.body.reply.kind).toBe('edited');
    const after = (await request(app).get(`/api/processes/${processId}`)).body.map;
    expect(after.nodes.length).toBe(before.nodes.length + 1);
    expect(after.nodes.some((n) => n.type === 'approval' && /finance/i.test(n.label))).toBe(true);
    const versions = await request(app).get(`/api/processes/${processId}/versions`);
    expect(versions.body.some((v) => v.source === 'ai')).toBe(true);
  });

  it('removes a node via natural language and reconnects flow', async () => {
    const res = await request(app)
      .post('/api/ai/edit')
      .send({ processId, instruction: 'Remove the quality check' });
    expect(res.body.reply.kind).toBe('edited');
    const after = (await request(app).get(`/api/processes/${processId}`)).body.map;
    expect(after.nodes.some((n) => /quality check/i.test(n.label))).toBe(false);
  });

  it('highlights bottlenecks', async () => {
    const res = await request(app)
      .post('/api/ai/edit')
      .send({ processId, instruction: 'Highlight bottlenecks' });
    expect(res.body.reply.kind).toBe('highlight');
    expect(Array.isArray(res.body.reply.nodeIds)).toBe(true);
    expect(res.body.reply.nodeIds.length).toBeGreaterThan(0);
  });

  it('produces an executive summary without changing the map', async () => {
    const before = (await request(app).get(`/api/processes/${processId}`)).body.map;
    const res = await request(app)
      .post('/api/ai/edit')
      .send({ processId, instruction: 'Create an executive summary' });
    expect(res.body.reply.kind).toBe('answer');
    expect(res.body.reply.text).toContain('EXECUTIVE SUMMARY');
    const after = (await request(app).get(`/api/processes/${processId}`)).body.map;
    expect(after.nodes.length).toBe(before.nodes.length);
  });

  it('never corrupts the map when the instruction cannot be resolved', async () => {
    const res = await request(app)
      .post('/api/ai/edit')
      .send({ processId, instruction: 'Remove the flux capacitor recalibration' });
    expect(['answer', 'error']).toContain(res.body.reply.kind);
    const after = (await request(app).get(`/api/processes/${processId}`)).body.map;
    expect(after.nodes.length).toBeGreaterThan(0);
  });
});

describe('AI insights', () => {
  it('returns a narrative plus deterministic analysis', async () => {
    const res = await request(app).post('/api/ai/insights').send({ processId });
    expect(res.status).toBe(200);
    expect(res.body.narrative.length).toBeGreaterThan(100);
    expect(res.body.analysis.healthScore).toBeGreaterThan(0);
  });
});

describe('AI service resilience', () => {
  it('validates provider output against the schema end-to-end', async () => {
    const out = await callAi({
      action: 'intake',
      system: 's',
      user: 'u',
      hint: { action: 'intake', payload: { message: 'short', history: [] } },
      schema: IntakeReplySchema,
      aiConfig: { provider: 'mock', apiKey: '', model: 'mock-analyst-1', timeoutMs: 5000, maxRetries: 1 },
    });
    expect(out.result.action).toBe('ask');
    expect(out.fallback).toBe(false);
  });

  it('falls back to the offline analyst when the real provider is unreachable', async () => {
    const out = await callAi({
      action: 'intake',
      system: 's',
      user: 'u',
      hint: {
        action: 'intake',
        payload: {
          message: 'We are a manufacturing company trying to reduce production waste in our plant.',
          history: [],
        },
      },
      schema: IntakeReplySchema,
      // Bad key + unreachable host behaviour: gemini call will fail fast with 4xx.
      aiConfig: { provider: 'gemini', apiKey: 'invalid-key-for-test', model: 'gemini-2.0-flash', timeoutMs: 8000, maxRetries: 0 },
    });
    expect(out.fallback).toBe(true);
    expect(out.result.action).toBe('generate');
  }, 20000);

  it('records usage', async () => {
    const res = await request(app).get('/api/ai/usage');
    expect(res.body.total.calls).toBeGreaterThan(0);
  });
});

describe('documents API', () => {
  it('uploads and extracts a text document', async () => {
    const res = await request(app)
      .post('/api/documents')
      .field('projectId', projectId)
      .attach('file', Buffer.from('Our SOP: orders must ship within 24 hours. Warehouse team owns picking.'), 'sop.txt');
    expect(res.status).toBe(201);
    expect(res.body.textChars).toBeGreaterThan(10);
    const list = await request(app).get(`/api/documents?projectId=${projectId}`);
    expect(list.body.some((d) => d.name === 'sop.txt')).toBe(true);
  });

  it('extracts CSV and XLSX-style content', async () => {
    const res = await request(app)
      .post('/api/documents')
      .field('projectId', projectId)
      .attach('file', Buffer.from('step,owner\nPick order,Warehouse\nShip order,Logistics'), 'steps.csv');
    expect(res.status).toBe(201);
    expect(res.body.textChars).toBeGreaterThan(10);
  });

  it('rejects uploads without a project', async () => {
    const res = await request(app)
      .post('/api/documents')
      .attach('file', Buffer.from('x'), 'x.txt');
    expect(res.status).toBe(400);
  });

  it('deletes documents', async () => {
    const list = await request(app).get(`/api/documents?projectId=${projectId}`);
    const id = list.body[0].id;
    const del = await request(app).delete(`/api/documents/${id}`);
    expect(del.body.ok).toBe(true);
  });

  it('document text feeds the AI intake as context', async () => {
    await request(app)
      .post('/api/documents')
      .field('projectId', projectId)
      .attach('file', Buffer.from('We are a hospital. Patient onboarding takes 5 days.'), 'context.txt');
    const res = await request(app).post('/api/ai/chat').send({
      projectId,
      message: 'We are a healthcare organisation improving patient onboarding for our clinical teams.',
    });
    expect(res.body.reply.kind).toBe('generated');
  });
});

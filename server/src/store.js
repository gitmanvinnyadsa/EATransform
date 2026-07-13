/** Data-access layer over SQLite for projects, processes and versions. */
import { getDb, now } from './db.js';
import { genId, parseProcessMap, blankMap } from '@eatransform/shared';

const MAX_VERSIONS_PER_PROCESS = 100;

// ---------- projects ----------
export function listProjects() {
  const db = getDb();
  const projects = db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all();
  const counts = db
    .prepare('SELECT project_id, COUNT(*) AS c FROM processes GROUP BY project_id')
    .all();
  const byId = Object.fromEntries(counts.map((r) => [r.project_id, r.c]));
  return projects.map((p) => ({ ...rowToProject(p), processCount: byId[p.id] || 0 }));
}

export function createProject({ name, description = '', folder = '' }) {
  const db = getDb();
  const id = genId('proj');
  const t = now();
  db.prepare(
    'INSERT INTO projects (id, name, description, folder, created_at, updated_at) VALUES (?,?,?,?,?,?)'
  ).run(id, name, description, folder, t, t);
  return getProject(id);
}

export function getProject(id) {
  const row = getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id);
  return row ? rowToProject(row) : null;
}

export function updateProject(id, { name, description, folder }) {
  const db = getDb();
  const cur = getProject(id);
  if (!cur) return null;
  db.prepare('UPDATE projects SET name=?, description=?, folder=?, updated_at=? WHERE id=?').run(
    name ?? cur.name,
    description ?? cur.description,
    folder ?? cur.folder,
    now(),
    id
  );
  return getProject(id);
}

export function deleteProject(id) {
  return getDb().prepare('DELETE FROM projects WHERE id = ?').run(id).changes > 0;
}

function rowToProject(r) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    folder: r.folder,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ---------- processes ----------
export function listProcesses(projectId) {
  const rows = getDb()
    .prepare(
      'SELECT id, project_id, parent_id, name, level, created_at, updated_at FROM processes WHERE project_id = ? ORDER BY created_at ASC'
    )
    .all(projectId);
  return rows.map((r) => ({
    id: r.id,
    projectId: r.project_id,
    parentId: r.parent_id,
    name: r.name,
    level: r.level,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export function getProcess(id) {
  const r = getDb().prepare('SELECT * FROM processes WHERE id = ?').get(id);
  if (!r) return null;
  return {
    id: r.id,
    projectId: r.project_id,
    parentId: r.parent_id,
    name: r.name,
    level: r.level,
    map: JSON.parse(r.data),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function createProcess({ projectId, parentId = null, name, map, level }) {
  const db = getDb();
  const candidate = map ?? blankMap(name || 'Untitled process');
  const parsed = parseProcessMap(candidate);
  if (!parsed.ok) {
    const err = new Error(`Invalid process map: ${parsed.errors.join('; ')}`);
    err.status = 400;
    throw err;
  }
  const finalMap = parsed.map;
  const id = genId('proc');
  const t = now();
  db.prepare(
    'INSERT INTO processes (id, project_id, parent_id, name, level, data, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)'
  ).run(
    id,
    projectId,
    parentId,
    name || finalMap.name,
    level ?? finalMap.level ?? 1,
    JSON.stringify(finalMap),
    t,
    t
  );
  db.prepare('UPDATE projects SET updated_at=? WHERE id=?').run(t, projectId);
  return getProcess(id);
}

export function updateProcessMap(id, map, { versionLabel = '', source = 'manual', snapshot = true } = {}) {
  const db = getDb();
  const cur = getProcess(id);
  if (!cur) return null;
  const parsed = parseProcessMap(map);
  if (!parsed.ok) {
    const err = new Error(`Invalid process map: ${parsed.errors.join('; ')}`);
    err.status = 400;
    throw err;
  }
  if (snapshot) {
    saveVersion(id, cur.map, { label: versionLabel, source });
  }
  const t = now();
  db.prepare('UPDATE processes SET name=?, level=?, data=?, updated_at=? WHERE id=?').run(
    parsed.map.name,
    parsed.map.level ?? cur.level,
    JSON.stringify(parsed.map),
    t,
    id
  );
  db.prepare('UPDATE projects SET updated_at=? WHERE id=?').run(t, cur.projectId);
  return { ...getProcess(id), warnings: parsed.warnings };
}

export function updateProcessMeta(id, { name, parentId, level }) {
  const db = getDb();
  const cur = getProcess(id);
  if (!cur) return null;
  db.prepare('UPDATE processes SET name=?, parent_id=?, level=?, updated_at=? WHERE id=?').run(
    name ?? cur.name,
    parentId === undefined ? cur.parentId : parentId,
    level ?? cur.level,
    now(),
    id
  );
  return getProcess(id);
}

export function deleteProcess(id) {
  const db = getDb();
  // Detach children first (they survive as top-level processes).
  db.prepare('UPDATE processes SET parent_id = NULL WHERE parent_id = ?').run(id);
  return db.prepare('DELETE FROM processes WHERE id = ?').run(id).changes > 0;
}

// ---------- versions ----------
export function saveVersion(processId, map, { label = '', source = 'manual' } = {}) {
  const db = getDb();
  const id = genId('ver');
  db.prepare(
    'INSERT INTO versions (id, process_id, label, source, data, created_at) VALUES (?,?,?,?,?,?)'
  ).run(id, processId, label, source, JSON.stringify(map), now());
  // Trim old versions to keep the database bounded.
  db.prepare(
    `DELETE FROM versions WHERE process_id = ? AND id NOT IN (
       SELECT id FROM versions WHERE process_id = ? ORDER BY created_at DESC LIMIT ?
     )`
  ).run(processId, processId, MAX_VERSIONS_PER_PROCESS);
  return id;
}

export function listVersions(processId) {
  return getDb()
    .prepare(
      'SELECT id, label, source, created_at FROM versions WHERE process_id = ? ORDER BY created_at DESC'
    )
    .all(processId)
    .map((r) => ({ id: r.id, label: r.label, source: r.source, createdAt: r.created_at }));
}

export function getVersion(versionId) {
  const r = getDb().prepare('SELECT * FROM versions WHERE id = ?').get(versionId);
  if (!r) return null;
  return {
    id: r.id,
    processId: r.process_id,
    label: r.label,
    source: r.source,
    map: JSON.parse(r.data),
    createdAt: r.created_at,
  };
}

export function restoreVersion(processId, versionId) {
  const v = getVersion(versionId);
  if (!v || v.processId !== processId) return null;
  return updateProcessMap(processId, v.map, {
    versionLabel: 'Before restore',
    source: 'restore',
  });
}

// ---------- AI usage ----------
export function logAiUsage(entry) {
  getDb()
    .prepare(
      'INSERT INTO ai_usage (provider, model, action, ok, duration_ms, input_chars, output_chars, error, created_at) VALUES (?,?,?,?,?,?,?,?,?)'
    )
    .run(
      entry.provider,
      entry.model,
      entry.action,
      entry.ok ? 1 : 0,
      entry.durationMs ?? 0,
      entry.inputChars ?? 0,
      entry.outputChars ?? 0,
      entry.error ?? '',
      now()
    );
}

export function aiUsageSummary() {
  const db = getDb();
  const total = db
    .prepare(
      'SELECT COUNT(*) AS calls, SUM(ok) AS ok, SUM(duration_ms) AS ms, SUM(input_chars) AS inc, SUM(output_chars) AS outc FROM ai_usage'
    )
    .get();
  const recent = db
    .prepare('SELECT * FROM ai_usage ORDER BY id DESC LIMIT 20')
    .all();
  return { total, recent };
}

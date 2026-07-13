/**
 * Conversation orchestrator: routes a chat message to the intake flow
 * (business analysis → clarification questions → map generation) or the
 * editing flow (natural-language changes to an existing map), applies the
 * results transactionally, and keeps conversation history in the database.
 */
import { getDb, now } from '../db.js';
import * as store from '../store.js';
import { genId, parseProcessMap, applyOperations, applyAutoLayout, analyzeMap } from '@eatransform/shared';
import { callAi, IntakeReplySchema, EditReplySchema, InsightsReplySchema } from './service.js';
import { intakePrompt, editPrompt, insightsPrompt } from './prompts.js';

const MAX_DOC_CHARS = 24000;
const MAX_HISTORY = 16;

function getConversation(id) {
  const r = getDb().prepare('SELECT * FROM conversations WHERE id = ?').get(id);
  if (!r) return null;
  return {
    id: r.id,
    projectId: r.project_id,
    processId: r.process_id,
    messages: JSON.parse(r.messages),
    state: JSON.parse(r.state),
  };
}

function saveConversation(conv) {
  const db = getDb();
  const t = now();
  const exists = db.prepare('SELECT 1 FROM conversations WHERE id = ?').get(conv.id);
  if (exists) {
    db.prepare('UPDATE conversations SET messages=?, state=?, process_id=?, updated_at=? WHERE id=?').run(
      JSON.stringify(conv.messages.slice(-MAX_HISTORY * 2)),
      JSON.stringify(conv.state),
      conv.processId ?? null,
      t,
      conv.id
    );
  } else {
    db.prepare(
      'INSERT INTO conversations (id, project_id, process_id, messages, state, created_at, updated_at) VALUES (?,?,?,?,?,?,?)'
    ).run(conv.id, conv.projectId ?? null, conv.processId ?? null, JSON.stringify(conv.messages), JSON.stringify(conv.state), t, t);
  }
}

function projectDocumentsText(projectId) {
  if (!projectId) return '';
  const rows = getDb()
    .prepare('SELECT name, text FROM documents WHERE project_id = ? ORDER BY created_at DESC LIMIT 10')
    .all(projectId);
  let out = '';
  for (const r of rows) {
    if (!r.text) continue;
    const remaining = MAX_DOC_CHARS - out.length;
    if (remaining <= 0) break;
    out += `--- ${r.name} ---\n${r.text.slice(0, remaining)}\n`;
  }
  return out;
}

export async function handleChat({ conversationId, projectId, processId, message }) {
  let conv =
    (conversationId && getConversation(conversationId)) ||
    {
      id: genId('conv'),
      projectId: projectId ?? null,
      processId: processId ?? null,
      messages: [],
      state: {},
    };
  if (processId) conv.processId = processId;

  const history = conv.messages;
  let reply;

  if (conv.processId) {
    reply = await runEdit(conv, message);
  } else {
    reply = await runIntake(conv, message);
  }

  conv.messages = [
    ...history,
    { role: 'user', text: message },
    { role: 'ai', text: reply.text, kind: reply.kind },
  ];
  saveConversation(conv);
  return { conversationId: conv.id, reply };
}

async function runIntake(conv, message) {
  const project = conv.projectId ? store.getProject(conv.projectId) : null;
  const documentsText = projectDocumentsText(conv.projectId);
  const prompt = intakePrompt({
    history: conv.messages,
    message,
    documentsText,
    projectName: project?.name,
  });
  const { result, fallback, providerError } = await callAi({
    action: 'intake',
    system: prompt.system,
    user: prompt.user,
    hint: { action: 'intake', payload: { message, history: conv.messages, documentsText } },
    schema: IntakeReplySchema,
  });

  const note = fallback
    ? `\n\n(Note: the configured AI provider was unreachable — ${providerError}. This response came from the offline demo analyst.)`
    : '';

  if (result.action === 'ask') {
    return { kind: 'questions', text: (result.message || 'I need a bit more information:') + note, questions: result.questions };
  }
  if (result.action === 'generate' && result.processMap) {
    const parsed = parseProcessMap(result.processMap);
    if (!parsed.ok) {
      // Should be rare: schema-level repair failed even after the corrective round-trip.
      return {
        kind: 'error',
        text:
          'I generated a process model but it failed validation and could not be repaired automatically ' +
          `(${parsed.errors.slice(0, 3).join('; ')}). Please try rephrasing your description.` + note,
      };
    }
    const laidOut = applyAutoLayout(parsed.map);
    laidOut.metadata = { ...laidOut.metadata, generatedBy: laidOut.metadata?.generatedBy || 'ai' };
    const proc = store.createProcess({
      projectId: conv.projectId,
      name: laidOut.name,
      map: laidOut,
      level: laidOut.level ?? 1,
    });
    conv.processId = null; // intake conversation stays in intake mode
    return {
      kind: 'generated',
      text: (result.message || `I created the process map "${laidOut.name}". Opening it now…`) + note,
      processId: proc.id,
      warnings: parsed.warnings,
    };
  }
  return { kind: 'answer', text: (result.message || 'Understood.') + note };
}

async function runEdit(conv, message) {
  const proc = store.getProcess(conv.processId);
  if (!proc) return { kind: 'error', text: 'This process no longer exists.' };
  const analysis = analyzeMap(proc.map);
  const prompt = editPrompt({ map: proc.map, message, analysis });
  const { result, fallback, providerError } = await callAi({
    action: 'edit',
    system: prompt.system,
    user: prompt.user,
    hint: { action: 'edit', payload: { message, map: proc.map, analysis } },
    schema: EditReplySchema,
  });

  const note = fallback
    ? `\n\n(Note: the configured AI provider was unreachable — ${providerError}. This response came from the offline demo analyst.)`
    : '';

  if (result.action === 'edit') {
    const { map: updated, applied, errors } = applyOperations(proc.map, result.operations);
    const check = parseProcessMap(updated);
    if (!check.ok || applied.length === 0) {
      return {
        kind: 'error',
        text:
          `I could not apply that change safely${errors.length ? ` (${errors.slice(0, 3).join('; ')})` : ''}. ` +
          'The map was NOT modified. Try describing the change with the activity names shown on the map.' + note,
      };
    }
    store.updateProcessMap(proc.id, check.map, { versionLabel: `AI: ${message.slice(0, 60)}`, source: 'ai' });
    const summary = `${result.message || 'Done.'}${errors.length ? `\n\n(Skipped: ${errors.join('; ')})` : ''}`;
    return { kind: 'edited', text: summary + note, summary: applied.join(' · '), applied };
  }
  if (result.action === 'highlight') {
    const nodeIds = result.nodeIds.length
      ? result.nodeIds.filter((id) => proc.map.nodes.some((n) => n.id === id))
      : analysis.bottlenecks.map((b) => b.nodeId);
    return { kind: 'highlight', text: result.message || `Highlighted ${nodeIds.length} step(s).`, nodeIds };
  }
  return { kind: 'answer', text: (result.message || 'Understood.') + note };
}

export async function runInsights(processId) {
  const proc = store.getProcess(processId);
  if (!proc) {
    const err = new Error('Process not found');
    err.status = 404;
    throw err;
  }
  const analysis = analyzeMap(proc.map);
  const prompt = insightsPrompt({ map: proc.map, analysis });
  const { result, fallback } = await callAi({
    action: 'insights',
    system: prompt.system,
    user: prompt.user,
    hint: { action: 'insights', payload: { map: proc.map, analysis } },
    schema: InsightsReplySchema,
  });
  return { narrative: result.narrative, analysis, fallback };
}

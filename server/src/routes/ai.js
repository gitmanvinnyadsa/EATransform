import { Router } from 'express';
import { config } from '../config.js';
import { isConfigured } from '../ai/providers/index.js';
import { handleChat, runInsights } from '../ai/orchestrator.js';
import { aiUsageSummary, getProcess } from '../store.js';

const router = Router();

router.get('/status', (req, res) => {
  const configured = isConfigured(config.ai);
  res.json({
    configured,
    provider: configured ? config.ai.provider : 'mock (offline demo analyst)',
    model: configured ? config.ai.model : 'mock-analyst-1',
    setupHint: configured
      ? null
      : 'Copy .env.example to .env, set AI_API_KEY (free Gemini keys: https://aistudio.google.com/apikey), then restart. See docs/AI_SETUP.md.',
  });
});

router.post('/chat', async (req, res, next) => {
  try {
    const { conversationId, projectId, processId, message } = req.body || {};
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'message is required' });
    }
    if (!processId && !projectId) {
      return res.status(400).json({ error: 'projectId or processId is required' });
    }
    const out = await handleChat({
      conversationId,
      projectId,
      processId,
      message: message.trim().slice(0, 8000),
    });
    res.json({ ...out, aiConfigured: isConfigured(config.ai) });
  } catch (err) {
    next(err);
  }
});

// Direct one-shot edit endpoint (used by tests and integrations).
router.post('/edit', async (req, res, next) => {
  try {
    const { processId, instruction } = req.body || {};
    if (!processId || !getProcess(processId)) return res.status(404).json({ error: 'Process not found' });
    if (!instruction) return res.status(400).json({ error: 'instruction is required' });
    const out = await handleChat({ processId, message: String(instruction).slice(0, 8000) });
    res.json(out);
  } catch (err) {
    next(err);
  }
});

router.post('/insights', async (req, res, next) => {
  try {
    const { processId } = req.body || {};
    if (!processId) return res.status(400).json({ error: 'processId is required' });
    res.json(await runInsights(processId));
  } catch (err) {
    next(err);
  }
});

router.get('/usage', (req, res) => {
  res.json(aiUsageSummary());
});

export default router;

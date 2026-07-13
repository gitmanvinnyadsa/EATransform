/**
 * AI service layer: the single gateway between the application and any AI
 * provider. Handles retries, timeouts, JSON extraction/repair, schema
 * validation with automatic re-prompting, usage logging, and fallback to
 * the offline analyst when the real provider is unreachable.
 */
import { z } from 'zod';
import { config } from '../config.js';
import { getProvider, isConfigured } from './providers/index.js';
import { createMockProvider } from './providers/mock.js';
import { extractJson } from './jsonRepair.js';
import { logAiUsage } from '../store.js';

const QuestionSchema = z.object({ question: z.string(), why: z.string().optional().default('') });

export const IntakeReplySchema = z.object({
  action: z.enum(['ask', 'generate', 'answer']),
  message: z.string().optional().default(''),
  questions: z.array(QuestionSchema).optional().default([]),
  processMap: z.any().optional().nullable(),
});

export const EditReplySchema = z.object({
  action: z.enum(['edit', 'highlight', 'answer']),
  message: z.string().optional().default(''),
  operations: z.array(z.any()).optional().default([]),
  nodeIds: z.array(z.string()).optional().default([]),
});

export const InsightsReplySchema = z.object({ narrative: z.string().min(1) });

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Call the configured provider expecting schema-valid JSON back.
 * - retries transient failures with backoff
 * - re-prompts once with the validation error when the JSON shape is wrong
 * - falls back to the offline analyst if the provider is completely down
 *   (marked in the result so the UI can tell the user)
 */
export async function callAi({ action, system, user, hint, schema, aiConfig = config.ai }) {
  const provider = getProvider(aiConfig);
  const maxRetries = Math.max(0, aiConfig.maxRetries);
  let lastErr;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const started = Date.now();
    try {
      let text = await provider.complete({ system, user, hint });
      let parsed;
      try {
        parsed = schema.parse(extractJson(text));
      } catch (validationErr) {
        // One corrective round-trip: show the model its own output + the error.
        const fixText = await provider.complete({
          system,
          user:
            `${user}\n\nYour previous response was invalid: ${validationErr.message}\n` +
            `Previous response:\n${String(text).slice(0, 4000)}\n\n` +
            `Respond again with ONLY the corrected JSON.`,
          hint,
        });
        parsed = schema.parse(extractJson(fixText));
      }
      logAiUsage({
        provider: provider.name,
        model: provider.model,
        action,
        ok: true,
        durationMs: Date.now() - started,
        inputChars: (system?.length || 0) + (user?.length || 0),
        outputChars: JSON.stringify(parsed).length,
      });
      return { result: parsed, provider: provider.name, fallback: false };
    } catch (err) {
      lastErr = err;
      logAiUsage({
        provider: provider.name,
        model: provider.model,
        action,
        ok: false,
        durationMs: Date.now() - started,
        inputChars: (system?.length || 0) + (user?.length || 0),
        outputChars: 0,
        error: String(err.message).slice(0, 300),
      });
      const retryable = err.retryable || err.name === 'AbortError' || err.code === 'AI_BAD_JSON' || /fetch failed/i.test(String(err.message));
      if (attempt < maxRetries && retryable) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      break;
    }
  }

  // Full provider failure → offline analyst fallback (when we weren't already on it).
  if (provider.name !== 'mock' && hint) {
    try {
      const mock = createMockProvider();
      const text = await mock.complete({ hint });
      const parsed = schema.parse(extractJson(text));
      return { result: parsed, provider: 'mock', fallback: true, providerError: lastErr?.message };
    } catch {
      /* fall through to throw */
    }
  }
  const err = new Error(
    `AI request failed${lastErr ? `: ${lastErr.message}` : ''}. ` +
      (isConfigured(aiConfig)
        ? 'Please try again; if this persists check your API key, model name and network.'
        : 'No AI API key is configured — see Settings for setup instructions.')
  );
  err.status = 502;
  throw err;
}

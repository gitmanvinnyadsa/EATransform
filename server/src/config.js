import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

// Load .env from the project root (and server/ as fallback), never crash if absent.
dotenv.config({ path: path.join(ROOT, '.env') });
dotenv.config({ path: path.join(ROOT, 'server', '.env') });

const DEFAULT_MODELS = {
  gemini: 'gemini-2.0-flash',
  anthropic: 'claude-sonnet-5',
  openai: 'gpt-4o-mini',
  mock: 'mock-analyst-1',
};

export function loadConfig(env = process.env) {
  const provider = (env.AI_PROVIDER || 'gemini').toLowerCase().trim();
  const apiKey =
    env.AI_API_KEY ||
    env.GEMINI_API_KEY ||
    env.GOOGLE_API_KEY ||
    env.ANTHROPIC_API_KEY ||
    env.OPENAI_API_KEY ||
    '';
  return {
    port: Number(env.PORT) || 4000,
    dataDir: env.DATA_DIR ? path.resolve(env.DATA_DIR) : path.join(ROOT, 'data'),
    ai: {
      provider,
      apiKey: apiKey.trim(),
      model: (env.AI_MODEL || DEFAULT_MODELS[provider] || DEFAULT_MODELS.gemini).trim(),
      timeoutMs: Number(env.AI_TIMEOUT_MS) || 60000,
      maxRetries: Number(env.AI_MAX_RETRIES ?? 2),
    },
  };
}

export const config = loadConfig();

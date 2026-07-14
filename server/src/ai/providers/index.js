import { createGeminiProvider } from './gemini.js';
import { createAnthropicProvider } from './anthropic.js';
import { createOpenAiProvider } from './openai.js';
import { createGroqProvider } from './groq.js';
import { createMockProvider } from './mock.js';

const FACTORIES = {
  gemini: createGeminiProvider,
  anthropic: createAnthropicProvider,
  openai: createOpenAiProvider,
  groq: createGroqProvider,
  mock: createMockProvider,
};

/**
 * Provider registry. Swapping AI providers is configuration-only:
 * set AI_PROVIDER / AI_API_KEY / AI_MODEL in .env — no code changes.
 * With no key configured we transparently use the offline mock analyst.
 */
export function getProvider(aiConfig) {
  const { provider, apiKey } = aiConfig;
  if (provider === 'mock' || !apiKey) return createMockProvider();
  const factory = FACTORIES[provider];
  if (!factory) {
    const err = new Error(
      `Unknown AI_PROVIDER "${provider}". Supported: ${Object.keys(FACTORIES).join(', ')}`
    );
    err.status = 500;
    throw err;
  }
  return factory(aiConfig);
}

export function isConfigured(aiConfig) {
  return Boolean(aiConfig.apiKey) && aiConfig.provider !== 'mock';
}

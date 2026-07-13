/** Anthropic Claude provider (REST). */
import { httpError } from './gemini.js';

export function createAnthropicProvider({ apiKey, model, timeoutMs }) {
  return {
    name: 'anthropic',
    model,
    async complete({ system, user, temperature = 0.4 }) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          signal: ctrl.signal,
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            max_tokens: 8192,
            temperature,
            system: `${system}\n\nRespond with valid JSON only — no prose, no markdown fences.`,
            messages: [{ role: 'user', content: user }],
          }),
        });
        if (!res.ok) throw httpError('Anthropic', res.status, await res.text().catch(() => ''));
        const data = await res.json();
        const text = (data?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
        if (!text) throw new Error('Anthropic returned an empty response');
        return text;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** OpenAI provider (REST). */
import { httpError } from './gemini.js';

export function createOpenAiProvider({ apiKey, model, timeoutMs }) {
  return {
    name: 'openai',
    model,
    async complete({ system, user, temperature = 0.4 }) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          signal: ctrl.signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            temperature,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
          }),
        });
        if (!res.ok) throw httpError('OpenAI', res.status, await res.text().catch(() => ''));
        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content ?? '';
        if (!text) throw new Error('OpenAI returned an empty response');
        return text;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

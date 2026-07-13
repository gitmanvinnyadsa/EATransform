/** Google Gemini provider (REST, no SDK needed). */

export function createGeminiProvider({ apiKey, model, timeoutMs }) {
  return {
    name: 'gemini',
    model,
    async complete({ system, user, temperature = 0.4 }) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model
      )}:generateContent`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          method: 'POST',
          signal: ctrl.signal,
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: user }] }],
            generationConfig: {
              temperature,
              maxOutputTokens: 8192,
              responseMimeType: 'application/json',
            },
          }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw httpError('Gemini', res.status, body);
        }
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
        if (!text) throw new Error(`Gemini returned an empty response (finishReason: ${data?.candidates?.[0]?.finishReason || 'unknown'})`);
        return text;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export function httpError(provider, status, body) {
  let hint = '';
  if (status === 401 || status === 403) hint = ' — check that your API key is valid.';
  else if (status === 404) hint = ' — the configured model was not found; check AI_MODEL.';
  else if (status === 429) hint = ' — rate limit or quota exceeded; wait a moment and retry.';
  else if (status >= 500) hint = ' — the AI provider is having issues; retrying may help.';
  const err = new Error(`${provider} API error ${status}${hint}`);
  err.status = status;
  err.retryable = status === 429 || status >= 500;
  err.body = String(body).slice(0, 500);
  return err;
}

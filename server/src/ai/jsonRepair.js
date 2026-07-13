/**
 * Tolerant JSON extraction/repair for AI responses.
 * Models occasionally wrap JSON in markdown fences, prepend prose, or leave
 * trailing commas. We never let that reach the UI: extract, repair, or fail
 * with a clear error.
 */

export function extractJson(text) {
  if (text == null) throw new Error('Empty AI response');
  let s = String(text).trim();

  // Strip markdown code fences.
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();

  // Fast path.
  try {
    return JSON.parse(s);
  } catch {
    /* continue */
  }

  // Find the outermost JSON object/array in the text.
  const start = s.search(/[[{]/);
  if (start === -1) throw new Error('AI response contained no JSON');
  const open = s[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  let esc = false;
  let end = -1;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  let candidate = end !== -1 ? s.slice(start, end + 1) : s.slice(start);

  try {
    return JSON.parse(candidate);
  } catch {
    /* try repairs */
  }

  // Common repairs: trailing commas, unquoted NaN/Infinity, smart quotes.
  let repaired = candidate
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/\bNaN\b|\bInfinity\b|\b-Infinity\b/g, 'null');

  try {
    return JSON.parse(repaired);
  } catch {
    /* try closing truncated JSON */
  }

  // Truncated response: close open strings/brackets.
  const stack = [];
  inStr = false;
  esc = false;
  for (const c of repaired) {
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') stack.push('}');
    else if (c === '[') stack.push(']');
    else if (c === '}' || c === ']') stack.pop();
  }
  if (inStr) repaired += '"';
  // Remove a dangling key/comma before closing.
  repaired = repaired.replace(/[,:]\s*$/, '');
  while (stack.length) repaired += stack.pop();

  try {
    return JSON.parse(repaired);
  } catch (err) {
    const e = new Error(`AI returned malformed JSON that could not be repaired: ${err.message}`);
    e.code = 'AI_BAD_JSON';
    throw e;
  }
}

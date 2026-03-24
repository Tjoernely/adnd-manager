/**
 * Client-side Claude API wrapper — proxies through the backend (/api/ai/prompt)
 * to avoid CORS restrictions on direct browser → api.anthropic.com calls.
 *
 * The ANTHROPIC_API_KEY lives only on the server (process.env).
 * The browser just needs a valid session JWT (dnd_token in localStorage).
 */

export function hasAnthropicKey() { return true; }  // key is server-side; always available
export function getAnthropicKey() { return null;  }  // not used client-side

// OpenAI key (for DALL-E image generation) — still stored client-side
export function getOpenAIKey()    { return localStorage.getItem('openai_api_key') ?? null; }
export function hasOpenAIKey()    { return !!getOpenAIKey(); }

/**
 * callClaude — sends systemPrompt + userPrompt to /api/ai/prompt and returns
 * the parsed JSON from the assistant's text response.
 *
 * @param {object} opts
 * @param {string} opts.systemPrompt
 * @param {string} opts.userPrompt
 * @param {number} [opts.maxTokens=4096]
 * @returns {Promise<object>}  parsed JSON
 */
export async function callClaude({ systemPrompt, userPrompt, maxTokens = 4096 }) {
  const token = localStorage.getItem('dnd_token');

  console.log('[callClaude] Proxying via /api/ai/prompt — maxTokens:', maxTokens);

  const resp = await fetch('/api/ai/prompt', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ systemPrompt, userPrompt, maxTokens }),
  });

  if (!resp.ok) {
    let errMsg = `AI proxy error ${resp.status}`;
    try {
      const errBody = await resp.json();
      errMsg = errBody?.error ?? errBody?.detail ?? errMsg;
    } catch (_) {}
    throw new Error(errMsg);
  }

  const data = await resp.json();
  const text = data?.text ?? '';

  console.log('[callClaude] Response length:', text.length, 'chars');

  return extractJSON(text);
}

function extractJSON(text) {
  if (!text) throw new Error('Empty response from AI.');

  // Strip markdown code fences then try direct parse
  let cleaned = text
    .replace(/^```json\s*/im, '')
    .replace(/^```\s*/im,     '')
    .replace(/```\s*$/im,     '')
    .trim();

  try { return JSON.parse(cleaned); } catch (_) {}

  // Find the first { or [ and last matching } or ]
  const firstBrace   = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  const start =
    firstBrace   === -1 ? firstBracket :
    firstBracket === -1 ? firstBrace   :
    Math.min(firstBrace, firstBracket);

  if (start !== -1) {
    const opener    = cleaned[start];
    const closer    = opener === '{' ? '}' : ']';
    const lastClose = cleaned.lastIndexOf(closer);
    if (lastClose !== -1 && lastClose > start) {
      const extracted = cleaned.substring(start, lastClose + 1);
      try { return JSON.parse(extracted); } catch (_) {}
    }
  }

  console.error('[callClaude] Could not extract JSON. Raw text (first 600 chars):\n', text.slice(0, 600));
  throw new Error(
    'AI response did not contain valid JSON.\n\nRaw response: ' + text.slice(0, 500)
  );
}

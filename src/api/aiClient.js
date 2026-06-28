/**
 * Client-side Claude API wrapper — proxies through the backend (/api/ai/prompt)
 * to avoid CORS restrictions on direct browser → api.anthropic.com calls.
 *
 * The ANTHROPIC_API_KEY lives only on the server (process.env).
 * The browser just needs a valid session JWT (dnd_token in localStorage).
 */

export function getAnthropicKey() { return localStorage.getItem('anthropic_api_key') ?? null; }
export function hasAnthropicKey() { return !!getAnthropicKey(); }

// OpenAI key (for gpt-image-1 image generation) — still stored client-side
export function getOpenAIKey()    { return localStorage.getItem('openai_api_key') ?? null; }
export function hasOpenAIKey()    { return !!getOpenAIKey(); }

// ── Browser-side image generation (gpt-image-1, user's own OpenAI key) ────────
// dall-e-3 was REMOVED from OpenAI's API on 2026-05-12, so the old portrait/map
// calls fail. gpt-image-1 uses the SAME /v1/images/generations endpoint but a
// different shape: no `style`, no `response_format`, no `quality:'standard'|'hd'`
// (it's high/medium/low/auto), and it ALWAYS returns base64 (`b64_json`), never
// a URL. This mirrors MapGenerator.jsx's working call. Returns a `data:` URL so
// callers can use it directly as an <img src> or a stored portrait value
// (also strictly better than the old dall-e-3 URLs, which expired after ~1h).
const OPENAI_IMAGE_SIZES = new Set(['1024x1024', '1024x1536', '1536x1024']);
export async function generateOpenAIImage(prompt, { size = '1024x1024', apiKey } = {}) {
  const key = apiKey ?? getOpenAIKey();
  if (!key) throw new Error('No OpenAI API key. Add it in ⚙ Settings.');
  const safeSize = OPENAI_IMAGE_SIZES.has(size) ? size : '1024x1024';
  const resp = await fetch('https://api.openai.com/v1/images/generations', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body:    JSON.stringify({ model: 'gpt-image-1', prompt, n: 1, size: safeSize }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = data?.error?.message ?? `OpenAI ${resp.status}`;
    throw Object.assign(new Error(msg), { code: data?.error?.code ?? data?.error?.type ?? '' });
  }
  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error('gpt-image-1 returned no image data.');
  return `data:image/png;base64,${b64}`;
}

// ── AI feature-gate (2026-06-04) ──────────────────────────────────────────────
// Server-side AI runs on the owner's shared Anthropic key and is locked behind
// owner approval (enforced server-side in requireAiApproval). This reads the
// ai_approved flag off the persisted user (written by useAuth on every /me +
// login). UX only — the server is the real gate. Missing flag → treated as
// unapproved.
export function isAiApproved() {
  try {
    const u = JSON.parse(localStorage.getItem('dnd_user') || 'null');
    return !!(u && u.ai_approved);
  } catch { return false; }
}
// Shown on disabled server-AI buttons. English to match the rest of the UI.
export const AI_APPROVAL_MESSAGE = 'Awaiting approval for AI features';
// True when an error came back from the server-side AI gate (403).
export function isAiNotApprovedError(e) {
  return e?.code === 'ai_not_approved';
}

/**
 * callClaude — sends systemPrompt + userPrompt to /api/ai/prompt and returns
 * the parsed JSON from the assistant's text response.
 *
 * @param {object} opts
 * @param {string} opts.systemPrompt
 * @param {string} opts.userPrompt
 * @param {number} [opts.maxTokens=4096]
 * @param {string} [opts.model]  "claude-opus-4-7" | "claude-sonnet-4-6" | "gpt-5.4"
 *                               omitted → backend defaults to claude-sonnet-4-6
 * @returns {Promise<object>}  parsed JSON
 */
export async function callClaude({ systemPrompt, userPrompt, maxTokens = 4096, model }) {
  const token        = localStorage.getItem('dnd_token');
  const anthropicKey = getAnthropicKey();

  console.log('[callClaude] Proxying via /api/ai/prompt — model:', model ?? '(default)', 'maxTokens:', maxTokens);

  const resp = await fetch('/api/ai/prompt', {
    method: 'POST',
    headers: {
      'Content-Type':    'application/json',
      ...(token        ? { 'Authorization':  `Bearer ${token}` } : {}),
      ...(anthropicKey ? { 'x-anthropic-key': anthropicKey     } : {}),
    },
    body: JSON.stringify({ systemPrompt, userPrompt, maxTokens, ...(model ? { model } : {}) }),
  });

  if (!resp.ok) {
    let errMsg = `AI proxy error ${resp.status}`;
    let errCode = '';
    try {
      const errBody = await resp.json();
      errCode = errBody?.error ?? '';
      errMsg  = errBody?.error ?? errBody?.detail ?? errMsg;
    } catch (_) {}
    // AI feature-gate: surface a friendly, actionable message instead of the
    // raw "ai_not_approved" code, and tag the error so callers can detect it.
    if (errCode === 'ai_not_approved') {
      const e = new Error(AI_APPROVAL_MESSAGE);
      e.code = 'ai_not_approved';
      throw e;
    }
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

  // Detect truncation: a complete JSON value ends with } or ]. If it ends
  // mid-string / mid-array / mid-object, the response almost certainly hit
  // the maxTokens limit — report that clearly instead of a vague parse error.
  const lastChar = cleaned[cleaned.length - 1];
  const looksTruncated = !['}', ']'].includes(lastChar);

  if (looksTruncated) {
    const tail = cleaned.slice(-100);
    throw new Error(
      `AI response was truncated — likely hit the maxTokens limit. ` +
      `Response ended mid-content: "...${tail}". ` +
      `Try a lower detail level or shorter length, or use a model with higher token limit.`
    );
  }

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

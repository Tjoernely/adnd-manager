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

// ── Server-side character/NPC portrait generation (Gemini, shared key) ────────
// Portraits moved OFF the browser-side OpenAI flow (2026-07-05): the server
// generates them with gemini-3.1-flash-image on the owner's GOOGLE_AI_API_KEY
// via POST /api/ai/character-image. No user API key needed — but the route is
// approval-gated (ai_approved) and enforces a per-user daily image cap.
//
// Pass a saved character's id (server reads whitelisted fields from the
// record), inline `fields` (unsaved NPCs / live sheet state), or both — inline
// fields win. The server builds the prompt (full-figure, class+race-derived
// environment) and returns { image: dataURL, prompt, used, cap }.
export const IMAGE_CAP_MESSAGE = 'Daily image limit reached — resets at midnight (UTC).';
export function isImageCapError(e) { return e?.code === 'image_cap_reached'; }

export async function generateCharacterImage({ characterId, fields } = {}) {
  const token = localStorage.getItem('dnd_token');
  const resp = await fetch('/api/ai/character-image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      ...(characterId != null ? { character_id: characterId } : {}),
      ...(fields ? { fields } : {}),
    }),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const errCode = data?.error ?? '';
    if (errCode === 'ai_not_approved') {
      throw Object.assign(new Error(AI_APPROVAL_MESSAGE), { code: 'ai_not_approved' });
    }
    if (errCode === 'image_cap_reached') {
      throw Object.assign(new Error(IMAGE_CAP_MESSAGE), { code: 'image_cap_reached', used: data.used, cap: data.cap });
    }
    throw Object.assign(new Error(data?.detail ?? data?.error ?? `Image generation failed (${resp.status})`), { code: errCode });
  }
  if (!data?.image) throw new Error('Server returned no image.');
  return data;   // { image, prompt, used, cap }
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

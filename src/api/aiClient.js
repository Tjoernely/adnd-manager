/**
 * Client-side Claude (Anthropic) API wrapper.
 * Key stored in localStorage as 'anthropic_api_key'.
 *
 * Requires the 'anthropic-dangerous-direct-browser-access' header for CORS.
 * See: https://docs.anthropic.com/en/api/direct-browser-access
 */

const CLAUDE_MODEL    = 'claude-sonnet-4-20250514';
const CLAUDE_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const TIMEOUT_MS      = 60_000; // 60-second hard timeout (DALL-E can be slow)

export function getAnthropicKey() { return localStorage.getItem('anthropic_api_key') ?? null; }
export function getOpenAIKey()    { return localStorage.getItem('openai_api_key')    ?? null; }
export function hasAnthropicKey() { return !!getAnthropicKey(); }
export function hasOpenAIKey()    { return !!getOpenAIKey(); }

/**
 * callClaude — sends a request to the Anthropic Messages API and returns
 * parsed JSON from the assistant's response.
 *
 * @param {object} opts
 * @param {string} opts.systemPrompt
 * @param {string} opts.userPrompt
 * @param {number} [opts.maxTokens=4096]
 * @param {string} [opts.model]
 * @returns {Promise<object>}  parsed JSON
 */
export async function callClaude({ systemPrompt, userPrompt, maxTokens = 4096, model = CLAUDE_MODEL }) {
  const apiKey = getAnthropicKey();
  if (!apiKey) {
    throw new Error('No Anthropic API key configured. Click ⚙ Settings to add your key.');
  }

  console.log('[callClaude] Starting request — model:', model, 'maxTokens:', maxTokens);
  console.log('[callClaude] Prompt length:', userPrompt.length, 'chars');

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => {
    console.error('[callClaude] Request timed out after', TIMEOUT_MS / 1000, 's');
    controller.abort();
  }, TIMEOUT_MS);

  let resp;
  try {
    resp = await fetch(CLAUDE_ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type':                             'application/json',
        'x-api-key':                                apiKey,
        'anthropic-version':                        '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: userPrompt }],
      }),
    });
  } catch (fetchErr) {
    clearTimeout(timeoutId);
    if (fetchErr.name === 'AbortError') {
      throw new Error(
        `Anthropic API request timed out after ${TIMEOUT_MS / 1000} seconds. ` +
        'Verify your API key is correct in ⚙ Settings and try again.'
      );
    }
    console.error('[callClaude] fetch threw:', fetchErr);
    throw new Error(`Network error: ${fetchErr.message}`);
  }
  clearTimeout(timeoutId);

  console.log('[callClaude] Response status:', resp.status);

  if (!resp.ok) {
    let errMsg = `Anthropic API error ${resp.status}`;
    try {
      const errBody = await resp.json();
      console.error('[callClaude] Error body:', errBody);
      errMsg = errBody?.error?.message ?? errMsg;
    } catch (_) {}
    throw new Error(errMsg);
  }

  const data = await resp.json();
  console.log('[callClaude] Response received. Stop reason:', data.stop_reason,
              '| Output tokens:', data.usage?.output_tokens);

  const text = (data.content ?? [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  console.log('[callClaude] Raw text length:', text.length, 'chars');

  return extractJSON(text);
}

function extractJSON(text) {
  if (!text) throw new Error('Empty response from AI.');

  // 1. Strip markdown code fences then try direct parse
  let cleaned = text
    .replace(/^```json\s*/im, '')
    .replace(/^```\s*/im,     '')
    .replace(/```\s*$/im,     '')
    .trim();

  try { return JSON.parse(cleaned); } catch (_) {}

  // 2. Find the first { or [ and the last matching } or ]
  //    Handles preamble text and truncated responses
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
    'AI response did not contain valid JSON.\n\n' +
    'Raw response: ' + text.slice(0, 500)
  );
}

/**
 * Client-side Claude (Anthropic) API wrapper.
 * Key stored in localStorage as 'anthropic_api_key'.
 *
 * Requires the 'anthropic-dangerous-direct-browser-access' header for CORS.
 * See: https://docs.anthropic.com/en/api/direct-browser-access
 */

const CLAUDE_MODEL    = 'claude-sonnet-4-5';
const CLAUDE_ENDPOINT = 'https://api.anthropic.com/v1/messages';

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

  const resp = await fetch(CLAUDE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `Anthropic API error ${resp.status}`);
  }

  const data = await resp.json();
  const text = data.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

  return extractJSON(text);
}

function extractJSON(text) {
  try { return JSON.parse(text.trim()); } catch (_) {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch (_) {} }
  throw new Error('AI response did not contain valid JSON.\n\nRaw response: ' + text.slice(0, 400));
}

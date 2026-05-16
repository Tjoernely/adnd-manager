/**
 * Type declarations for src/api/aiClient.js
 *
 * The aiClient is a thin proxy to the /api/ai/prompt endpoint. It builds the
 * request, calls the server, and returns the parsed JSON object directly
 * (it internally runs extractJSON + JSON.parse before returning).
 *
 * If the JS file's behavior changes, update this shim — or convert aiClient.js
 * to TypeScript so the types are co-located with the implementation.
 */

export interface ClaudeRequest {
  systemPrompt: string;
  userPrompt: string;
  /** Defaults to 4096 in aiClient.js if omitted. */
  maxTokens?: number;
}

/**
 * Calls Claude via the server proxy.
 *
 * Returns the parsed JSON object from the AI response — aiClient.js already
 * runs JSON.parse() internally, so callers receive an object, not a string.
 *
 * Throws if the network call fails or if the response cannot be parsed.
 */
export function callClaude(req: ClaudeRequest): Promise<unknown>;

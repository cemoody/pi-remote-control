/**
 * Hard cap on raw prompt text. Pasted base64 screenshots routinely run >100 KB
 * and bloat the agent's context window; the cap rejects them before they ever
 * reach the LLM and keeps the session JSONL replay-safe.
 *
 * Images should be sent as attachments via the paperclip / paste-as-image path.
 */
export const MAX_PROMPT_CHARS = 32_000;

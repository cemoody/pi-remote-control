/**
 * Shared helper that collapses the duplicated session-open +
 * getMessages + findMessageById dance used by the
 * /api/sessions/:id/messages/:msgid/{images/N,details,tool-output}
 * routes in http-api-server.ts.
 *
 * Extracted to its own module so it's directly unit-testable without the
 * full HttpApiServerContext shape. The route handlers pass in a
 * `getOrOpenSession` callback bound to the request's context.
 *
 * Pinned by tests/unit/http-api-message-lookup.test.ts.
 */
import type { SessionMessage } from "./pi/types.js";

export interface MessageLookupContext {
  readonly getOrOpenSession: (sessionId: string) => Promise<{
    readonly handle: { getMessages(): Promise<readonly SessionMessage[]> };
  }>;
}

/**
 * Resolve a synthetic per-session message id of the form `${timestamp}-${index}`
 * back to the matching SessionMessage. The synthetic id is what
 * toDashboardMessages emits and what the message-detail HTTP routes
 * receive in their URLs.
 */
export async function lookupSessionMessage(
  context: MessageLookupContext,
  sessionId: string,
  syntheticMessageId: string,
): Promise<SessionMessage | undefined> {
  const session = await context.getOrOpenSession(sessionId);
  const messages = await session.handle.getMessages();
  return findSessionMessageBySyntheticId(messages, syntheticMessageId);
}

export function findSessionMessageBySyntheticId(
  messages: readonly SessionMessage[],
  syntheticMessageId: string,
): SessionMessage | undefined {
  for (let index = 0; index < messages.length; index++) {
    const candidate = messages[index]!;
    if (`${candidate.timestamp}-${index}` === syntheticMessageId) return candidate;
  }

  // Tail-windowed /messages calls synthesize ids with the index inside that
  // returned window, not the absolute transcript index. Detail URLs generated
  // from such a window therefore cannot be resolved by absolute index. Fall
  // back to timestamp lookup so lazy image/details/tool-output/artifact routes
  // still work for the message the user just rendered. Timestamps are normally
  // unique in Pi transcripts; if not, return the first matching message rather
  // than failing the lazy load entirely.
  const match = syntheticMessageId.match(/^(-?\d+)-\d+$/);
  if (!match) return undefined;
  const timestamp = Number(match[1]);
  if (!Number.isFinite(timestamp)) return undefined;
  return messages.find((message) => message.timestamp === timestamp);
}

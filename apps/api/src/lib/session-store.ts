import { Session } from "@ai-tutor/core";

/**
 * In-memory session store keyed by client-generated UUID.
 *
 * This store holds the full message history (including thinking blocks) that
 * must stay in memory between API calls to maintain conversation context.
 * The Supabase database stores a durable log for analytics and parent review;
 * it is NOT a substitute for this store.
 *
 * Restarting the server clears all sessions.  Acceptable for single-student
 * use; not acceptable at scale.
 */
const store = new Map<string, Session>();

export function getOrCreateSession(id: string): Session {
  if (!store.has(id)) {
    store.set(id, new Session());
  }
  return store.get(id)!;
}

export function getSession(id: string): Session | undefined {
  return store.get(id);
}

export function removeSession(id: string): void {
  store.delete(id);
}

export function getAllSessions(): Map<string, Session> {
  return store;
}

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

// Sessions currently being torn down by the inactivity sweep. Kept in the
// store until teardown finishes to prevent chat requests from re-creating them
// as empty sessions against a DB row that is about to be marked ended.
const reapingSet = new Set<string>();

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

export function getAllSessions(): IterableIterator<[string, Session]> {
  return store.entries();
}

export function markReaping(id: string): void {
  reapingSet.add(id);
}

export function unmarkReaping(id: string): void {
  reapingSet.delete(id);
}

export function isReaping(id: string): boolean {
  return reapingSet.has(id);
}

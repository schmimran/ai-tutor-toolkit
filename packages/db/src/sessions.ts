import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbSession, DbSessionInsert, DbSessionUpdate } from "./types.js";
import { assertRow } from "./assert.js";

/** Insert a new session row.  Returns the created row. */
export async function createSession(
  client: SupabaseClient,
  insert: DbSessionInsert
): Promise<DbSession> {
  const { data, error } = await client
    .from("sessions")
    .insert(insert)
    .select()
    .single();

  return assertRow(data, error, "createSession");
}

/** Fetch a single session by ID.  Returns null if not found. */
export async function getSession(
  client: SupabaseClient,
  id: string
): Promise<DbSession | null> {
  const { data, error } = await client
    .from("sessions")
    .select()
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`getSession: ${error.message}`);
  return data;
}

/** Apply a partial update to a session row.  Returns the updated row. */
export async function updateSession(
  client: SupabaseClient,
  id: string,
  update: DbSessionUpdate
): Promise<DbSession> {
  const { data, error } = await client
    .from("sessions")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  return assertRow(data, error, "updateSession");
}

/**
 * Look up the email address of the authenticated user who owns a session.
 * Returns null if the session has no user_id or if any lookup fails.
 */
export async function getUserEmailForSession(
  client: SupabaseClient,
  sessionId: string,
): Promise<string | null> {
  try {
    const session = await getSession(client, sessionId);
    if (!session?.user_id) return null;

    const { data, error } = await client.auth.admin.getUserById(session.user_id);
    if (error || !data?.user?.email) return null;

    return data.user.email;
  } catch {
    return null;
  }
}

export interface UserSessionInfo {
  email: string;
  name: string | null;
}

/**
 * Look up the name and email of the authenticated user who owns a session.
 * Returns null if the session has no user_id or if any lookup fails.
 */
export async function getUserInfoForSession(
  client: SupabaseClient,
  sessionId: string,
): Promise<UserSessionInfo | null> {
  try {
    const session = await getSession(client, sessionId);
    if (!session?.user_id) return null;

    const { data, error } = await client.auth.admin.getUserById(session.user_id);
    if (error || !data?.user?.email) return null;

    return {
      email: data.user.email,
      name: (data.user.user_metadata?.name as string | undefined) ?? null,
    };
  } catch {
    return null;
  }
}

export interface UserSessionProfile {
  email: string;
  name: string | null;
  emailTranscriptsEnabled: boolean;
}

/**
 * Look up the user's email, name, and transcript preference for a session.
 * Returns null if the session has no user_id or if any lookup fails.
 * emailTranscriptsEnabled defaults to true for users without a profiles row.
 */
export async function getUserProfileForSession(
  client: SupabaseClient,
  sessionId: string,
): Promise<UserSessionProfile | null> {
  try {
    const session = await getSession(client, sessionId);
    if (!session?.user_id) return null;

    const [authResult, profileResult] = await Promise.all([
      client.auth.admin.getUserById(session.user_id),
      client
        .from("profiles")
        .select("email_transcripts_enabled")
        .eq("user_id", session.user_id)
        .maybeSingle(),
    ]);

    if (authResult.error || !authResult.data?.user?.email) return null;

    const profileData = profileResult.data as
      | { email_transcripts_enabled: boolean | null }
      | null;

    return {
      email: authResult.data.user.email,
      name: (authResult.data.user.user_metadata?.name as string | undefined) ?? null,
      emailTranscriptsEnabled: profileData?.email_transcripts_enabled ?? true,
    };
  } catch {
    return null;
  }
}

/**
 * Return ended sessions belonging to a specific user, most recent first.
 * Used by the history page to list past tutoring sessions.
 */
export async function getSessionsByUser(
  client: SupabaseClient,
  userId: string,
): Promise<DbSession[]> {
  const { data, error } = await client
    .from("sessions")
    .select()
    .eq("user_id", userId)
    .not("ended_at", "is", null)
    .order("started_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(`getSessionsByUser: ${error.message}`);
  return data ?? [];
}

/**
 * Fetch feedback (outcome + experience) for a batch of session IDs.
 * Returns a map keyed by session_id.  Sessions with no feedback row are
 * absent from the map.
 */
export async function getFeedbackForSessions(
  client: SupabaseClient,
  sessionIds: string[],
): Promise<Map<string, { outcome: string | null; experience: string | null }>> {
  if (sessionIds.length === 0) return new Map();

  const { data, error } = await client
    .from("session_feedback")
    .select("session_id, outcome, experience")
    .in("session_id", sessionIds);

  if (error) throw new Error(`getFeedbackForSessions: ${error.message}`);

  const map = new Map<string, { outcome: string | null; experience: string | null }>();
  for (const row of (data ?? []) as Array<{
    session_id: string;
    outcome: string | null;
    experience: string | null;
  }>) {
    map.set(row.session_id, { outcome: row.outcome, experience: row.experience });
  }
  return map;
}

/**
 * Aggregate usage stats returned by GET /api/admin/stats.
 *
 * `activeUsers` is a misnomer carried over from the launchpad tile name —
 * it is the count of registered users (from `auth.admin.listUsers`), not a
 * count of distinct session users. The admin UI labels this "Registered
 * Users" so the number is not misleading.
 */
export interface AdminStats {
  totalSessions: number;
  activeUsers: number;
  sessionsToday: number;
  sessionsThisWeek: number;
  avgDurationSeconds: number | null;
}

/**
 * Compute aggregate stats for the admin dashboard.
 *
 * Must be called with the service-role client — bypasses RLS and calls
 * `auth.admin.listUsers`. The avg-duration sample is capped at 500 ended
 * sessions which is fine for an early-stage product.
 */
export async function getAdminStats(
  client: SupabaseClient,
): Promise<AdminStats> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [total, today, week, avgRows, users] = await Promise.all([
    client.from("sessions").select("*", { count: "exact", head: true }),
    client.from("sessions").select("*", { count: "exact", head: true })
      .gte("started_at", todayStart.toISOString()),
    client.from("sessions").select("*", { count: "exact", head: true })
      .gte("started_at", weekStart.toISOString()),
    client.from("sessions").select("started_at, ended_at")
      .not("ended_at", "is", null)
      .limit(500),
    // Registered-user count via the admin API. perPage:1 returns the total
    // via the `total` field without fetching user rows.
    client.auth.admin.listUsers({ perPage: 1 }),
  ]);

  let avgDurationSeconds: number | null = null;
  const rows = (avgRows.data ?? []) as Array<{
    started_at: string;
    ended_at: string;
  }>;
  if (rows.length > 0) {
    const totalMs = rows.reduce(
      (sum, r) =>
        sum + (new Date(r.ended_at).getTime() - new Date(r.started_at).getTime()),
      0,
    );
    avgDurationSeconds = Math.round(totalMs / rows.length / 1000);
  }

  const userTotal =
    (users.data as { total?: number } | null)?.total ?? users.data?.users?.length ?? 0;

  return {
    totalSessions: total.count ?? 0,
    activeUsers: userTotal,
    sessionsToday: today.count ?? 0,
    sessionsThisWeek: week.count ?? 0,
    avgDurationSeconds,
  };
}

/**
 * Row shape returned by GET /api/admin/sessions. Combines `sessions` columns
 * with embedded feedback + evaluation fields and a resolved user email.
 */
export interface AdminSessionRow {
  id: string;
  started_at: string;
  ended_at: string | null;
  user_id: string;
  user_email: string | null;
  model: string | null;
  prompt_name: string | null;
  total_input_tokens: number;
  total_output_tokens: number;
  outcome: string | null;
  experience: string | null;
  has_failures: boolean | null;
}

/**
 * Paginated list of ended sessions across all users with feedback and
 * evaluation fields embedded. Used by the admin dashboard recent-sessions
 * table. Must be called with the service-role client.
 */
export async function getAdminSessionList(
  client: SupabaseClient,
  opts: { limit?: number; offset?: number } = {},
): Promise<{ sessions: AdminSessionRow[]; total: number }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const offset = Math.max(opts.offset ?? 0, 0);

  const { data, error, count } = await client
    .from("sessions")
    .select(
      "id, started_at, ended_at, user_id, model, prompt_name, total_input_tokens, total_output_tokens, session_feedback(outcome, experience), session_evaluations(has_failures)",
      { count: "exact" },
    )
    .not("ended_at", "is", null)
    .order("started_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(`getAdminSessionList: ${error.message}`);

  // Batch user-email lookup to avoid N+1 queries. listUsers paginates at
  // 1000 per page by default; fine for an early-stage product.
  // TODO: pagination cap at 1000 users — implement multi-page fetch if the
  // registered-user count exceeds 1000.
  const emailMap = new Map<string, string>();
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const userIds = [...new Set(
    rows.map((r) => r.user_id as string | null | undefined).filter((u): u is string => Boolean(u)),
  )];
  if (userIds.length > 0) {
    const { data: usersData } = await client.auth.admin.listUsers({ perPage: 1000 });
    for (const u of usersData?.users ?? []) {
      if (u.email) emailMap.set(u.id, u.email);
    }
  }

  // Supabase JS does not emit typed inference for embedded selects, so the
  // mapping step uses `any` for the embedded arrays only.
  const sessions: AdminSessionRow[] = rows.map((r) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = r as any;
    const feedback = Array.isArray(row.session_feedback) ? row.session_feedback[0] : row.session_feedback;
    const evalRow = Array.isArray(row.session_evaluations) ? row.session_evaluations[0] : row.session_evaluations;
    return {
      id: row.id,
      started_at: row.started_at,
      ended_at: row.ended_at ?? null,
      user_id: row.user_id,
      user_email: emailMap.get(row.user_id) ?? null,
      model: row.model ?? null,
      prompt_name: row.prompt_name ?? null,
      total_input_tokens: row.total_input_tokens ?? 0,
      total_output_tokens: row.total_output_tokens ?? 0,
      outcome: feedback?.outcome ?? null,
      experience: feedback?.experience ?? null,
      has_failures: evalRow?.has_failures ?? null,
    };
  });

  return { sessions, total: count ?? 0 };
}

/**
 * Mark a session as ended by setting ended_at to now.
 * Session data (messages, feedback) is retained for analysis.
 */
export async function markSessionEnded(
  client: SupabaseClient,
  id: string
): Promise<void> {
  const { error } = await client
    .from("sessions")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`markSessionEnded: ${error.message}`);
}

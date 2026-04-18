/* global supabase */
// Centralized auth module — wraps @supabase/supabase-js for the whole app.
//
// Responsibilities:
//   - Initialize the Supabase client (once) using config from /api/config.
//   - Expose `window.auth` with a small, opinionated surface:
//       init()                 : Promise<void>         — fetch config, build client, consume URL hash
//       getClient()            : SupabaseClient | null
//       getSession()           : Promise<Session|null>
//       requireSession()       : Promise<Session>     — redirects to /login.html if absent
//       authedFetch(url, init) : Promise<Response>    — attaches bearer + refreshes on 401 once
//       onAuthStateChange(cb)  : subscription
//       signOut()              : Promise<void>        — signs out + redirects to /login.html
//
// Supabase-js handles token storage, auto-refresh, cross-tab sync, and hash
// consumption (type=signup, type=recovery). We don't re-implement any of that.

(function () {
  let client = null;
  let initPromise = null;

  async function loadConfig() {
    const res = await fetch("/api/config", { cache: "no-store" });
    if (!res.ok) throw new Error("config fetch failed: " + res.status);
    return res.json();
  }

  async function buildClient() {
    const cfg = await loadConfig();
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
      throw new Error("supabase config missing from /api/config");
    }
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      throw new Error("supabase-js not loaded (missing CDN script?)");
    }
    return window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "implicit",
      },
    });
  }

  function init() {
    if (!initPromise) {
      initPromise = buildClient().then((c) => { client = c; });
    }
    return initPromise;
  }

  function getClient() {
    return client;
  }

  async function getSession() {
    await init();
    const { data } = await client.auth.getSession();
    return data.session ?? null;
  }

  async function requireSession() {
    const session = await getSession();
    if (!session) {
      window.location.href = "/login.html";
      throw new Error("not_authenticated");
    }
    return session;
  }

  async function authedFetch(url, options) {
    await init();
    const opts = options ? { ...options } : {};
    opts.headers = new Headers(opts.headers || {});
    let session = await getSession();
    if (session?.access_token) {
      opts.headers.set("Authorization", "Bearer " + session.access_token);
    }
    let res = await fetch(url, opts);
    if (res.status !== 401 || !session?.refresh_token) return res;

    // One refresh attempt on 401.
    const refresh = await client.auth.refreshSession({ refresh_token: session.refresh_token });
    if (refresh.error || !refresh.data?.session) {
      // Refresh failed — force re-login.
      window.location.href = "/login.html?reason=session_expired";
      return res;
    }
    session = refresh.data.session;
    opts.headers.set("Authorization", "Bearer " + session.access_token);
    res = await fetch(url, opts);
    return res;
  }

  function onAuthStateChange(cb) {
    return init().then(() => client.auth.onAuthStateChange(cb));
  }

  async function signOut() {
    await init();
    try { await client.auth.signOut(); } catch (e) { /* ignore */ }
    window.location.href = "/login.html";
  }

  window.auth = {
    init,
    getClient,
    getSession,
    requireSession,
    authedFetch,
    onAuthStateChange,
    signOut,
  };
})();

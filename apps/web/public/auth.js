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

  // ── Idle-session enforcement — re-login after 60 min of inactivity ──────────
  const IDLE_KEY   = 'auth.lastActivityAt';
  const IDLE_LIMIT = 60 * 60 * 1000; // 60 minutes; independent of server inactivity sweep (10 min)

  let lastWrite = 0;
  function touchActivity() {
    const now = Date.now();
    if (now - lastWrite < 10_000) return; // throttle: write at most once per 10 s
    lastWrite = now;
    localStorage.setItem(IDLE_KEY, now);
  }

  function isIdleExpired() {
    const raw = localStorage.getItem(IDLE_KEY);
    if (!raw) return false; // absent → treat as just-active (first load or cleared storage)
    return (Date.now() - parseInt(raw, 10)) > IDLE_LIMIT;
  }

  let trackingStarted = false;
  function startActivityTracking() {
    if (trackingStarted) return;
    trackingStarted = true;
    ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'].forEach(evt =>
      document.addEventListener(evt, touchActivity, { passive: true, capture: true })
    );
    touchActivity();
  }

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
        storage: window.localStorage,
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
    if (isIdleExpired()) {
      try { await client.auth.signOut(); } catch (_) { /* ignore */ }
      localStorage.removeItem(IDLE_KEY);
      window.location.href = "/login.html?reason=session_expired";
      throw new Error("idle_timeout");
    }
    startActivityTracking();
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
    localStorage.removeItem(IDLE_KEY);
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

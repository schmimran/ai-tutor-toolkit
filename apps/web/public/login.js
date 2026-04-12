/* login.js — logic for the /login.html entry point.
 *
 * This page gates the main app at /. Users must sign in or register here
 * before accessing the chat. After a successful login, the browser is
 * redirected to / with the auth session stored in sessionStorage.
 */

(function () {
  'use strict';

  var AUTH_KEY = 'authSession';

  function $(id) { return document.getElementById(id); }

  function setMessage(id, msg) {
    var el = $(id);
    if (!msg) { el.style.display = 'none'; el.textContent = ''; return; }
    el.textContent = msg;
    el.style.display = '';
  }

  function setError(msg) { setMessage('login-error', msg); }
  function setSuccess(msg) { setMessage('login-success', msg); }

  function loadAuth() {
    try {
      var raw = sessionStorage.getItem(AUTH_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function saveAuth(obj) {
    sessionStorage.setItem(AUTH_KEY, JSON.stringify(obj));
  }

  function clearAuth() {
    sessionStorage.removeItem(AUTH_KEY);
  }

  function isAuthValid(auth) {
    if (!auth || !auth.accessToken) return false;
    if (auth.expiresAt && Date.now() / 1000 > auth.expiresAt) return false;
    return true;
  }

  /* ── Verify overlay helpers ─────────────────────────────────────────── */
  var _countdownTimer = null;
  var _countdownEnd = 0;

  function startCountdown() {
    _countdownEnd = Date.now() + 60 * 60 * 1000; // 60 minutes
    tickCountdown();
    _countdownTimer = setInterval(tickCountdown, 1000);
  }

  function tickCountdown() {
    var remaining = Math.max(0, _countdownEnd - Date.now());
    if (remaining === 0) {
      $('verify-timer').textContent = 'Expired';
      stopCountdown();
      return;
    }
    var totalSec = Math.ceil(remaining / 1000);
    var mm = Math.floor(totalSec / 60);
    var ss = totalSec % 60;
    $('verify-timer').textContent =
      (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss;
  }

  function stopCountdown() {
    if (_countdownTimer) { clearInterval(_countdownTimer); _countdownTimer = null; }
  }

  function showVerifyOverlay(email) {
    setError(null);
    setSuccess(null);
    $('verify-email-address').textContent = email;
    $('verify-overlay').style.display = 'flex';
    document.querySelector('.login-tabs').style.display = 'none';
    $('login-panel').classList.remove('active');
    $('register-panel').classList.remove('active');
    startCountdown();
  }

  function hideVerifyOverlay() {
    stopCountdown();
    var email = $('verify-email-address').textContent || '';
    $('verify-overlay').style.display = 'none';
    document.querySelector('.login-tabs').style.display = '';
    // Restore to sign-in tab
    tabs.forEach(function (t) {
      var isLogin = t.dataset.tab === 'login';
      t.classList.toggle('active', isLogin);
      t.setAttribute('aria-selected', isLogin ? 'true' : 'false');
    });
    $('login-panel').classList.add('active');
    $('register-panel').classList.remove('active');
    // Pre-fill sign-in email field with the registered email
    if (email) $('login-email').value = email;
    setError(null);
    setSuccess(null);
  }

  /* ── Tabs ──────────────────────────────────────────────────────────── */
  var tabs = document.querySelectorAll('.login-tab');
  var panels = {
    login: $('login-panel'),
    register: $('register-panel'),
  };
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      // Dismiss verify overlay if visible
      if ($('verify-overlay').style.display !== 'none') {
        hideVerifyOverlay();
      }
      var target = tab.dataset.tab;
      tabs.forEach(function (t) {
        var active = t === tab;
        t.classList.toggle('active', active);
        t.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      Object.keys(panels).forEach(function (key) {
        panels[key].classList.toggle('active', key === target);
      });
      // Dismiss forgot-password panel on tab click
      $('forgot-panel').classList.remove('active');
      setError(null);
      setSuccess(null);
      var resendBtn = $('btn-resend-verification');
      if (resendBtn) resendBtn.style.display = 'none';
    });
  });

  /* ── Config (contact email) ────────────────────────────────────────── */
  fetch('/api/config').then(function (r) { return r.json(); }).then(function (cfg) {
    var email = (cfg && cfg.contactEmail) || '';
    if (email) {
      $('login-contact-note').textContent = 'Need access or have questions? Email ' + email + '.';
    }
  }).catch(function () { /* silent */ });

  /* ── Register ──────────────────────────────────────────────────────── */
  function computeAgeYears(birthdate) {
    // birthdate in YYYY-MM-DD format
    var parts = birthdate.split('-');
    if (parts.length !== 3) return NaN;
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    var d = parseInt(parts[2], 10);
    var today = new Date();
    var age = today.getFullYear() - y;
    var monthDiff = (today.getMonth() + 1) - m;
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < d)) {
      age -= 1;
    }
    return age;
  }

  function resetRegisterForm() {
    $('register-name').value = '';
    $('register-email').value = '';
    $('register-password').value = '';
    $('register-birthdate').value = '';
    $('register-grade').value = '';
    $('register-state').value = '';
    $('register-country').value = '';
    $('register-terms').checked = false;
  }

  $('register-panel').addEventListener('submit', function (e) {
    e.preventDefault();
    setError(null);
    var name = $('register-name').value.trim();
    var email = $('register-email').value.trim();
    var password = $('register-password').value;
    var birthdate = $('register-birthdate').value;
    var gradeLevel = $('register-grade').value;
    var state = $('register-state').value.trim();
    var country = $('register-country').value.trim();
    var terms = $('register-terms').checked;

    if (!name) { setError('Please enter your full name.'); return; }
    if (!birthdate) { setError('Please enter your birthdate.'); return; }
    if (!gradeLevel) { setError('Please select a grade level.'); return; }
    if (!terms) { setError('Please accept the terms to continue.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }

    var age = computeAgeYears(birthdate);
    if (!isFinite(age) || age < 13) {
      setError('You must be at least 13 to register.');
      return;
    }

    var btn = $('btn-register');
    btn.disabled = true;
    fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email,
        password: password,
        name: name,
        birthdate: birthdate,
        gradeLevel: gradeLevel,
        state: state,
        country: country,
      }),
    }).then(function (r) { return r.json().then(function (b) { return { status: r.status, body: b }; }); })
      .then(function (res) {
        btn.disabled = false;
        if (res.status >= 200 && res.status < 300 && res.body.ok) {
          resetRegisterForm();
          showVerifyOverlay(email);
        } else if (res.body && res.body.error === 'underage') {
          setError('You must be at least 13 to register.');
        } else {
          setError('Registration failed. (' + ((res.body && res.body.error) || 'unknown') + ')');
        }
      }).catch(function (err) {
        btn.disabled = false;
        setError('Network error: ' + err.message);
      });
  });

  /* ── Login ─────────────────────────────────────────────────────────── */
  function setResendVisible(visible) {
    var btn = $('btn-resend-verification');
    if (!btn) return;
    btn.style.display = visible ? '' : 'none';
  }

  $('login-panel').addEventListener('submit', function (e) {
    e.preventDefault();
    setError(null);
    setResendVisible(false);
    var email = $('login-email').value.trim();
    var password = $('login-password').value;

    var btn = $('btn-login');
    btn.disabled = true;
    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password }),
    }).then(function (r) { return r.json().then(function (b) { return { status: r.status, body: b }; }); })
      .then(function (res) {
        btn.disabled = false;
        if (res.status >= 200 && res.status < 300 && res.body.ok) {
          var auth = {
            email: email,
            accessToken: res.body.accessToken,
            refreshToken: res.body.refreshToken,
            expiresAt: res.body.expiresAt,
          };
          saveAuth(auth);
          window.location.href = '/';
          return;
        } else if (res.body && res.body.error === 'email_not_confirmed') {
          setError('Please verify your email first.');
          setResendVisible(true);
        } else {
          setError('Invalid email or password.');
        }
      }).catch(function (err) {
        btn.disabled = false;
        setError('Network error: ' + err.message);
      });
  });

  /* ── Resend verification email ─────────────────────────────────────── */
  $('btn-resend-verification').addEventListener('click', function () {
    var email = $('login-email').value.trim();
    if (!email) { setError('Enter your email above, then click resend.'); return; }
    var btn = $('btn-resend-verification');
    btn.disabled = true;
    fetch('/api/auth/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email }),
    }).then(function (r) { return r.json().then(function (b) { return { status: r.status, body: b }; }); })
      .then(function () {
        btn.disabled = false;
        setError(null);
        setSuccess('Verification email sent.');
      }).catch(function (err) {
        btn.disabled = false;
        setError('Network error: ' + err.message);
      });
  });

  /* ── Verify overlay: resend button ─────────────────────────────────── */
  $('btn-verify-resend').addEventListener('click', function () {
    var email = $('verify-email-address').textContent || '';
    if (!email) return;
    var btn = $('btn-verify-resend');
    btn.disabled = true;
    fetch('/api/auth/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email }),
    }).then(function () {
      btn.disabled = false;
      stopCountdown();
      startCountdown();
      var orig = btn.textContent;
      btn.textContent = 'Sent!';
      setTimeout(function () { btn.textContent = orig; }, 2000);
    }).catch(function () {
      btn.disabled = false;
      setError('Network error — please try again.');
    });
  });

  /* ── Verify overlay: return to sign in ────────────────────────────── */
  $('btn-verify-back').addEventListener('click', function () {
    hideVerifyOverlay();
  });

  /* ── Hash-based token handling (verification + password recovery) ────── */
  function handleVerificationHash() {
    var hash = window.location.hash;
    if (!hash) return false;
    var params = new URLSearchParams(hash.slice(1));
    var type = params.get('type');
    var accessToken = params.get('access_token');
    if ((type === 'signup' || type === 'recovery') && accessToken) {
      var expiresAtRaw = params.get('expires_at');
      var expiresAt = expiresAtRaw ? parseInt(expiresAtRaw, 10) : null;
      history.replaceState(null, '', window.location.pathname);
      saveAuth({
        accessToken: accessToken,
        refreshToken: params.get('refresh_token') || null,
        expiresAt: expiresAt,
      });
      window.location.replace('/');
      return true;
    }
    return false;
  }
  if (handleVerificationHash()) return;

  /* ── Forgot password panel ─────────────────────────────────────────── */
  $('btn-show-forgot').addEventListener('click', function () {
    setError(null);
    setSuccess(null);
    $('login-panel').classList.remove('active');
    $('register-panel').classList.remove('active');
    $('forgot-panel').classList.add('active');
  });

  $('btn-back-to-login').addEventListener('click', function () {
    setError(null);
    setSuccess(null);
    $('forgot-panel').classList.remove('active');
    $('login-panel').classList.add('active');
    // Restore tab highlights
    tabs.forEach(function (t) {
      var isLogin = t.dataset.tab === 'login';
      t.classList.toggle('active', isLogin);
      t.setAttribute('aria-selected', isLogin ? 'true' : 'false');
    });
  });

  $('btn-forgot').addEventListener('click', function () {
    var email = $('forgot-email').value.trim();
    if (!email) { setError('Please enter your email address.'); return; }
    var btn = $('btn-forgot');
    btn.disabled = true;
    $('forgot-email').disabled = true;
    setError(null);
    fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email }),
    }).then(function () {
      setSuccess('If that address is registered you\'ll receive a reset link shortly.');
    }).catch(function () {
      setError('Network error — please try again.');
      btn.disabled = false;
      $('forgot-email').disabled = false;
    });
  });

  /* ── Redirect if already authenticated ───────────────────────────────── */
  var existing = loadAuth();
  if (isAuthValid(existing)) {
    window.location.href = '/';
    return;
  }
  // Expired or malformed — clear stale data
  if (existing) clearAuth();
})();

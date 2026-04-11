/* login.js — logic for the parallel /login.html entry point (issue #73).
 *
 * IMPORTANT: this page does NOT gate the main app at /. The main app
 * continues to use the existing passcode access wall. Signing in here is a
 * smoke test for the new Supabase-backed auth flow.
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

  function setOutput(obj) {
    var el = $('login-status-output');
    el.textContent = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
  }

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

  function showStatus(auth) {
    var status = $('login-status');
    if (!auth) {
      status.style.display = 'none';
      return;
    }
    status.style.display = '';
    $('login-status-main').textContent = 'Signed in as ' + (auth.email || '(unknown email)') + '.';
  }

  /* ── Tabs ──────────────────────────────────────────────────────────── */
  var tabs = document.querySelectorAll('.login-tab');
  var panels = {
    login: $('login-panel'),
    register: $('register-panel'),
  };
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var target = tab.dataset.tab;
      tabs.forEach(function (t) {
        var active = t === tab;
        t.classList.toggle('active', active);
        t.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      Object.keys(panels).forEach(function (key) {
        panels[key].classList.toggle('active', key === target);
      });
      setError(null);
      setSuccess(null);
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
          setError(null);
          resetRegisterForm();
          // Switch to login tab first — the tab handler clears success, so set it after
          document.querySelector('.login-tab[data-tab="login"]').click();
          $('login-email').value = email;
          setSuccess('Account created. You can now sign in.');
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
  $('login-panel').addEventListener('submit', function (e) {
    e.preventDefault();
    setError(null);
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
          showStatus(auth);
          setOutput('Login successful. Tokens stored in sessionStorage.');
        } else {
          setError('Invalid email or password.');
        }
      }).catch(function (err) {
        btn.disabled = false;
        setError('Network error: ' + err.message);
      });
  });

  /* ── Test /api/auth/me ─────────────────────────────────────────────── */
  $('btn-test-me').addEventListener('click', function () {
    var auth = loadAuth();
    if (!auth || !auth.accessToken) {
      setOutput('No access token stored. Sign in first.');
      return;
    }
    fetch('/api/auth/me', {
      headers: { 'Authorization': 'Bearer ' + auth.accessToken },
    }).then(function (r) { return r.json().then(function (b) { return { status: r.status, body: b }; }); })
      .then(function (res) { setOutput({ status: res.status, body: res.body }); })
      .catch(function (err) { setOutput('Network error: ' + err.message); });
  });

  /* ── Logout ────────────────────────────────────────────────────────── */
  $('btn-logout').addEventListener('click', function () {
    var auth = loadAuth();
    if (!auth || !auth.accessToken) {
      clearAuth();
      showStatus(null);
      setOutput('Cleared local session.');
      return;
    }
    fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + auth.accessToken },
    }).then(function (r) { return r.json().then(function (b) { return { status: r.status, body: b }; }); })
      .then(function (res) {
        clearAuth();
        showStatus(null);
        setOutput({ status: res.status, body: res.body });
      }).catch(function (err) {
        clearAuth();
        showStatus(null);
        setOutput('Network error during logout: ' + err.message);
      });
  });

  /* ── Restore on load ───────────────────────────────────────────────── */
  var existing = loadAuth();
  if (existing) showStatus(existing);
})();

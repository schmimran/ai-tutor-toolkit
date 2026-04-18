/* login.js — logic for the /login.html entry point.
 *
 * Uses window.auth (apps/web/public/auth.js) for all Supabase interaction.
 * Calls the three rate-limited server proxies (/api/auth/register, /login,
 * /forgot-password) directly because they do server-side validation and
 * rate limiting that can't be done from the client.
 *
 * After a successful login the browser is redirected to /. Supabase-js
 * handles session storage and the signup/recovery hash callbacks.
 */

(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function setMessage(id, msg) {
    var el = $(id);
    if (!msg) { el.style.display = 'none'; el.textContent = ''; return; }
    el.textContent = msg;
    el.style.display = '';
  }
  function setError(msg)   { setMessage('login-error', msg); }
  function setSuccess(msg) { setMessage('login-success', msg); }

  /* ── Tabs ──────────────────────────────────────────────────────────── */
  var tabs = document.querySelectorAll('.login-tab');
  var panels = { login: $('login-panel'), register: $('register-panel') };
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
      $('forgot-panel').classList.remove('active');
      setError(null);
      setSuccess(null);
      $('btn-resend-verification').style.display = 'none';
    });
  });

  /* ── Contact email from config ─────────────────────────────────────── */
  fetch('/api/config').then(function (r) { return r.json(); }).then(function (cfg) {
    var email = (cfg && cfg.contactEmail) || '';
    if (email) {
      $('login-contact-note').textContent = 'Need access or have questions? Email ' + email + '.';
    }
  }).catch(function () { /* silent */ });

  /* ── Redirect if already signed in / on SIGNED_IN. Supabase-js consumes
       signup/recovery hash callbacks automatically via detectSessionInUrl. */
  window.auth.init().then(function () {
    var client = window.auth.getClient();
    client.auth.onAuthStateChange(function (event) {
      if (event === 'PASSWORD_RECOVERY') {
        window.location.replace('/settings.html?recovery=1');
        return;
      }
      if (event === 'SIGNED_IN') {
        // Do NOT redirect on recovery — PASSWORD_RECOVERY fires first above.
        if (window.location.hash.indexOf('type=recovery') === -1) {
          window.location.replace('/');
        }
      }
    });
    // Cover the case where a session already existed before this page loaded.
    client.auth.getSession().then(function (res) {
      var session = res && res.data ? res.data.session : null;
      if (session && window.location.hash.indexOf('type=recovery') === -1) {
        window.location.replace('/');
      }
    });
  });

  /* ── Register ──────────────────────────────────────────────────────── */
  function computeAgeYears(birthdate) {
    var parts = birthdate.split('-');
    if (parts.length !== 3) return NaN;
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    var d = parseInt(parts[2], 10);
    var today = new Date();
    var age = today.getFullYear() - y;
    var monthDiff = (today.getMonth() + 1) - m;
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < d)) age -= 1;
    return age;
  }

  function resetRegisterForm() {
    ['register-name','register-email','register-password','register-birthdate',
     'register-grade','register-state','register-country'].forEach(function (id) {
      $(id).value = '';
    });
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
      body: JSON.stringify({ email: email, password: password, name: name,
        birthdate: birthdate, gradeLevel: gradeLevel, state: state, country: country }),
    }).then(function (r) { return r.json().then(function (b) { return { status: r.status, body: b }; }); })
      .then(function (res) {
        btn.disabled = false;
        if (res.status === 429) {
          setError('Too many attempts — please wait a few minutes and try again.');
        } else if (res.status >= 200 && res.status < 300 && res.body.ok) {
          resetRegisterForm();
          setSuccess('Account created. Check your email for a verification link, then sign in.');
          // Switch to sign-in tab and pre-fill email
          document.querySelector('.login-tab[data-tab="login"]').click();
          $('login-email').value = email;
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
  function setResendVisible(visible) { $('btn-resend-verification').style.display = visible ? '' : 'none'; }

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
        if (res.status === 429) {
          setError('Too many attempts — please wait a few minutes and try again.');
          return;
        }
        if (res.status >= 200 && res.status < 300 && res.body.ok) {
          // Hand the tokens to supabase-js so it owns the session from here on.
          return window.auth.init().then(function () {
            return window.auth.getClient().auth.setSession({
              access_token: res.body.accessToken,
              refresh_token: res.body.refreshToken,
            });
          }).then(function () {
            window.location.href = '/';
          });
        }
        if (res.body && res.body.error === 'email_not_confirmed') {
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

  /* ── Resend verification ───────────────────────────────────────────── */
  $('btn-resend-verification').addEventListener('click', function () {
    var email = $('login-email').value.trim();
    if (!email) { setError('Enter your email above, then click resend.'); return; }
    var btn = $('btn-resend-verification');
    btn.disabled = true;
    window.auth.init().then(function () {
      return window.auth.getClient().auth.resend({ type: 'signup', email: email });
    }).then(function () {
      btn.disabled = false;
      setError(null);
      setSuccess('Verification email sent.');
    }).catch(function () {
      btn.disabled = false;
      setError('Network error — please try again.');
    });
  });

  /* ── URL reason banners ────────────────────────────────────────────── */
  var urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('reason') === 'session_expired') {
    setError('Your session expired. Please sign in again.');
  }
  if (urlParams.get('reason') === 'password_changed') {
    setSuccess('Password changed. Please sign in with your new password.');
  }

  /* ── Forgot password ───────────────────────────────────────────────── */
  $('btn-show-forgot').addEventListener('click', function () {
    setError(null); setSuccess(null);
    $('login-panel').classList.remove('active');
    $('register-panel').classList.remove('active');
    $('forgot-panel').classList.add('active');
  });

  $('btn-back-to-login').addEventListener('click', function () {
    setError(null); setSuccess(null);
    $('forgot-panel').classList.remove('active');
    $('login-panel').classList.add('active');
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
      setSuccess("If that address is registered you'll receive a reset link shortly.");
    }).catch(function () {
      setError('Network error — please try again.');
      btn.disabled = false;
      $('forgot-email').disabled = false;
    });
  });
})();

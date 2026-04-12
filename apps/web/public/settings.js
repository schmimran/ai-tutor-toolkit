/* settings.js — client logic for /settings.html.
 *
 * Single IIFE, no bundler. Fetches GET /api/auth/settings on load and
 * provides forms to update grade level, email transcripts preference,
 * and email address.
 */
(function () {
  "use strict";

  // ── Auth helpers ──────────────────────────────────────────────────────────
  function getAuthSession() {
    var raw = sessionStorage.getItem("authSession") || localStorage.getItem("authSession");
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  var auth = getAuthSession();
  if (!auth || !auth.accessToken) {
    window.location.replace("/login.html");
    return;
  }

  function authHeaders() {
    return {
      Authorization: "Bearer " + auth.accessToken,
      "Content-Type": "application/json",
    };
  }

  // ── DOM refs ──────────────────────────────────────────────────────────────
  var loadingEl = document.getElementById("settings-loading");
  var errorEl = document.getElementById("settings-error");
  var formEl = document.getElementById("settings-form");
  var nameEl = document.getElementById("settings-name");
  var birthdateEl = document.getElementById("settings-birthdate");
  var gradeEl = document.getElementById("settings-grade");
  var emailTranscriptsEl = document.getElementById("settings-email-transcripts");
  var emailEl = document.getElementById("settings-email");
  var changeEmailBtn = document.getElementById("btn-change-email");
  var saveBtn = document.getElementById("btn-save");
  var successEl = document.getElementById("settings-success");
  var errorInlineEl = document.getElementById("settings-error-inline");

  // Track original values to detect changes.
  var original = {};

  // ── Formatting helpers ────────────────────────────────────────────────────
  function formatBirthdate(iso) {
    if (!iso) return "";
    var parts = iso.split("-");
    if (parts.length !== 3) return iso;
    return parts[1] + "/" + parts[2] + "/" + parts[0];
  }

  function showSuccess(msg) {
    successEl.textContent = msg;
    successEl.style.display = "";
    errorInlineEl.style.display = "none";
    setTimeout(function () { successEl.style.display = "none"; }, 4000);
  }

  function showError(msg) {
    errorInlineEl.textContent = msg;
    errorInlineEl.style.display = "";
    successEl.style.display = "none";
  }

  function clearMessages() {
    successEl.style.display = "none";
    errorInlineEl.style.display = "none";
  }

  // ── Load settings ─────────────────────────────────────────────────────────
  function loadSettings() {
    fetch("/api/auth/settings", { headers: authHeaders() })
      .then(function (res) {
        if (res.status === 401) {
          window.location.replace("/login.html");
          return null;
        }
        if (!res.ok) throw new Error("Failed to load settings.");
        return res.json();
      })
      .then(function (data) {
        if (!data) return;
        loadingEl.style.display = "none";
        formEl.style.display = "";

        nameEl.value = data.name || "";
        birthdateEl.value = formatBirthdate(data.birthdate);
        emailEl.value = data.email || "";

        if (data.gradeLevel) {
          gradeEl.value = data.gradeLevel;
        }
        emailTranscriptsEl.checked = data.emailTranscriptsEnabled !== false;

        original.gradeLevel = data.gradeLevel || "";
        original.emailTranscriptsEnabled = data.emailTranscriptsEnabled !== false;
        original.email = data.email || "";
      })
      .catch(function (err) {
        loadingEl.style.display = "none";
        errorEl.textContent = err.message || "Failed to load settings.";
        errorEl.style.display = "";
      });
  }

  // ── Save settings (grade + email transcripts) ─────────────────────────────
  formEl.addEventListener("submit", function (e) {
    e.preventDefault();
    clearMessages();

    var payload = {};
    var gradeVal = gradeEl.value;
    if (gradeVal && gradeVal !== original.gradeLevel) {
      payload.gradeLevel = gradeVal;
    }
    var transcriptsVal = emailTranscriptsEl.checked;
    if (transcriptsVal !== original.emailTranscriptsEnabled) {
      payload.emailTranscriptsEnabled = transcriptsVal;
    }

    if (Object.keys(payload).length === 0) {
      showSuccess("No changes to save.");
      return;
    }

    saveBtn.disabled = true;
    fetch("/api/auth/settings", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        if (res.status === 401) {
          window.location.replace("/login.html");
          return null;
        }
        return res.json();
      })
      .then(function (data) {
        if (!data) return;
        saveBtn.disabled = false;
        if (data.ok) {
          if (payload.gradeLevel) original.gradeLevel = payload.gradeLevel;
          if (payload.emailTranscriptsEnabled !== undefined) {
            original.emailTranscriptsEnabled = payload.emailTranscriptsEnabled;
          }
          showSuccess("Settings saved.");
        } else {
          showError(data.error || "Failed to save settings.");
        }
      })
      .catch(function () {
        saveBtn.disabled = false;
        showError("Network error. Please try again.");
      });
  });

  // ── Change email ──────────────────────────────────────────────────────────
  changeEmailBtn.addEventListener("click", function () {
    clearMessages();
    var newEmail = emailEl.value.trim();
    if (!newEmail) {
      showError("Please enter an email address.");
      return;
    }
    if (newEmail === original.email) {
      showSuccess("Email unchanged.");
      return;
    }

    changeEmailBtn.disabled = true;
    fetch("/api/auth/change-email", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ newEmail: newEmail }),
    })
      .then(function (res) {
        if (res.status === 401) {
          window.location.replace("/login.html");
          return null;
        }
        return res.json();
      })
      .then(function (data) {
        if (!data) return;
        changeEmailBtn.disabled = false;
        if (data.ok) {
          original.email = newEmail;
          showSuccess("Email updated.");
        } else {
          showError(data.error || "Failed to update email.");
        }
      })
      .catch(function () {
        changeEmailBtn.disabled = false;
        showError("Network error. Please try again.");
      });
  });

  // ── Init ──────────────────────────────────────────────────────────────────
  loadSettings();
})();

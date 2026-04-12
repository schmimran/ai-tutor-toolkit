/* history.js — client logic for /history.html.
 *
 * Single IIFE, no bundler. Fetches GET /api/history and renders the session
 * list. Supports viewing transcripts via GET /api/transcript/:id.
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
    return { Authorization: "Bearer " + auth.accessToken };
  }

  // ── DOM refs ──────────────────────────────────────────────────────────────
  var loadingEl = document.getElementById("history-loading");
  var emptyEl = document.getElementById("history-empty");
  var errorEl = document.getElementById("history-error");
  var listEl = document.getElementById("history-list");
  var overlayEl = document.getElementById("transcript-overlay");
  var messagesEl = document.getElementById("transcript-messages");
  var titleEl = document.getElementById("transcript-title");
  var closeBtn = document.getElementById("transcript-close");

  // ── Formatting helpers ────────────────────────────────────────────────────
  function formatPromptName(name) {
    if (!name) return "Unknown prompt";
    // "tutor-prompt-v7" -> "Tutor v7"
    var match = name.match(/^tutor-prompt-v(\d+)$/);
    if (match) return "Tutor v" + match[1];
    return name;
  }

  function formatDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatDuration(startIso, endIso) {
    if (!startIso || !endIso) return "";
    var ms = new Date(endIso).getTime() - new Date(startIso).getTime();
    var mins = Math.round(ms / 60000);
    if (mins < 1) return "<1 min";
    return mins + " min";
  }

  // ── Load sessions ─────────────────────────────────────────────────────────
  function loadSessions() {
    fetch("/api/history", { headers: authHeaders() })
      .then(function (res) {
        if (res.status === 401) {
          window.location.replace("/login.html");
          return null;
        }
        if (!res.ok) throw new Error("Failed to load sessions");
        return res.json();
      })
      .then(function (data) {
        if (!data) return;
        loadingEl.style.display = "none";

        if (!data.sessions || data.sessions.length === 0) {
          emptyEl.style.display = "";
          return;
        }

        renderSessions(data.sessions);
      })
      .catch(function (err) {
        loadingEl.style.display = "none";
        errorEl.textContent = err.message || "Failed to load sessions.";
        errorEl.style.display = "";
      });
  }

  function renderSessions(sessions) {
    listEl.innerHTML = "";
    listEl.style.display = "";

    sessions.forEach(function (s) {
      var li = document.createElement("li");
      li.className = "history-item";

      var info = document.createElement("div");
      info.className = "history-item-info";

      var dateEl = document.createElement("div");
      dateEl.className = "history-item-date";
      dateEl.textContent = formatDate(s.started_at);
      info.appendChild(dateEl);

      var meta = document.createElement("div");
      meta.className = "history-item-meta";
      var parts = [formatPromptName(s.prompt_name)];
      var duration = formatDuration(s.started_at, s.ended_at);
      if (duration) parts.push(duration);
      meta.textContent = parts.join(" \u2022 ");
      info.appendChild(meta);

      var btn = document.createElement("button");
      btn.className = "history-view-btn";
      btn.textContent = "View transcript";
      btn.addEventListener("click", function () {
        openTranscript(s.id, s.started_at);
      });

      li.appendChild(info);
      li.appendChild(btn);
      listEl.appendChild(li);
    });
  }

  // ── Transcript viewer ─────────────────────────────────────────────────────
  function openTranscript(sessionId, startedAt) {
    titleEl.textContent = "Transcript — " + formatDate(startedAt);
    messagesEl.innerHTML = "<div class=\"history-loading\">Loading transcript...</div>";
    overlayEl.style.display = "";

    fetch("/api/transcript/" + sessionId, { headers: authHeaders() })
      .then(function (res) {
        if (res.status === 401) {
          window.location.replace("/login.html");
          return null;
        }
        if (res.status === 403) throw new Error("Access denied.");
        if (!res.ok) throw new Error("Failed to load transcript.");
        return res.json();
      })
      .then(function (data) {
        if (!data) return;
        messagesEl.innerHTML = "";

        if (!data.transcript || data.transcript.length === 0) {
          messagesEl.innerHTML = "<div class=\"history-empty\">No messages in this session.</div>";
          return;
        }

        data.transcript.forEach(function (msg) {
          var div = document.createElement("div");
          div.className = "transcript-msg";

          var roleDiv = document.createElement("div");
          roleDiv.className = "transcript-msg-role " + (msg.role === "Student" ? "student" : "tutor");
          roleDiv.textContent = msg.role;
          div.appendChild(roleDiv);

          var textDiv = document.createElement("div");
          textDiv.className = "transcript-msg-text";
          textDiv.textContent = msg.text;
          div.appendChild(textDiv);

          messagesEl.appendChild(div);
        });
      })
      .catch(function (err) {
        messagesEl.innerHTML = "";
        var errDiv = document.createElement("div");
        errDiv.className = "history-error";
        errDiv.textContent = err.message || "Failed to load transcript.";
        messagesEl.appendChild(errDiv);
      });
  }

  function closeTranscript() {
    overlayEl.style.display = "none";
    messagesEl.innerHTML = "";
  }

  closeBtn.addEventListener("click", closeTranscript);

  overlayEl.addEventListener("click", function (e) {
    if (e.target === overlayEl) closeTranscript();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && overlayEl.style.display !== "none") {
      closeTranscript();
    }
  });

  // ── Init ──────────────────────────────────────────────────────────────────
  loadSessions();
})();

/* history.js — client logic for /history.html.
 *
 * Single IIFE, no bundler. Fetches GET /api/history and renders the session
 * list. Supports viewing transcripts via GET /api/transcript/:id.
 */
(function () {
  "use strict";

  // ── DOM refs ──────────────────────────────────────────────────────────────
  var loadingEl = document.getElementById("history-loading");
  var emptyEl = document.getElementById("history-empty");
  var errorEl = document.getElementById("history-error");
  var listEl = document.getElementById("history-list");
  var overlayEl = document.getElementById("transcript-overlay");
  var messagesEl = document.getElementById("transcript-messages");
  var titleEl = document.getElementById("transcript-title");
  var closeBtn = document.getElementById("transcript-close");
  var actionsEl = document.getElementById("transcript-actions");
  var statusEl = document.getElementById("transcript-action-status");
  var emailBtn = document.getElementById("transcript-email-btn");
  var pdfBtn = document.getElementById("transcript-pdf-btn");
  var xlsxBtn = document.getElementById("transcript-xlsx-btn");

  // ── Module state ──────────────────────────────────────────────────────────
  var currentSessionId = null;
  var currentTranscriptData = null;
  var currentStartedAt = null;

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

  function formatOutcome(v) {
    var labels = { solved: "Solved", partial: "Partially solved", stuck: "Stuck" };
    return labels[v] || v;
  }

  function formatExperience(v) {
    var labels = { positive: "Good experience", neutral: "Neutral", negative: "Difficult" };
    return labels[v] || v;
  }

  // ── Load sessions ─────────────────────────────────────────────────────────
  function loadSessions() {
    window.auth.authedFetch("/api/history")
      .then(function (res) {
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

      if (s.outcome || s.experience) {
        var rating = document.createElement("div");
        rating.className = "history-item-rating";

        if (s.outcome) {
          var outcomePill = document.createElement("span");
          outcomePill.className = "rating-pill outcome-" + s.outcome;
          outcomePill.textContent = formatOutcome(s.outcome);
          rating.appendChild(outcomePill);
        }
        if (s.experience) {
          var expPill = document.createElement("span");
          expPill.className = "rating-pill experience-" + s.experience;
          expPill.textContent = formatExperience(s.experience);
          rating.appendChild(expPill);
        }

        info.appendChild(rating);
      }

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
    currentSessionId = sessionId;
    currentTranscriptData = null;
    currentStartedAt = startedAt;
    actionsEl.style.display = "none";
    clearStatus();

    window.auth.authedFetch("/api/transcript/" + sessionId)
      .then(function (res) {
        if (res.status === 404 || res.status === 403) throw new Error("Access denied.");
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

        currentTranscriptData = data.transcript;
        actionsEl.style.display = "";

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
    currentSessionId = null;
    currentTranscriptData = null;
    currentStartedAt = null;
    actionsEl.style.display = "none";
    clearStatus();
  }

  // ── Export actions ────────────────────────────────────────────────────────
  function setActionsDisabled(disabled) {
    emailBtn.disabled = disabled;
    pdfBtn.disabled = disabled;
    xlsxBtn.disabled = disabled;
  }

  function showStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.className = "transcript-action-status" + (kind ? " " + kind : "");
    statusEl.style.display = "";
  }

  function clearStatus() {
    statusEl.textContent = "";
    statusEl.style.display = "none";
    statusEl.className = "transcript-action-status";
  }

  function filenameBase() {
    var prefix = currentSessionId ? currentSessionId.split("-")[0] : "session";
    var d = new Date();
    var pad = function (n) { return n < 10 ? "0" + n : String(n); };
    var stamp = d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
    return "transcript-" + prefix + "-" + stamp;
  }

  function emailTranscript() {
    if (!currentSessionId) return;
    setActionsDisabled(true);
    showStatus("Sending…");

    window.auth.authedFetch("/api/transcript/" + currentSessionId + "/email", {
      method: "POST",
    })
      .then(function (res) {
        return res.json().catch(function () { return { ok: false }; }).then(function (body) {
          return { status: res.status, body: body };
        });
      })
      .then(function (r) {
        if (r.status === 200 && r.body && r.body.ok) {
          showStatus("Sent!", "success");
          return;
        }
        if (r.status === 429) {
          showStatus("Too many requests. Try again in a few minutes.", "error");
          return;
        }
        if (r.status === 503) {
          showStatus("Email is not configured on this server.", "error");
          return;
        }
        showStatus("Could not send. Try again later.", "error");
      })
      .catch(function () {
        showStatus("Could not send. Try again later.", "error");
      })
      .then(function () {
        setActionsDisabled(false);
      });
  }

  function downloadPdf() {
    if (!currentTranscriptData || !window.jspdf) {
      showStatus("PDF library not loaded.", "error");
      return;
    }
    setActionsDisabled(true);
    try {
      var doc = new window.jspdf.jsPDF({ unit: "pt", format: "letter" });
      var margin = 48;
      var pageHeight = doc.internal.pageSize.getHeight();
      var pageWidth = doc.internal.pageSize.getWidth();
      var maxWidth = pageWidth - margin * 2;
      var y = margin;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("Tutor session transcript", margin, y);
      y += 20;
      if (currentStartedAt) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text(formatDate(currentStartedAt), margin, y);
        y += 16;
      }
      y += 6;

      currentTranscriptData.forEach(function (msg) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        if (y > pageHeight - margin) { doc.addPage(); y = margin; }
        doc.text(msg.role, margin, y);
        y += 14;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        var lines = doc.splitTextToSize(msg.text || "", maxWidth);
        for (var i = 0; i < lines.length; i++) {
          if (y > pageHeight - margin) { doc.addPage(); y = margin; }
          doc.text(lines[i], margin, y);
          y += 13;
        }
        y += 8;
      });

      doc.save(filenameBase() + ".pdf");
      showStatus("PDF downloaded.", "success");
    } catch (err) {
      showStatus("PDF generation failed.", "error");
      console.error("[history] PDF error:", err);
    } finally {
      setActionsDisabled(false);
    }
  }

  function downloadXlsx() {
    if (!currentTranscriptData || !window.XLSX) {
      showStatus("Excel library not loaded.", "error");
      return;
    }
    setActionsDisabled(true);
    try {
      var rows = [["Role", "Message"]];
      currentTranscriptData.forEach(function (msg) {
        rows.push([msg.role, msg.text || ""]);
      });
      var ws = window.XLSX.utils.aoa_to_sheet(rows);
      var wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, ws, "Transcript");
      window.XLSX.writeFile(wb, filenameBase() + ".xlsx");
      showStatus("Excel downloaded.", "success");
    } catch (err) {
      showStatus("Excel generation failed.", "error");
      console.error("[history] XLSX error:", err);
    } finally {
      setActionsDisabled(false);
    }
  }

  emailBtn.addEventListener("click", emailTranscript);
  pdfBtn.addEventListener("click", downloadPdf);
  xlsxBtn.addEventListener("click", downloadXlsx);

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
  window.auth.requireSession().then(loadSessions);
})();

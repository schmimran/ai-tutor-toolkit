/* settings.js — client logic for /settings.html.
 *
 * Uses supabase-js directly for reads/updates:
 *   - user object (name/email/birthdate/grade_level/app_metadata) via auth.getUser()
 *   - email_transcripts_enabled via a RLS-protected select/update on profiles
 *   - password change via auth.updateUser({ password, currentPassword })
 *   - email change via auth.updateUser({ email }) — Supabase emails the new
 *     address to confirm the change.
 *
 * Recovery detection: supabase-js fires PASSWORD_RECOVERY on the auth state
 * when a recovery hash is consumed. We show the recovery banner when
 * `?recovery=1` is in the URL or when that event fires.
 */
(function () {
  "use strict";

  var isRecovery = new URLSearchParams(window.location.search).get("recovery") === "1";

  // DOM refs.
  var loadingEl = document.getElementById("settings-loading");
  var errorEl = document.getElementById("settings-error");
  var formEl = document.getElementById("settings-form");
  var nameEl = document.getElementById("settings-name");
  var birthdateEl = document.getElementById("settings-birthdate");
  var gradeEl = document.getElementById("settings-grade");
  var emailTranscriptsEl = document.getElementById("settings-email-transcripts");
  var emailEl = document.getElementById("settings-email");
  var changeEmailBtn = document.getElementById("btn-change-email");
  var changePasswordBtn = document.getElementById("btn-change-password");
  var currentPasswordEl = document.getElementById("settings-current-password");
  var currentPasswordField = document.getElementById("current-password-field");
  var newPasswordEl = document.getElementById("settings-new-password");
  var confirmPasswordEl = document.getElementById("settings-confirm-password");
  var recoveryBannerEl = document.getElementById("recovery-banner");
  var saveBtn = document.getElementById("btn-save");
  var successEl = document.getElementById("settings-success");
  var errorInlineEl = document.getElementById("settings-error-inline");

  var original = {};
  var client = null;
  var userId = null;

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

  function applyRecoveryUI() {
    recoveryBannerEl.style.display = "";
    // Current password isn't needed when arriving via recovery link — Supabase
    // accepts updateUser({ password }) because the session itself was just
    // issued by the recovery flow.
    if (currentPasswordField) currentPasswordField.style.display = "none";
    var backLinkEl = document.getElementById("btn-back-link");
    if (backLinkEl) {
      backLinkEl.textContent = "Cancel — go to login";
      backLinkEl.href = "/login.html";
    }
    if (newPasswordEl) newPasswordEl.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function loadSettings() {
    try {
      var session = await window.auth.requireSession();
      client = window.auth.getClient();
      userId = session.user.id;

      // PASSWORD_RECOVERY fires when supabase-js processes a recovery hash — set
      // isRecovery so the password-change path skips the current-password field.
      // USER_UPDATED fires after an email-change confirmation link is consumed;
      // refresh the displayed email and show a success banner.
      client.auth.onAuthStateChange(async function (event, sess) {
        if (event === "PASSWORD_RECOVERY") { isRecovery = true; applyRecoveryUI(); return; }
        if (event === "USER_UPDATED" || event === "EMAIL_CHANGE") {
          var freshUser = sess && sess.user;
          if (!freshUser) {
            try {
              var res = await client.auth.getUser();
              freshUser = res && res.data && res.data.user;
            } catch (e) { /* ignore */ }
          }
          if (freshUser && freshUser.email && freshUser.email !== original.email) {
            emailEl.value = freshUser.email;
            original.email = freshUser.email;
            showSuccess("Email address updated successfully.");
          }
        }
      });

      var user = session.user;
      var meta = user.user_metadata || {};

      nameEl.value = meta.name || "";
      birthdateEl.value = formatBirthdate(meta.birthdate);
      emailEl.value = user.email || "";
      if (meta.grade_level) gradeEl.value = meta.grade_level;

      // Profile row (RLS limits to the caller's own row).
      var profileRes = await client
        .from("profiles")
        .select("email_transcripts_enabled")
        .eq("user_id", userId)
        .maybeSingle();
      var emailTranscriptsEnabled = true;
      if (profileRes.data && profileRes.data.email_transcripts_enabled !== null) {
        emailTranscriptsEnabled = profileRes.data.email_transcripts_enabled;
      }
      emailTranscriptsEl.checked = emailTranscriptsEnabled;

      original.gradeLevel = meta.grade_level || "";
      original.emailTranscriptsEnabled = emailTranscriptsEnabled;
      original.email = user.email || "";

      loadingEl.style.display = "none";
      formEl.style.display = "";

      if (isRecovery) applyRecoveryUI();
    } catch (err) {
      loadingEl.style.display = "none";
      errorEl.textContent = (err && err.message) || "Failed to load settings.";
      errorEl.style.display = "";
    }
  }

  // Save grade + email_transcripts_enabled.
  formEl.addEventListener("submit", async function (e) {
    e.preventDefault();
    clearMessages();
    saveBtn.disabled = true;
    try {
      var gradeVal = gradeEl.value;
      var transcriptsVal = emailTranscriptsEl.checked;
      var updates = [];

      if (gradeVal && gradeVal !== original.gradeLevel) {
        // supabase-js merges `data` into user_metadata server-side — no need to read first.
        updates.push(
          client.auth.updateUser({ data: { grade_level: gradeVal } }).then(function (r) {
            if (r.error) throw r.error;
            original.gradeLevel = gradeVal;
          })
        );
      }
      if (transcriptsVal !== original.emailTranscriptsEnabled) {
        updates.push(
          client.from("profiles").update({ email_transcripts_enabled: transcriptsVal })
            .eq("user_id", userId).then(function (r) {
              if (r.error) throw r.error;
              original.emailTranscriptsEnabled = transcriptsVal;
            })
        );
      }

      await Promise.all(updates);
      showSuccess("Settings saved.");
    } catch (err) {
      showError((err && err.message) || "Failed to save settings.");
    } finally {
      saveBtn.disabled = false;
    }
  });

  changeEmailBtn.addEventListener("click", async function () {
    clearMessages();
    var newEmail = emailEl.value.trim();
    if (!newEmail) { showError("Please enter an email address."); return; }
    if (newEmail === original.email) { showSuccess("Email unchanged."); return; }
    changeEmailBtn.disabled = true;
    try {
      var res = await client.auth.updateUser(
        { email: newEmail },
        { emailRedirectTo: window.location.origin + "/settings.html" }
      );
      if (res.error) throw res.error;
      showSuccess("A confirmation link has been sent to " + newEmail + ". Click it to complete the change.");
    } catch (err) {
      showError((err && err.message) || "Failed to update email.");
    } finally {
      changeEmailBtn.disabled = false;
    }
  });

  changePasswordBtn.addEventListener("click", async function () {
    clearMessages();
    var newPwd = newPasswordEl.value;
    var confirmPwd = confirmPasswordEl.value;
    var currentPwd = currentPasswordEl.value;

    if (!newPwd) { showError("Please enter a new password."); return; }
    if (newPwd.length < 8) { showError("Password must be at least 8 characters."); return; }
    if (newPwd !== confirmPwd) { showError("Passwords do not match."); return; }
    // Current password is required except in recovery mode.
    if (!isRecovery && !currentPwd) { showError("Please enter your current password."); return; }

    changePasswordBtn.disabled = true;
    try {
      var update = { password: newPwd };
      if (!isRecovery) update.currentPassword = currentPwd;
      var res = await client.auth.updateUser(update);
      if (res.error) throw res.error;
      newPasswordEl.value = "";
      confirmPasswordEl.value = "";
      if (currentPasswordEl) currentPasswordEl.value = "";
      if (isRecovery) {
        // Sign the user out of the recovery session and send them to login.
        try { await client.auth.signOut(); } catch (e) { /* ignore */ }
        window.location.replace("/login.html?reason=password_changed");
      } else {
        showSuccess("Password changed successfully.");
      }
    } catch (err) {
      showError((err && err.message) || "Failed to change password.");
    } finally {
      changePasswordBtn.disabled = false;
    }
  });

  loadSettings();
})();

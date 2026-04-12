  // ── KaTeX init (called by auto-render.min.js onload) ──────────────────────
  let katexReady = false;
  let katexQueue = []; // elements waiting for KaTeX render

  function initKaTeX() {
    katexReady = true;
    for (const el of katexQueue) renderKaTeX(el);
    katexQueue = [];
  }

  function renderKaTeX(el) {
    if (!katexReady) { katexQueue.push(el); return; }
    renderMathInElement(el, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$',  right: '$',  display: false },
        { left: '\\(', right: '\\)', display: false },
        { left: '\\[', right: '\\]', display: true },
      ],
      throwOnError: false,
    });
  }

  // ── State ─────────────────────────────────────────────────────────────────
  let sessionId         = crypto.randomUUID();
  let msgList           = []; // {id, role, bubbleEl}
  let attachments       = []; // {file, chipEl}
  let isStreaming       = false;
  let endAvailable      = false;
  let sessionEnded      = false;
  let inactivityTimer   = null;
  let countdownInterval = null;
  let appConfig         = { model: '', extendedThinking: false, inactivityMs: 600000 };
  let msgCounter        = 0;
  let fbSelections      = { outcome: null, experience: null };

  // ── Model / prompt selection state ────────────────────────────────────────
  let selectedModel    = ''; // active model ID (persisted in localStorage)
  let selectedPrompt   = ''; // active prompt name (persisted in localStorage)
  let selectedThinking = true; // extended thinking on/off (persisted in localStorage)
  let pendingSwitch   = null; // { type: 'model'|'prompt'|'thinking', value: string|boolean } — waiting for confirmation
  let activePicker    = null; // 'model' | 'prompt' | 'thinking' — which picker is open

  let sessionUploads = []; // { id, name, mimeType, blobUrl, messageId }
  let uploadCounter  = 0;
  let activeAbortController = null; // aborts the in-flight /api/chat fetch when session resets

  // Sentinel emitted by tutor prompt when the problem is fully resolved.
  const END_SENTINEL   = '[END_SESSION_AVAILABLE]';
  const MAX_FILES      = 5;
  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const ALLOWED_TYPES  = new Set([
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf',
  ]);

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const chatArea       = $('chat-area');
  const emptyState     = $('empty-state');
  const messagesEl     = $('messages');
  const msgInput       = $('msg-input');
  const btnSend        = $('btn-send');
  const btnAttach      = $('btn-attach');
  const fileInput      = $('file-input');
  const fileStrip      = $('file-strip');
  const endBanner      = $('end-banner');
  const btnEndSession       = $('btn-end-session');
  const btnEndSessionHeader = $('btn-end-session-header');
  const fbCard             = $('fb-card');
  const btnFbSubmit        = $('btn-fb-submit');
  const btnFbSkip          = $('btn-fb-skip');
  const fbComment          = $('fb-comment');
  const inputRow           = $('input-row');
  const btnTranscript       = $('btn-transcript');
  const promptBadge    = $('prompt-badge');
  const modelBadge     = $('model-badge');
  const thinkingBadge  = $('thinking-badge');
  const buildInfoEl    = $('build-info');
  const tokenCounter   = $('token-counter');
  const configPicker        = $('config-picker');
  const configPickerList    = $('config-picker-list');
  const switchConfigOverlay = $('switch-config-overlay');
  const switchConfigTitle   = $('switch-config-title');
  const btnSwitchConfirm    = $('btn-switch-confirm');
  const btnSwitchCancel     = $('btn-switch-cancel');
  const btnSwitchCancelX    = $('btn-switch-cancel-x');
  const modalTranscript = $('modal-transcript');
  const txBody         = $('tx-body');
  const btnCloseTx     = $('btn-close-tx');
  const btnCloseTx2    = $('btn-close-tx2');
  const btnCopyTx      = $('btn-copy-tx');
  const userIdentityEl     = $('user-identity');
  const userDisplayName    = $('user-display-name');
  const btnLogout          = $('btn-logout');
  const dragOverlay        = $('drag-overlay');
  const wrappingUpOverlay  = $('wrapping-up-overlay');
  const toast              = $('toast');
  const inactivityTimerEl  = $('inactivity-timer');

  // ── Config ────────────────────────────────────────────────────────────────
  async function fetchConfig() {
    try {
      const res = await fetch('/api/config');
      if (!res.ok) return;
      appConfig = await res.json();

      // Restore persisted selection or fall back to server default.
      const storedModel    = localStorage.getItem('selectedModel');
      const storedPrompt   = localStorage.getItem('selectedPrompt');
      const storedThinking = localStorage.getItem('selectedThinking');
      selectedModel  = (storedModel  && appConfig.availableModels?.includes(storedModel))
        ? storedModel  : (appConfig.model  || '');
      selectedPrompt = (storedPrompt && appConfig.availablePrompts?.includes(storedPrompt))
        ? storedPrompt : (appConfig.defaultPrompt || '');
      selectedThinking = storedThinking === null
        ? !!appConfig.extendedThinking
        : storedThinking === 'true';

      updateModelBadge();
      updatePromptBadge();
      updateThinkingBadge();
      updateBuildInfo();
    } catch { /* no config available */ }
  }

  function updateModelBadge() {
    if (!selectedModel) return;
    const label = selectedModel.replace(/^claude-/, '').replace(/-\d{8}$/, '');
    modelBadge.textContent = label;
    const isHaiku = selectedModel.includes('haiku');
    modelBadge.classList.toggle('extended', selectedThinking && !isHaiku);
    modelBadge.title = selectedModel + (selectedThinking && !isHaiku ? ' — extended thinking on' : '');
  }

  function updatePromptBadge() {
    if (!selectedPrompt) return;
    // Strip "tutor-prompt-" prefix for compact display (e.g. "v7").
    const label = selectedPrompt.replace(/^tutor-prompt-/, '');
    promptBadge.textContent = label;
    if (!appConfig.promptSelectionEnabled) {
      promptBadge.classList.add('locked');
      promptBadge.title = selectedPrompt + ' — prompt selection disabled';
    } else {
      promptBadge.classList.remove('locked');
      promptBadge.title = selectedPrompt + ' — click to switch';
    }
  }

  function updateThinkingBadge() {
    thinkingBadge.textContent = selectedThinking ? 'thinking: on' : 'thinking: off';
    thinkingBadge.classList.toggle('off', !selectedThinking);
    thinkingBadge.title = (selectedThinking ? 'Extended thinking on' : 'Extended thinking off') + ' — click to toggle';
  }

  function updateBuildInfo() {
    if (!buildInfoEl || !appConfig.buildVersion) return;
    const d = appConfig.buildDate ? new Date(appConfig.buildDate) : null;
    const dateStr = d
      ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : '';
    buildInfoEl.textContent = dateStr
      ? `${appConfig.buildVersion} · ${dateStr}`
      : appConfig.buildVersion;
    buildInfoEl.title = `Build ${appConfig.buildVersion}` + (appConfig.buildDate ? ` — ${appConfig.buildDate}` : '');
  }

  // ── Admin badge visibility + user identity ───────────────────────────────
  async function fetchUserInfo() {
    try {
      const authRaw = sessionStorage.getItem('authSession') || localStorage.getItem('authSession');
      if (!authRaw) return;
      const auth = JSON.parse(authRaw);
      if (!auth || !auth.accessToken) return;

      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': 'Bearer ' + auth.accessToken }
      });
      if (!res.ok) return;
      const data = await res.json();

      if (data.ok) {
        if (data.isAdmin === true) {
          modelBadge.classList.add('admin-visible');
          promptBadge.classList.add('admin-visible');
          thinkingBadge.classList.add('admin-visible');
        }
        const displayName = data.name || data.email || '';
        if (displayName) {
          userDisplayName.textContent = displayName;
          userIdentityEl.style.display = '';
        }
      }
    } catch {
      // Network or parse failure: leave badges hidden and identity hidden.
    }
  }

  async function handleLogout() {
    try {
      const authRaw = sessionStorage.getItem('authSession') || localStorage.getItem('authSession');
      if (authRaw) {
        const auth = JSON.parse(authRaw);
        if (auth && auth.accessToken) {
          await fetch('/api/auth/logout', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + auth.accessToken }
          });
        }
      }
    } catch {
      // Proceed regardless of API result (fail-open).
    }
    sessionStorage.removeItem('authSession');
    localStorage.removeItem('authSession');
    window.location.href = '/login.html';
  }


  // ── Header button state ───────────────────────────────────────────────────
  function updateHeaderButtons() {
    const hasMessages = msgList.length > 0;
    btnTranscript.disabled       = !hasMessages;
    btnEndSessionHeader.disabled = !hasMessages;
  }

  // ── Empty-state toggle ────────────────────────────────────────────────────
  function showEmpty() {
    emptyState.style.display = '';
    messagesEl.style.display = 'none';
  }
  function hideEmpty() {
    emptyState.style.display = 'none';
    messagesEl.style.display = 'flex';
  }

  // ── Append messages ───────────────────────────────────────────────────────
  function appendUserMsg(text, files) {
    hideEmpty();
    const id = `m${++msgCounter}`;
    const div = document.createElement('div');
    div.className = 'msg user';
    div.id = id;

    const label = document.createElement('div');
    label.className = 'msg-label';
    label.textContent = 'You';

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.textContent = text;

    if (files.length > 0) {
      const thumbRow = document.createElement('div');
      thumbRow.className = 'msg-thumbs';
      for (const f of files) {
        const entry = sessionUploads.find(u => u.name === f.name && u.messageId === id);
        const el = document.createElement('div');
        el.className = 'msg-thumb-item';
        if (f.type.startsWith('image/') && entry?.blobUrl) {
          const img = document.createElement('img');
          img.src = entry.blobUrl;
          img.alt = f.name;
          el.appendChild(img);
        } else {
          const icon = document.createElement('span');
          icon.className = 'msg-thumb-pdf';
          icon.textContent = '📄';
          const name = document.createElement('span');
          name.className = 'msg-thumb-name';
          name.textContent = f.name;
          el.appendChild(icon);
          el.appendChild(name);
        }
        if (entry) {
          el.addEventListener('click', () => {
            if (typeof focusUpload === 'function') focusUpload(entry.id);
          });
        }
        thumbRow.appendChild(el);
      }
      bubble.appendChild(thumbRow);
    }

    div.appendChild(label);
    div.appendChild(bubble);
    messagesEl.appendChild(div);
    msgList.push({ id, role: 'user', bubbleEl: bubble });
    updateHeaderButtons();
    scrollBottom();
    return id;
  }

  function appendTutorPlaceholder() {
    hideEmpty();
    const id = `m${++msgCounter}`;
    const div = document.createElement('div');
    div.className = 'msg tutor';
    div.id = id;

    const label = document.createElement('div');
    label.className = 'msg-label';
    label.textContent = 'Tutor';

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.innerHTML = '<div class="typing-dots">' +
      '<div class="typing-dot"></div>' +
      '<div class="typing-dot"></div>' +
      '<div class="typing-dot"></div>' +
      '</div>';

    div.appendChild(label);
    div.appendChild(bubble);
    messagesEl.appendChild(div);

    const entry = { id, role: 'tutor', dbId: null, bubbleEl: bubble };
    msgList.push(entry);
    scrollBottom();
    return entry;
  }

  function parseImgRefs(text) {
    return text.replace(/\[IMG:([^\]]+)\]/g, (_match, filename) => {
      const trimmed = filename.trim();
      const entry = sessionUploads.find(
        u => u.name.toLowerCase() === trimmed.toLowerCase()
      );
      if (entry) {
        return `<span class="img-ref" data-upload-id="${escHtml(entry.id)}" title="View: ${escHtml(trimmed)}" tabindex="0">📎 ${escHtml(trimmed)}</span>`;
      } else {
        return `<span class="img-ref unmatched" title="${escHtml(trimmed)}">📎 ${escHtml(trimmed)}</span>`;
      }
    });
  }

  function finalizeTutor(entry, rawText) {
    const hasSentinel = rawText.includes(END_SENTINEL);
    const clean = rawText.replace(/\[END_SESSION_AVAILABLE\]/g, '').trim();

    // Replace [IMG:...] markers before markdown parse
    const withRefs = parseImgRefs(clean);

    // Render markdown then sanitize with DOMPurify before assigning to innerHTML.
    // DOMPurify is required — if it hasn't loaded (CDN blocked/slow), fall back to
    // plain-text rendering rather than passing unsanitized HTML to innerHTML.
    // ADD_ATTR: tabindex is not in DOMPurify's default allow-list; data-upload-id
    // is allowed by default via ALLOW_DATA_ATTR but listed explicitly for clarity.
    const html = (typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined')
      ? DOMPurify.sanitize(marked.parse(withRefs), { ADD_ATTR: ['data-upload-id', 'tabindex'] })
      : `<p>${escHtml(clean)}</p>`;

    entry.bubbleEl.innerHTML = html;
    renderKaTeX(entry.bubbleEl);

    // Wire click handlers for image-reference pills and auto-focus the last one
    const refPills = entry.bubbleEl.querySelectorAll('.img-ref[data-upload-id]');
    refPills.forEach(pill => {
      pill.addEventListener('click', () => {
        if (typeof focusUpload === 'function') focusUpload(pill.dataset.uploadId);
      });
    });
    if (refPills.length > 0) {
      const lastId = refPills[refPills.length - 1].dataset.uploadId;
      if (typeof focusUpload === 'function') focusUpload(lastId);
    }

    if (hasSentinel && !endAvailable && !sessionEnded) {
      endAvailable = true;
      endBanner.classList.add('active');
    }

    scrollBottom();
  }

  function scrollBottom() {
    chatArea.scrollTop = chatArea.scrollHeight;
  }

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }

  // ── Send message / SSE stream ─────────────────────────────────────────────
  async function sendMessage() {
    const text = msgInput.value.trim();
    if (!text || isStreaming || sessionEnded) return;

    isStreaming = true;
    setInputDisabled(true);

    const files = attachments.map(a => a.file);

    // Pre-compute the message ID that appendUserMsg will assign (it uses ++msgCounter).
    // Push uploads into sessionUploads with the correct messageId so appendUserMsg
    // can find them when rendering thumbnails.
    const nextMsgId = `m${msgCounter + 1}`;
    for (const a of attachments) {
      const blobUrl = a.file.type.startsWith('image/')
        ? (a.chipEl.querySelector('img')?.src ?? null)
        : null;
      sessionUploads.push({
        id: `upload-${uploadCounter++}`,
        name: a.file.name,
        mimeType: a.file.type,
        blobUrl,
        messageId: nextMsgId,
      });
      a.retained = true; // signal clearAttachments not to revoke this blob URL
    }

    appendUserMsg(text, files);
    const tutorEntry = appendTutorPlaceholder();

    // Add newly pushed uploads to gallery (after appendUserMsg so gallery is ready)
    for (const upload of sessionUploads.filter(u => u.messageId === nextMsgId)) {
      if (typeof addToGallery === 'function') addToGallery(upload);
    }

    // Build multipart form
    const fd = new FormData();
    fd.append('sessionId', sessionId);
    fd.append('message', text);
    if (selectedModel)  fd.append('model', selectedModel);
    if (selectedPrompt) fd.append('promptName', selectedPrompt);
    fd.append('extendedThinking', String(selectedThinking));
    for (const f of files) fd.append('files', f);

    // Clear input
    msgInput.value = '';
    resizeInput();
    clearAttachments();
    resetInactivityTimer();

    let rawText = '';
    let gotToken = false;
    let finalized = false;

    try {
      activeAbortController = new AbortController();
      const fetchOpts = { method: 'POST', body: fd, signal: activeAbortController.signal, headers: {} };
      try {
        const authRaw = sessionStorage.getItem('authSession') || localStorage.getItem('authSession');
        if (authRaw) {
          const auth = JSON.parse(authRaw);
          if (auth && auth.accessToken) {
            fetchOpts.headers['Authorization'] = 'Bearer ' + auth.accessToken;
          }
        }
      } catch (_) { /* ignore — auth is optional */ }
      const resp = await fetch('/api/chat', fetchOpts);
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: resp.statusText }));
        throw new Error(err.error || resp.statusText);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        buf += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        const lines = buf.split('\n');
        buf = done ? '' : (lines.pop() ?? '');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (!payload) continue;
          let event;
          try { event = JSON.parse(payload); } catch { continue; }

          if (event.type === 'text_delta') {
            if (!gotToken) {
              gotToken = true;
              tutorEntry.bubbleEl.innerHTML = '';
            }
            rawText += event.text;
            tutorEntry.bubbleEl.textContent =
              rawText.replace(/\[END_SESSION_AVAILABLE\]/g, '').trimEnd();
            scrollBottom();
          } else if (event.type === 'message_stop') {
            if (event.messageId) tutorEntry.dbId = event.messageId;
            if (event.tokenUsage) {
              const total = (event.tokenUsage.inputTokens || 0) + (event.tokenUsage.outputTokens || 0);
              tokenCounter.textContent = `${total.toLocaleString()} tokens`;
              tokenCounter.style.display = 'inline';
            }
            finalizeTutor(tutorEntry, rawText);
            finalized = true;
          } else if (event.type === 'error') {
            throw new Error(event.message || 'Streaming error');
          }
        }
        if (done) break;
      }

      // Fallback: finalize if stream ended without message_stop
      if (!finalized) {
        finalizeTutor(tutorEntry, rawText);
      }

    } catch (err) {
      if (err.name !== 'AbortError') {
        tutorEntry.bubbleEl.innerHTML =
          `<span style="color:var(--danger)">Error: ${escHtml(err.message)}</span>`;
      }
    } finally {
      isStreaming = false;
      setInputDisabled(false);
      msgInput.focus();
      resetInactivityTimer();
    }
  }

  function setInputDisabled(disabled) {
    btnSend.disabled          = disabled;
    msgInput.disabled         = disabled;
    btnAttach.disabled        = disabled;
    // When re-enabling after streaming, respect the "has messages" gate
    btnEndSessionHeader.disabled = disabled || msgList.length === 0;
  }

  // ── Session DELETE helpers ────────────────────────────────────────────────
  function deleteSession(id) {
    return fetch(`/api/sessions/${id}`, { method: 'DELETE' }).catch(() => {});
  }

  function discardSession(id) {
    return fetch(`/api/sessions/${id}?discard=true`, { method: 'DELETE' }).catch(() => {});
  }

  // ── Config picker (model / prompt / thinking) ─────────────────────────────
  function openConfigPicker(type, anchorEl) {
    activePicker = type;
    configPickerList.innerHTML = '';

    let options;
    let current;
    if (type === 'model') {
      options = (appConfig.availableModels || []).map(v => ({ value: v, label: v.replace(/^claude-/, '').replace(/-\d{8}$/, '') }));
      current = selectedModel;
    } else if (type === 'prompt') {
      options = (appConfig.availablePrompts || []).map(v => ({ value: v, label: v.replace(/^tutor-prompt-/, '') }));
      current = selectedPrompt;
    } else { // 'thinking'
      options = [
        { value: true,  label: 'On' },
        { value: false, label: 'Off' },
      ];
      current = selectedThinking;
    }

    for (const opt of options) {
      const li = document.createElement('li');
      li.className = 'config-picker-item' + (opt.value === current ? ' active' : '');
      li.textContent = opt.label;
      li.addEventListener('click', () => onPickerSelect(type, opt.value));
      configPickerList.appendChild(li);
    }

    // Position picker below the anchor badge.
    const rect = anchorEl.getBoundingClientRect();
    configPicker.style.top  = (rect.bottom + window.scrollY + 6) + 'px';
    configPicker.style.left = rect.left + 'px';
    configPicker.style.display = '';
  }

  function closeConfigPicker() {
    configPicker.style.display = 'none';
    activePicker = null;
  }

  function onPickerSelect(type, value) {
    closeConfigPicker();
    let current;
    if (type === 'model')        current = selectedModel;
    else if (type === 'prompt')  current = selectedPrompt;
    else                         current = selectedThinking; // 'thinking'
    if (value === current) return;

    if (msgList.length > 0 && !sessionEnded) {
      // Session in progress — need confirmation before switching.
      pendingSwitch = { type, value };
      switchConfigTitle.textContent =
        type === 'model'   ? 'Switch model?' :
        type === 'prompt'  ? 'Switch prompt?' :
                             'Switch extended thinking?';
      switchConfigOverlay.classList.add('active');
    } else {
      // No active session — apply immediately.
      applySwitch(type, value);
    }
  }

  function applySwitch(type, value) {
    if (type === 'model') {
      selectedModel = value;
      localStorage.setItem('selectedModel', value);
      updateModelBadge();
    } else if (type === 'prompt') {
      selectedPrompt = value;
      localStorage.setItem('selectedPrompt', value);
      updatePromptBadge();
    } else { // 'thinking'
      selectedThinking = !!value;
      localStorage.setItem('selectedThinking', String(selectedThinking));
      updateThinkingBadge();
      // The model badge's "extended" indicator depends on selectedThinking.
      updateModelBadge();
    }
    pendingSwitch = null;
  }

  /** Reset all session state and UI to a fresh-session starting point. */
  function resetSessionState() {
    if (activeAbortController) { activeAbortController.abort(); activeAbortController = null; }
    if (inactivityTimer) { clearTimeout(inactivityTimer); inactivityTimer = null; }
    stopCountdownDisplay();
    sessionId       = crypto.randomUUID();
    msgList         = [];
    for (const u of sessionUploads) {
      if (u.blobUrl) URL.revokeObjectURL(u.blobUrl);
    }
    sessionUploads  = [];
    uploadCounter   = 0;
    if (typeof resetGallery === 'function') resetGallery();
    clearAttachments();
    isStreaming     = false;
    endAvailable    = false;
    sessionEnded    = false;
    msgCounter      = 0;
    katexQueue      = [];
    dragDepth       = 0;
    fbSelections    = { outcome: null, experience: null };
    tokenCounter.style.display = 'none';
    tokenCounter.textContent = '';

    messagesEl.innerHTML = '';
    showEmpty();
    endBanner.classList.remove('active');

    fbCard.classList.remove('active');
    fbCard.querySelectorAll('.fb-opt.chosen').forEach(el => el.classList.remove('chosen'));
    fbComment.value = '';
    inputRow.style.display = '';
    msgInput.value = '';
    msgInput.placeholder = 'What are you stuck on?';
    msgInput.disabled = false;
    btnSend.disabled = false;
    btnAttach.disabled = false;
    updateHeaderButtons();
    resizeInput();
  }

  async function confirmSwitch() {
    switchConfigOverlay.classList.remove('active');
    if (!pendingSwitch) return;
    const { type, value } = pendingSwitch;

    // Discard the current session silently (no eval, no email).
    if (msgList.length > 0 && !sessionEnded) {
      void discardSession(sessionId);
    }
    resetSessionState();

    // Apply the switch.
    applySwitch(type, value);
    msgInput.focus();
  }

  // ── Inactivity countdown display ─────────────────────────────────────────
  function startCountdownDisplay(totalMs) {
    if (countdownInterval) clearInterval(countdownInterval);
    inactivityTimerEl.classList.remove('warn', 'urgent');
    inactivityTimerEl.style.display = 'inline';

    var deadline = Date.now() + totalMs;

    function tick() {
      var remaining = deadline - Date.now();
      if (remaining <= 0) {
        inactivityTimerEl.textContent = '0:00';
        inactivityTimerEl.classList.remove('warn');
        inactivityTimerEl.classList.add('urgent');
        clearInterval(countdownInterval);
        countdownInterval = null;
        return;
      }
      var totalSec = Math.ceil(remaining / 1000);
      var mins     = Math.floor(totalSec / 60);
      var secs     = totalSec % 60;
      inactivityTimerEl.textContent = mins + ':' + (secs < 10 ? '0' : '') + secs;

      inactivityTimerEl.classList.remove('warn', 'urgent');
      if (remaining <= 30000) {
        inactivityTimerEl.classList.add('urgent');
      } else if (remaining <= 120000) {
        inactivityTimerEl.classList.add('warn');
      }
    }

    tick();
    countdownInterval = setInterval(tick, 1000);
  }

  function stopCountdownDisplay() {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
    inactivityTimerEl.textContent = '';
    inactivityTimerEl.classList.remove('warn', 'urgent');
    inactivityTimerEl.style.display = 'none';
  }

  // ── Inactivity timer ──────────────────────────────────────────────────────
  function resetInactivityTimer() {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    if (sessionEnded) return;
    inactivityTimer = setTimeout(onInactivityTimeout, appConfig.inactivityMs);
    if (msgList.length > 0) {
      startCountdownDisplay(appConfig.inactivityMs);
    }
  }

  async function onInactivityTimeout() {
    if (sessionEnded || msgList.length === 0) return;
    if (isStreaming) {
      inactivityTimer = setTimeout(onInactivityTimeout, 5000);
      return;
    }
    sessionEnded = true;
    stopCountdownDisplay();
    endBanner.classList.remove('active');

    await deleteSession(sessionId);
    lockSession('Session ended due to inactivity. Your transcript has been emailed.');
  }

  // ── End session ───────────────────────────────────────────────────────────
  function endSession() {
    if (sessionEnded) return;
    sessionEnded = true;
    if (inactivityTimer) clearTimeout(inactivityTimer);
    stopCountdownDisplay();
    endBanner.classList.remove('active');

    const tutorMessages = msgList.filter(e => e.role === 'tutor');
    if (tutorMessages.length > 0) {
      showFeedbackCard();
    } else {
      void finalizeSessionEnd();
    }
  }

  async function finalizeSessionEnd() {
    await deleteSession(sessionId);
    lockSession('Session ended. Transcript has been emailed.');
  }

  function lockSession(message) {
    msgInput.disabled = true;
    btnSend.disabled  = true;
    btnAttach.disabled = true;
    btnEndSessionHeader.disabled = true;
    msgInput.placeholder = 'Session ended.';
    showToast(message, 5000);
  }

  // ── Feedback card ──────────────────────────────────────────────────────────
  function showFeedbackCard() {
    btnFbSubmit.disabled = false;
    btnFbSkip.disabled   = false;
    fbSelections = { outcome: null, experience: null };
    fbComment.value = '';
    fbCard.querySelectorAll('.fb-opt.chosen').forEach(el => el.classList.remove('chosen'));
    inputRow.style.display = 'none';
    fbCard.classList.add('active');
  }

  async function submitFeedback(skip) {
    btnFbSubmit.disabled = true;
    btnFbSkip.disabled   = true;
    fbCard.classList.remove('active');
    inputRow.style.display = '';

    const body = { sessionId, source: 'student', skipped: skip };
    if (!skip) {
      body.outcome = fbSelections.outcome;
      body.experience = fbSelections.experience;
      const comment = fbComment.value.trim();
      if (comment) body.comment = comment;
    }

    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch { /* silently ignore */ }

    wrappingUpOverlay.classList.add('active');
    await deleteSession(sessionId);
    wrappingUpOverlay.classList.remove('active');

    await newSession();
  }

  // ── Transcript modal ──────────────────────────────────────────────────────
  async function openTranscript() {
    modalTranscript.classList.add('active');
    txBody.innerHTML = '<p style="color:var(--text-muted);font-size:.88rem">Loading…</p>';
    try {
      const res = await fetch(`/api/transcript/${sessionId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { transcript } = await res.json();
      if (!transcript?.length) {
        txBody.innerHTML = '<p style="color:var(--text-muted);font-size:.88rem">No messages yet.</p>';
        return;
      }
      txBody.innerHTML = transcript.map(e => `
        <div class="tx-entry ${e.role === 'Student' ? 'student' : ''}">
          <div class="tx-role">${escHtml(e.role)}</div>
          <div class="tx-text">${escHtml(e.text)}</div>
        </div>`).join('');
    } catch {
      txBody.innerHTML = '<p style="color:var(--danger);font-size:.88rem">Could not load transcript.</p>';
    }
  }

  function closeTranscript() {
    modalTranscript.classList.remove('active');
  }

  async function copyTranscript() {
    const entries = txBody.querySelectorAll('.tx-entry');
    if (!entries.length) return;
    const text = Array.from(entries).map(el => {
      const role    = el.querySelector('.tx-role')?.textContent ?? '';
      const content = el.querySelector('.tx-text')?.textContent ?? '';
      return `${role}:\n${content}`;
    }).join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      showToast('Copied to clipboard!');
    } catch {
      showToast('Copy failed — try selecting text manually.');
    }
  }

  // ── New session ───────────────────────────────────────────────────────────
  async function newSession() {
    if (isStreaming) return;
    // End previous session if it had activity
    if (msgList.length > 0 && !sessionEnded) {
      await deleteSession(sessionId);
    }
    resetSessionState();
    msgInput.focus();
  }

  // ── File attachments ──────────────────────────────────────────────────────
  function revokeAttachmentURL(attachment) {
    if (attachment.file.type.startsWith('image/')) {
      const img = attachment.chipEl.querySelector('img');
      if (img) URL.revokeObjectURL(img.src);
    }
  }
  function addFiles(fileList) {
    for (const file of Array.from(fileList)) {
      if (attachments.length >= MAX_FILES) {
        showToast(`Maximum ${MAX_FILES} files per message.`);
        break;
      }
      if (!ALLOWED_TYPES.has(file.type)) {
        showToast(`${file.name}: unsupported type. Use images (JPEG, PNG, GIF, WebP) or PDF.`);
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        showToast(`${file.name} exceeds the 10 MB limit.`);
        continue;
      }
      buildChip(file);
    }
    renderStrip();
  }

  function buildChip(file) {
    const chip = document.createElement('div');
    chip.className = 'file-chip';

    if (file.type.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      img.alt = file.name;
      chip.appendChild(img);
    } else {
      const icon = document.createElement('span');
      icon.className = 'file-icon';
      icon.textContent = '📄';
      chip.appendChild(icon);
    }

    const name = document.createElement('span');
    name.className = 'file-name';
    name.textContent = file.name;
    chip.appendChild(name);

    const rm = document.createElement('button');
    rm.className = 'chip-remove';
    rm.textContent = '×';
    rm.title = 'Remove';
    rm.addEventListener('click', () => removeFile(file));
    chip.appendChild(rm);

    attachments.push({ file, chipEl: chip });
  }

  function removeFile(file) {
    const idx = attachments.findIndex(a => a.file === file);
    if (idx === -1) return;
    const [removed] = attachments.splice(idx, 1);
    revokeAttachmentURL(removed);
    renderStrip();
  }

  function clearAttachments() {
    for (const a of attachments) {
      if (!a.retained) revokeAttachmentURL(a);
    }
    attachments = [];
    renderStrip();
    fileInput.value = '';
  }

  function renderStrip() {
    fileStrip.innerHTML = '';
    if (!attachments.length) { fileStrip.classList.remove('active'); return; }
    fileStrip.classList.add('active');
    for (const a of attachments) fileStrip.appendChild(a.chipEl);
  }

  // ── Drag and drop ─────────────────────────────────────────────────────────
  let dragDepth = 0;

  document.addEventListener('dragenter', e => {
    if (sessionEnded || isStreaming) return;
    e.preventDefault();
    if (++dragDepth === 1) dragOverlay.classList.add('active');
  });

  document.addEventListener('dragleave', e => {
    e.preventDefault();
    if (--dragDepth <= 0) { dragDepth = 0; dragOverlay.classList.remove('active'); }
  });

  document.addEventListener('dragover',  e => e.preventDefault());

  document.addEventListener('drop', e => {
    e.preventDefault();
    dragDepth = 0;
    dragOverlay.classList.remove('active');
    if (sessionEnded || isStreaming) return;
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  });

  // ── Textarea auto-resize ──────────────────────────────────────────────────
  function resizeInput() {
    msgInput.style.height = 'auto';
    msgInput.style.height = Math.min(msgInput.scrollHeight, 180) + 'px';
  }

  // ── Toast ─────────────────────────────────────────────────────────────────
  let toastTimer = null;
  function showToast(msg, duration = 3200) {
    toast.textContent = msg;
    toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
  }

  // ── Event wiring ──────────────────────────────────────────────────────────
  btnSend.addEventListener('click', sendMessage);

  msgInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  msgInput.addEventListener('input', resizeInput);

  btnAttach.addEventListener('click', () => {
    if (!sessionEnded) fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files?.length) { addFiles(fileInput.files); fileInput.value = ''; }
  });

  btnEndSession.addEventListener('click', endSession);
  btnEndSessionHeader.addEventListener('click', endSession);
  btnTranscript.addEventListener('click', openTranscript);

  btnCloseTx.addEventListener('click', closeTranscript);
  btnCloseTx2.addEventListener('click', closeTranscript);
  btnCopyTx.addEventListener('click', copyTranscript);
  modalTranscript.addEventListener('click', e => {
    if (e.target === modalTranscript) closeTranscript();
  });

  // Feedback card option toggle
  fbCard.addEventListener('click', e => {
    const btn = e.target.closest('.fb-opt');
    if (!btn) return;
    const group = btn.closest('.fb-card-options');
    const field = group.dataset.field;
    const val = btn.dataset.val;
    const wasChosen = btn.classList.contains('chosen');
    group.querySelectorAll('.fb-opt').forEach(b => b.classList.remove('chosen'));
    if (!wasChosen) {
      btn.classList.add('chosen');
      fbSelections[field] = val;
    } else {
      fbSelections[field] = null;
    }
  });

  btnFbSubmit.addEventListener('click', () => submitFeedback(false));
  btnFbSkip.addEventListener('click',   () => submitFeedback(true));

  // ── Model / prompt picker ─────────────────────────────────────────────────
  modelBadge.addEventListener('click', e => {
    e.stopPropagation();
    if (activePicker === 'model') { closeConfigPicker(); return; }
    openConfigPicker('model', modelBadge);
  });

  promptBadge.addEventListener('click', e => {
    e.stopPropagation();
    if (!appConfig.promptSelectionEnabled) return; // locked — ignore clicks
    if (activePicker === 'prompt') { closeConfigPicker(); return; }
    openConfigPicker('prompt', promptBadge);
  });

  thinkingBadge.addEventListener('click', e => {
    e.stopPropagation();
    if (activePicker === 'thinking') { closeConfigPicker(); return; }
    openConfigPicker('thinking', thinkingBadge);
  });

  document.addEventListener('click', e => {
    if (configPicker.style.display !== 'none' &&
        !configPicker.contains(e.target) &&
        e.target !== modelBadge && e.target !== promptBadge && e.target !== thinkingBadge) {
      closeConfigPicker();
    }
  });

  btnLogout.addEventListener('click', handleLogout);

  btnSwitchConfirm.addEventListener('click', confirmSwitch);
  btnSwitchCancel.addEventListener('click',  () => { switchConfigOverlay.classList.remove('active'); pendingSwitch = null; });
  btnSwitchCancelX.addEventListener('click', () => { switchConfigOverlay.classList.remove('active'); pendingSwitch = null; });

  // ── Empty-state prompt chips ──────────────────────────────────────────────
  emptyState.addEventListener('click', e => {
    const chip = e.target.closest('.empty-chip');
    if (!chip) return;
    msgInput.value = chip.dataset.fill;
    resizeInput();
    msgInput.focus();
    msgInput.setSelectionRange(msgInput.value.length, msgInput.value.length);
  });

  // ── Auth gate ─────────────────────────────────────────────────────────────
  // Redirect to /login.html if no valid auth session exists. This check runs
  // synchronously before any UI renders.
  (function () {
    try {
      var raw = sessionStorage.getItem('authSession') || localStorage.getItem('authSession');
      if (!raw) { window.location.href = '/login.html'; return; }
      var auth = JSON.parse(raw);
      if (!auth || !auth.accessToken) { window.location.href = '/login.html'; return; }
      // Check token expiry (Supabase expiresAt is in Unix seconds)
      if (auth.expiresAt && Date.now() / 1000 > auth.expiresAt) {
        sessionStorage.removeItem('authSession');
        localStorage.removeItem('authSession');
        window.location.href = '/login.html';
        return;
      }
    } catch (e) { window.location.href = '/login.html'; return; }
  })();

  // ── Proactive token refresh ────────────────────────────────────────────────
  var refreshTimer = null;
  var REFRESH_LEAD_MS = 2 * 60 * 1000; // 2 minutes before expiry

  /** Return whichever storage currently holds the auth session (sessionStorage wins). */
  function authStorage() {
    return sessionStorage.getItem('authSession') ? sessionStorage : localStorage;
  }

  function scheduleTokenRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);
    try {
      var raw = sessionStorage.getItem('authSession') || localStorage.getItem('authSession');
      if (!raw) return;
      var auth = JSON.parse(raw);
      if (!auth || !auth.refreshToken || !auth.expiresAt) return;
      var msUntilExpiry = auth.expiresAt * 1000 - Date.now();
      var delay = Math.max(0, msUntilExpiry - REFRESH_LEAD_MS);
      refreshTimer = setTimeout(doTokenRefresh, delay);
    } catch (e) { /* silent */ }
  }

  function doTokenRefresh() {
    var store = authStorage();
    var raw = store.getItem('authSession');
    if (!raw) return;
    var auth;
    try { auth = JSON.parse(raw); } catch (e) { return; }
    if (!auth || !auth.refreshToken) return;

    fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: auth.refreshToken }),
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.ok && res.accessToken) {
          store.setItem('authSession', JSON.stringify({
            accessToken: res.accessToken,
            refreshToken: res.refreshToken,
            expiresAt: res.expiresAt,
          }));
          scheduleTokenRefresh(); // re-arm for the next cycle
        } else {
          // Refresh token also expired — force re-login
          sessionStorage.removeItem('authSession');
          localStorage.removeItem('authSession');
          window.location.href = '/login.html?reason=session_expired';
        }
      })
      .catch(function () {
        // Network failure — do not log out; retry in 30 s (iOS screen lock)
        refreshTimer = setTimeout(doTokenRefresh, 30000);
      });
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  showEmpty();
  fetchConfig();
  fetchUserInfo();
  scheduleTokenRefresh();
  msgInput.focus();

  // ── iOS viewport stability ────────────────────────────────────────────────
  var isIOS = /iP(hone|od)/.test(navigator.userAgent) ||
    (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);

  // Syncs --vh custom property with the actual usable viewport height
  // (accounts for iOS keyboard and dynamic toolbar) and resets scroll
  // position to prevent layout drift.
  function resetViewport() {
    if (window.visualViewport) {
      document.documentElement.style.setProperty(
        '--vh', window.visualViewport.height + 'px'
      );
    }
    window.scrollTo(0, 0);
  }

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', resetViewport);
    resetViewport();
  }

  // Safari may leave the page scrolled after keyboard dismiss. A delayed
  // reset on focusout corrects the layout once Safari finishes animating.
  if (isIOS) {
    document.addEventListener('focusout', function (e) {
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
        setTimeout(resetViewport, 120);
      }
    });
  }

  // ── iOS Add-to-Home-Screen prompt ─────────────────────────────────────────
  (function () {
    var isStandalone = window.navigator.standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches;

    if (!isIOS || isStandalone || localStorage.getItem('a2hs-dismissed')) return;

    var banner = document.getElementById('a2hs-banner');
    var btnClose = document.getElementById('btn-a2hs-close');
    if (!banner || !btnClose) return;

    // Show the banner after a short delay (page only loads if authenticated).
    setTimeout(function () { banner.style.display = ''; }, 2000);

    btnClose.addEventListener('click', function () {
      banner.style.display = 'none';
      localStorage.setItem('a2hs-dismissed', '1');
    });
  })();

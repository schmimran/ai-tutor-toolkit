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
  let appConfig         = { model: '', extendedThinking: false, inactivityMs: 600000 };
  let msgCounter        = 0;
  let fbSelections      = { outcome: null, experience: null };

  let sessionUploads = []; // { id, name, mimeType, blobUrl, messageId }
  let uploadCounter  = 0;

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
  const modelBadge     = $('model-badge');
  const tokenCounter   = $('token-counter');
  const modalTranscript = $('modal-transcript');
  const txBody         = $('tx-body');
  const btnCloseTx     = $('btn-close-tx');
  const btnCloseTx2    = $('btn-close-tx2');
  const btnCopyTx      = $('btn-copy-tx');
  const dragOverlay        = $('drag-overlay');
  const wrappingUpOverlay  = $('wrapping-up-overlay');
  const toast          = $('toast');

  // ── Config ────────────────────────────────────────────────────────────────
  async function fetchConfig() {
    try {
      const res = await fetch('/api/config');
      if (!res.ok) return;
      appConfig = await res.json();
      if (appConfig.model) {
        // Strip date suffix and "claude-" prefix for compact display
        let label = appConfig.model
          .replace(/^claude-/, '')
          .replace(/-\d{8}$/, '');
        modelBadge.textContent = label;
        modelBadge.classList.toggle('extended', !!appConfig.extendedThinking);
        modelBadge.title = appConfig.model +
          (appConfig.extendedThinking ? ' — extended thinking on' : '');
        modelBadge.style.display = '';
      }
    } catch { /* no config available */ }
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
    const clean = rawText.replace(END_SENTINEL, '').trim();

    // Replace [IMG:...] markers before markdown parse
    const withRefs = parseImgRefs(clean);

    // Render markdown (marked is defer-loaded; should be ready by first message)
    const html = (typeof marked !== 'undefined')
      ? marked.parse(withRefs)
      : `<p>${escHtml(withRefs)}</p>`;

    entry.bubbleEl.innerHTML = html;
    renderKaTeX(entry.bubbleEl);

    // Wire click handlers for image-reference pills
    entry.bubbleEl.querySelectorAll('.img-ref[data-upload-id]').forEach(pill => {
      pill.addEventListener('click', () => {
        if (typeof focusUpload === 'function') focusUpload(pill.dataset.uploadId);
      });
    });

    // Auto-focus the last referenced image
    const refPills = entry.bubbleEl.querySelectorAll('.img-ref[data-upload-id]');
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
    for (const f of files) fd.append('files', f);

    // Clear input
    msgInput.value = '';
    resizeInput();
    clearAttachments();
    resetInactivityTimer();

    let rawText = '';
    let gotToken = false;

    try {
      const resp = await fetch('/api/chat', { method: 'POST', body: fd });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: resp.statusText }));
        throw new Error(err.error || resp.statusText);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

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
            // Show plain text live (strip sentinel for display)
            tutorEntry.bubbleEl.textContent =
              rawText.replace(END_SENTINEL, '').trimEnd();
            scrollBottom();
          } else if (event.type === 'message_stop') {
            if (event.messageId) tutorEntry.dbId = event.messageId;
            if (event.tokenUsage) {
              const total = (event.tokenUsage.inputTokens || 0) + (event.tokenUsage.outputTokens || 0);
              tokenCounter.textContent = `${total.toLocaleString()} tokens`;
              tokenCounter.style.display = 'inline';
            }
            finalizeTutor(tutorEntry, rawText);
          } else if (event.type === 'error') {
            throw new Error(event.message || 'Streaming error');
          }
        }
      }

      // Fallback: finalize if stream ended without message_stop
      if (rawText && !tutorEntry.bubbleEl.querySelector('p, ul, ol, pre, h1, h2, h3')) {
        finalizeTutor(tutorEntry, rawText);
      }

    } catch (err) {
      tutorEntry.bubbleEl.innerHTML =
        `<span style="color:var(--danger)">Error: ${escHtml(err.message)}</span>`;
    } finally {
      isStreaming = false;
      setInputDisabled(false);
      msgInput.focus();
    }
  }

  function setInputDisabled(disabled) {
    btnSend.disabled          = disabled;
    msgInput.disabled         = disabled;
    btnAttach.disabled        = disabled;
    // When re-enabling after streaming, respect the "has messages" gate
    btnEndSessionHeader.disabled = disabled || msgList.length === 0;
  }

  // ── Session DELETE helper ─────────────────────────────────────────────────
  function deleteSession(id) {
    return fetch(`/api/sessions/${id}`, { method: 'DELETE' }).catch(() => {});
  }

  // ── Inactivity timer ──────────────────────────────────────────────────────
  function resetInactivityTimer() {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    if (sessionEnded) return;
    inactivityTimer = setTimeout(onInactivityTimeout, appConfig.inactivityMs);
  }

  async function onInactivityTimeout() {
    if (sessionEnded || msgList.length === 0) return;
    sessionEnded = true;
    endBanner.classList.remove('active');
    await deleteSession(sessionId);
    lockSession('Session ended due to inactivity. Your transcript has been emailed.');
  }

  // ── End session ───────────────────────────────────────────────────────────
  function endSession() {
    if (sessionEnded) return;
    sessionEnded = true;
    if (inactivityTimer) clearTimeout(inactivityTimer);
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
    fbSelections = { outcome: null, experience: null };
    fbComment.value = '';
    fbCard.querySelectorAll('.fb-opt.chosen').forEach(el => el.classList.remove('chosen'));
    inputRow.style.display = 'none';
    fbCard.classList.add('active');
  }

  async function submitFeedback(skip) {
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
    if (inactivityTimer) clearTimeout(inactivityTimer);

    // Reset state
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
    fbSelections    = { outcome: null, experience: null };
    tokenCounter.style.display = 'none';
    tokenCounter.textContent = '';

    // Reset UI
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

  // ── Empty-state prompt chips ──────────────────────────────────────────────
  emptyState.addEventListener('click', e => {
    const chip = e.target.closest('.empty-chip');
    if (!chip) return;
    msgInput.value = chip.dataset.fill;
    resizeInput();
    msgInput.focus();
    msgInput.setSelectionRange(msgInput.value.length, msgInput.value.length);
  });

  // ── Disclaimer overlay ────────────────────────────────────────────────────
  const disclaimerOverlay = $('disclaimer-overlay');
  const btnDisclaimerOk   = $('btn-disclaimer-ok');

  function dismissDisclaimer() {
    localStorage.setItem('disclaimer-accepted', '1');
    disclaimerOverlay.classList.remove('active');
    // Fire-and-forget — never block the UI on this.
    fetch('/api/disclaimer/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    }).catch(() => { /* silently ignore network errors */ });
  }

  btnDisclaimerOk.addEventListener('click', dismissDisclaimer);

  // ── Init ──────────────────────────────────────────────────────────────────
  showEmpty();
  fetchConfig();
  // Show disclaimer only on first visit
  if (localStorage.getItem('disclaimer-accepted')) {
    disclaimerOverlay.classList.remove('active');
  }
  msgInput.focus();

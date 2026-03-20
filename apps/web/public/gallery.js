// ── Gallery module ────────────────────────────────────────────────────────
// Depends on: sessionUploads (global, defined in app.js)
// Exposes globals: openGallery, closeGallery, isGalleryOpen,
//                  focusUpload, addToGallery, resetGallery

(function () {
  let galleryOpen = false;

  // DOM refs — resolved after DOMContentLoaded
  let galleryPane, galleryFocused, galleryThumbs, galleryBackdrop,
      btnGalleryClose, btnGalleryToggle;

  function isMobile() {
    return window.innerWidth <= 768;
  }

  // ── Open / close ───────────────────────────────────────────────────────
  window.openGallery = function () {
    galleryPane.classList.add('open');
    if (isMobile()) galleryBackdrop.classList.add('active');
    galleryOpen = true;
  };

  window.closeGallery = function () {
    galleryPane.classList.remove('open');
    galleryBackdrop.classList.remove('active');
    galleryOpen = false;
  };

  window.isGalleryOpen = function () {
    return galleryOpen;
  };

  // ── Focus a specific upload ───────────────────────────────────────────
  window.focusUpload = function (uploadId) {
    const entry = (typeof sessionUploads !== 'undefined' ? sessionUploads : [])
      .find(u => u.id === uploadId);

    // Update active thumbnail
    galleryThumbs.querySelectorAll('.gallery-thumb').forEach(el => {
      el.classList.toggle('active', el.dataset.uploadId === uploadId);
    });

    // Render focused view
    galleryFocused.innerHTML = '';

    if (!entry) return;

    if (entry.mimeType.startsWith('image/') && entry.blobUrl) {
      const img = document.createElement('img');
      img.src = entry.blobUrl;
      img.alt = entry.name;
      galleryFocused.appendChild(img);

      const label = document.createElement('div');
      label.className = 'gallery-filename';
      label.textContent = entry.name;
      galleryFocused.appendChild(label);
    } else {
      const placeholder = document.createElement('div');
      placeholder.className = 'gallery-pdf-placeholder';
      placeholder.innerHTML =
        `<div class="gallery-pdf-icon">📄</div>` +
        `<div class="gallery-pdf-name">${escGallery(entry.name)}</div>`;
      galleryFocused.appendChild(placeholder);
    }

    if (!galleryOpen) openGallery();
  };

  // ── Add a new upload to the gallery ──────────────────────────────────
  window.addToGallery = function (entry) {
    const thumb = document.createElement('div');
    thumb.className = 'gallery-thumb';
    thumb.dataset.uploadId = entry.id;
    thumb.title = entry.name;

    if (entry.mimeType.startsWith('image/') && entry.blobUrl) {
      const img = document.createElement('img');
      img.src = entry.blobUrl;
      img.alt = entry.name;
      thumb.appendChild(img);
    } else {
      const icon = document.createElement('span');
      icon.className = 'gallery-thumb-pdf-icon';
      icon.textContent = '📄';
      thumb.appendChild(icon);
    }

    thumb.addEventListener('click', () => focusUpload(entry.id));
    galleryThumbs.appendChild(thumb);

    // Enable the toggle button
    if (btnGalleryToggle) btnGalleryToggle.disabled = false;
  };

  // ── Reset gallery (called on new session) ────────────────────────────
  window.resetGallery = function () {
    galleryThumbs.innerHTML = '';
    galleryFocused.innerHTML =
      '<div class="gallery-empty-state">No uploads yet</div>';
    if (btnGalleryToggle) btnGalleryToggle.disabled = true;
    if (galleryOpen) closeGallery();
  };

  // ── Minimal HTML escaper (gallery.js is a plain script with no deps) ─
  function escGallery(s) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ── Init ──────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    galleryPane      = document.getElementById('gallery-pane');
    galleryFocused   = document.getElementById('gallery-focused');
    galleryThumbs    = document.getElementById('gallery-thumbs');
    galleryBackdrop  = document.getElementById('gallery-backdrop');
    btnGalleryClose  = document.getElementById('btn-gallery-close');
    btnGalleryToggle = document.getElementById('btn-gallery-toggle');

    if (btnGalleryClose)  btnGalleryClose.addEventListener('click', closeGallery);
    if (galleryBackdrop)  galleryBackdrop.addEventListener('click', closeGallery);
    if (btnGalleryToggle) {
      btnGalleryToggle.addEventListener('click', function () {
        if (isGalleryOpen()) closeGallery(); else openGallery();
      });
    }
  });
})();

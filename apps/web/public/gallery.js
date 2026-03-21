// ── Gallery module ────────────────────────────────────────────────────────
// Depends on: sessionUploads (global, defined in app.js)
// Exposes globals: openGallery, closeGallery, isGalleryOpen,
//                  focusUpload, addToGallery, resetGallery

(function () {
  var ZOOM_SCALE = 250; // background-size percentage for hover zoom
  var supportsHover = window.matchMedia('(hover: hover)').matches;

  var GALLERY_WIDTH_KEY = 'gallery-pane-width';
  var GALLERY_MIN_WIDTH = 200;
  var GALLERY_MAX_WIDTH = 600;

  let galleryOpen = false;

  // DOM refs — resolved after DOMContentLoaded
  let galleryPane, galleryFocused, galleryThumbs, galleryBackdrop,
      btnGalleryClose, btnGalleryToggle, galleryResizer;

  function isMobile() {
    return window.innerWidth <= 768;
  }

  // ── Open / close ───────────────────────────────────────────────────────
  window.openGallery = function () {
    galleryPane.classList.add('open');
    if (isMobile()) {
      galleryBackdrop.classList.add('active');
    } else {
      // Restore saved width on desktop
      var saved = localStorage.getItem(GALLERY_WIDTH_KEY);
      if (saved) {
        var w = parseInt(saved, 10);
        if (w >= GALLERY_MIN_WIDTH && w <= GALLERY_MAX_WIDTH) {
          galleryPane.style.width = w + 'px';
        }
      }
      if (galleryResizer) galleryResizer.classList.add('active');
    }
    galleryOpen = true;
  };

  window.closeGallery = function () {
    // Clear inline width so the CSS width:0 rule takes over and the
    // close transition animates correctly.
    galleryPane.style.width = '';
    galleryPane.classList.remove('open');
    galleryBackdrop.classList.remove('active');
    if (galleryResizer) galleryResizer.classList.remove('active');
    galleryOpen = false;
    // Reset scroll position to prevent iOS Safari layout drift after
    // the fixed-position backdrop is removed.
    window.scrollTo(0, 0);
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
      const wrap = document.createElement('div');
      wrap.className = 'gallery-zoom-wrap';

      const img = document.createElement('img');
      img.src = entry.blobUrl;
      img.alt = entry.name;
      wrap.appendChild(img);

      if (supportsHover) {
        wrap.addEventListener('mouseenter', function () {
          wrap.style.backgroundImage = 'url(' + entry.blobUrl + ')';
          wrap.style.backgroundSize = ZOOM_SCALE + '%';
          wrap.classList.add('zooming');
        });
        wrap.addEventListener('mousemove', function (e) {
          var rect = wrap.getBoundingClientRect();
          var x = ((e.clientX - rect.left) / rect.width) * 100;
          var y = ((e.clientY - rect.top) / rect.height) * 100;
          wrap.style.backgroundPosition = x + '% ' + y + '%';
        });
        wrap.addEventListener('mouseleave', function () {
          wrap.classList.remove('zooming');
          wrap.style.backgroundImage = '';
          wrap.style.backgroundSize = '';
          wrap.style.backgroundPosition = '';
        });
      }

      galleryFocused.appendChild(wrap);

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

  // ── Resize handle (desktop only) ─────────────────────────────────────
  function setupResizer() {
    if (!galleryResizer) return;

    var startX = 0;
    var startW = 0;

    // The resizer sits to the LEFT of the gallery pane, so dragging left
    // (negative delta) should GROW the gallery — hence the negation.
    function applyDelta(clientX) {
      var delta = startX - clientX;
      var newW  = Math.min(
        Math.max(startW + delta, GALLERY_MIN_WIDTH),
        Math.min(GALLERY_MAX_WIDTH, Math.round(window.innerWidth * 0.5))
      );
      galleryPane.style.width = newW + 'px';
    }

    function onMouseMove(e) { applyDelta(e.clientX); }

    function onMouseUp(e) {
      applyDelta(e.clientX);
      endDrag();
    }

    function onTouchMove(e) {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      applyDelta(e.touches[0].clientX);
    }

    function endDrag() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', endDrag);
      galleryResizer.classList.remove('dragging');
      galleryPane.classList.remove('no-transition');
      document.body.style.cursor    = '';
      document.body.style.userSelect = '';
      var w = galleryPane.offsetWidth;
      if (w >= GALLERY_MIN_WIDTH) {
        try { localStorage.setItem(GALLERY_WIDTH_KEY, String(w)); } catch (e) { /* unavailable */ }
      }
    }

    galleryResizer.addEventListener('mousedown', function (e) {
      if (isMobile()) return;
      e.preventDefault();
      startX = e.clientX;
      startW = galleryPane.offsetWidth;
      galleryResizer.classList.add('dragging');
      galleryPane.classList.add('no-transition');
      document.body.style.cursor    = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    galleryResizer.addEventListener('touchstart', function (e) {
      if (isMobile() || e.touches.length !== 1) return;
      e.preventDefault();
      startX = e.touches[0].clientX;
      startW = galleryPane.offsetWidth;
      galleryResizer.classList.add('dragging');
      galleryPane.classList.add('no-transition');
      document.addEventListener('touchmove', onTouchMove, { passive: false });
      document.addEventListener('touchend', endDrag);
    }, { passive: false });
  }

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
    galleryResizer   = document.getElementById('gallery-resizer');

    if (btnGalleryClose)  btnGalleryClose.addEventListener('click', closeGallery);
    if (galleryBackdrop)  galleryBackdrop.addEventListener('click', closeGallery);
    if (btnGalleryToggle) {
      btnGalleryToggle.addEventListener('click', function () {
        if (isGalleryOpen()) closeGallery(); else openGallery();
      });
    }
    setupResizer();
  });
})();

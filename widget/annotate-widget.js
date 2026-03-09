/**
 * AnnotateWidget — Drop-in UI annotation tool for Vercel/web apps
 * Self-contained vanilla JS. No build step, no dependencies.
 * Usage: AnnotateWidget.init({ apiUrl: '/api/annotate', enabled: true })
 */

(function (global) {
  'use strict';

  // ─── Constants ────────────────────────────────────────────────────────────
  const PREFIX = 'annotate-'; // All class/id names prefixed to avoid collisions
  const ACCENT = '#6366f1';   // Indigo accent color

  // ─── State ────────────────────────────────────────────────────────────────
  let _config = {
    apiUrl: '/api/annotate',
    enabled: true,
  };

  let _active = false;          // Is annotation mode on?
  let _hoveredEl = null;        // Currently hovered element
  let _popup = null;            // Current popup DOM node
  let _selectedEl = null;       // Element user clicked on
  let _sessionId = null;        // Per-page-load session ID
  let _clickX = 0;              // Raw click coordinates (viewport)
  let _clickY = 0;

  // ─── Session ID ───────────────────────────────────────────────────────────

  /**
   * Returns (or creates) a session ID stored in sessionStorage.
   * Survives tab refreshes but not new tabs.
   */
  function getSessionId() {
    if (_sessionId) return _sessionId;
    try {
      const key = `${PREFIX}session_id`;
      let id = sessionStorage.getItem(key);
      if (!id) {
        id = 'aw-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
        sessionStorage.setItem(key, id);
      }
      _sessionId = id;
      return id;
    } catch (e) {
      // sessionStorage blocked (private mode, etc.) — fall back to in-memory
      _sessionId = 'aw-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
      return _sessionId;
    }
  }

  // ─── CSS Selector Path ────────────────────────────────────────────────────

  /**
   * Walks up the DOM from `el` and builds a human-readable CSS selector path.
   * Example output: body > main > .hero-section > button.cta
   */
  function getElementPath(el) {
    try {
      const parts = [];
      let node = el;

      while (node && node.nodeType === Node.ELEMENT_NODE) {
        let segment = node.tagName.toLowerCase();

        // Add id if present (very specific — stop here)
        if (node.id) {
          segment += '#' + node.id;
          parts.unshift(segment);
          break;
        }

        // Add up to 2 meaningful classes (skip widget's own classes)
        const classes = Array.from(node.classList)
          .filter(c => !c.startsWith(PREFIX))
          .slice(0, 2);
        if (classes.length) {
          segment += '.' + classes.join('.');
        }

        parts.unshift(segment);

        // Stop at body
        if (node.tagName.toLowerCase() === 'body') break;
        node = node.parentElement;
      }

      return parts.join(' > ') || el.tagName.toLowerCase();
    } catch (e) {
      return el.tagName ? el.tagName.toLowerCase() : 'unknown';
    }
  }

  /**
   * Short element label for popup header: tag + first class
   * Example: "button.cta"
   */
  function getElementLabel(el) {
    try {
      const tag = el.tagName.toLowerCase();
      const cls = Array.from(el.classList).find(c => !c.startsWith(PREFIX));
      return cls ? `${tag}.${cls}` : tag;
    } catch (e) {
      return 'element';
    }
  }

  /**
   * Gets nearby text content — text of the element and its closest ancestor
   * with meaningful text, trimmed to 200 chars.
   */
  function getNearbyText(el) {
    try {
      const text = el.innerText || el.textContent || '';
      if (text.trim()) return text.trim().slice(0, 200);

      // Check parent
      const parent = el.parentElement;
      if (parent) {
        const parentText = parent.innerText || parent.textContent || '';
        return parentText.trim().slice(0, 200);
      }
      return '';
    } catch (e) {
      return '';
    }
  }

  // ─── Styles ───────────────────────────────────────────────────────────────

  /**
   * Injects all widget styles as a single <style> tag.
   * Uses prefixed class names throughout to avoid leaking into host app.
   */
  function injectStyles() {
    if (document.getElementById(`${PREFIX}styles`)) return;

    const css = `
      /* AnnotateWidget — injected styles */

      .${PREFIX}toggle-btn {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 2147483646;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        border: 2px solid ${ACCENT};
        background: #fff;
        color: ${ACCENT};
        font-size: 20px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 14px rgba(99,102,241,0.3);
        transition: background 0.18s, color 0.18s, transform 0.15s;
        outline: none;
        user-select: none;
      }

      .${PREFIX}toggle-btn:hover {
        transform: scale(1.08);
        box-shadow: 0 6px 20px rgba(99,102,241,0.45);
      }

      .${PREFIX}toggle-btn.${PREFIX}active {
        background: ${ACCENT};
        color: #fff;
      }

      /* Hover highlight — semi-transparent indigo border outline */
      .${PREFIX}highlight {
        outline: 2px solid ${ACCENT} !important;
        outline-offset: 2px !important;
        cursor: crosshair !important;
        position: relative;
      }

      /* Annotation popup */
      .${PREFIX}popup {
        position: fixed;
        z-index: 2147483647;
        background: #1e1e2e;
        color: #e2e8f0;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.45), 0 0 0 1px rgba(99,102,241,0.3);
        padding: 16px;
        width: 300px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 13px;
        line-height: 1.5;
        animation: ${PREFIX}popIn 0.15s ease;
      }

      @keyframes ${PREFIX}popIn {
        from { opacity: 0; transform: scale(0.95) translateY(4px); }
        to   { opacity: 1; transform: scale(1) translateY(0); }
      }

      .${PREFIX}popup-header {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: ${ACCENT};
        margin-bottom: 10px;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .${PREFIX}element-label {
        font-family: 'SFMono-Regular', 'Menlo', monospace;
        background: rgba(99,102,241,0.15);
        border-radius: 4px;
        padding: 2px 6px;
        font-size: 11px;
        color: #a5b4fc;
      }

      .${PREFIX}textarea {
        width: 100%;
        box-sizing: border-box;
        background: #2a2a3e;
        border: 1px solid rgba(99,102,241,0.3);
        border-radius: 8px;
        color: #e2e8f0;
        font-size: 13px;
        font-family: inherit;
        padding: 8px 10px;
        resize: vertical;
        min-height: 72px;
        outline: none;
        transition: border-color 0.15s;
        margin-bottom: 12px;
      }

      .${PREFIX}textarea:focus {
        border-color: ${ACCENT};
      }

      .${PREFIX}textarea::placeholder {
        color: #64748b;
      }

      .${PREFIX}label {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.07em;
        color: #94a3b8;
        margin-bottom: 6px;
      }

      .${PREFIX}pills {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 12px;
      }

      .${PREFIX}pill {
        padding: 4px 10px;
        border-radius: 999px;
        border: 1px solid rgba(99,102,241,0.35);
        background: #2a2a3e;
        color: #94a3b8;
        font-size: 12px;
        cursor: pointer;
        transition: background 0.12s, color 0.12s, border-color 0.12s;
        user-select: none;
      }

      .${PREFIX}pill:hover {
        border-color: ${ACCENT};
        color: #e2e8f0;
      }

      .${PREFIX}pill.${PREFIX}pill-selected {
        background: ${ACCENT};
        border-color: ${ACCENT};
        color: #fff;
      }

      .${PREFIX}actions {
        display: flex;
        gap: 8px;
        margin-top: 4px;
      }

      .${PREFIX}btn {
        flex: 1;
        padding: 8px 0;
        border-radius: 8px;
        border: none;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: opacity 0.12s, transform 0.1s;
        outline: none;
      }

      .${PREFIX}btn:hover {
        opacity: 0.88;
        transform: translateY(-1px);
      }

      .${PREFIX}btn-submit {
        background: ${ACCENT};
        color: #fff;
      }

      .${PREFIX}btn-cancel {
        background: #2a2a3e;
        color: #94a3b8;
        border: 1px solid rgba(99,102,241,0.25);
      }

      /* Toast notifications */
      .${PREFIX}toast {
        position: fixed;
        bottom: 84px;
        right: 24px;
        z-index: 2147483647;
        background: #1e1e2e;
        color: #e2e8f0;
        border-radius: 10px;
        padding: 10px 16px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 13px;
        font-weight: 500;
        box-shadow: 0 4px 20px rgba(0,0,0,0.4), 0 0 0 1px rgba(99,102,241,0.3);
        animation: ${PREFIX}toastIn 0.18s ease;
        pointer-events: none;
        white-space: nowrap;
      }

      .${PREFIX}toast.${PREFIX}toast-success {
        border-left: 3px solid #4ade80;
      }

      .${PREFIX}toast.${PREFIX}toast-error {
        border-left: 3px solid #f87171;
      }

      @keyframes ${PREFIX}toastIn {
        from { opacity: 0; transform: translateY(6px); }
        to   { opacity: 1; transform: translateY(0); }
      }
    `;

    const style = document.createElement('style');
    style.id = `${PREFIX}styles`;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ─── Toggle Button ────────────────────────────────────────────────────────

  function createToggleButton() {
    const btn = document.createElement('button');
    btn.id = `${PREFIX}toggle`;
    btn.className = `${PREFIX}toggle-btn`;
    btn.title = 'Toggle annotation mode';
    btn.setAttribute('aria-label', 'Toggle annotation mode');
    btn.innerHTML = '✏️';
    btn.addEventListener('click', toggleAnnotationMode);
    document.body.appendChild(btn);
    return btn;
  }

  function getToggleButton() {
    return document.getElementById(`${PREFIX}toggle`);
  }

  // ─── Annotation Mode ──────────────────────────────────────────────────────

  function toggleAnnotationMode() {
    _active ? deactivate() : activate();
  }

  function activate() {
    _active = true;
    const btn = getToggleButton();
    if (btn) btn.classList.add(`${PREFIX}active`);
    document.addEventListener('mouseover', onMouseOver, true);
    document.addEventListener('mouseout', onMouseOut, true);
    document.addEventListener('click', onElementClick, true);
    document.addEventListener('keydown', onKeyDown, true);
  }

  function deactivate() {
    _active = false;
    const btn = getToggleButton();
    if (btn) btn.classList.remove(`${PREFIX}active`);
    removeHighlight();
    closePopup();
    document.removeEventListener('mouseover', onMouseOver, true);
    document.removeEventListener('mouseout', onMouseOut, true);
    document.removeEventListener('click', onElementClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    _hoveredEl = null;
  }

  // ─── Hover Highlighting ───────────────────────────────────────────────────

  function onMouseOver(e) {
    try {
      const el = e.target;
      // Don't highlight widget's own elements
      if (isWidgetElement(el)) return;
      if (_hoveredEl === el) return;

      removeHighlight();
      _hoveredEl = el;
      el.classList.add(`${PREFIX}highlight`);
    } catch (_) {}
  }

  function onMouseOut(e) {
    try {
      const el = e.target;
      if (el === _hoveredEl) {
        el.classList.remove(`${PREFIX}highlight`);
        _hoveredEl = null;
      }
    } catch (_) {}
  }

  function removeHighlight() {
    if (_hoveredEl) {
      try { _hoveredEl.classList.remove(`${PREFIX}highlight`); } catch (_) {}
    }
    // Belt-and-suspenders: clear any lingering highlights
    document.querySelectorAll(`.${PREFIX}highlight`).forEach(el => {
      el.classList.remove(`${PREFIX}highlight`);
    });
  }

  /**
   * Returns true if `el` is part of the AnnotateWidget UI itself.
   */
  function isWidgetElement(el) {
    try {
      if (!el) return false;
      // Check the element and all its ancestors
      let node = el;
      while (node) {
        if (
          node.id === `${PREFIX}toggle` ||
          (node.className && typeof node.className === 'string' &&
            node.className.split(' ').some(c => c.startsWith(PREFIX)))
        ) return true;
        node = node.parentElement;
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  // ─── Click Handler ────────────────────────────────────────────────────────

  function onElementClick(e) {
    try {
      if (isWidgetElement(e.target)) return;

      e.preventDefault();
      e.stopPropagation();

      _selectedEl = e.target;
      _clickX = e.clientX;
      _clickY = e.clientY;

      removeHighlight();
      openPopup(_selectedEl, _clickX, _clickY);
    } catch (err) {
      console.warn('[AnnotateWidget] click handler error:', err);
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      deactivate();
    }
  }

  // ─── Popup ────────────────────────────────────────────────────────────────

  function openPopup(el, clickX, clickY) {
    closePopup(); // Ensure no duplicate

    const popup = document.createElement('div');
    popup.className = `${PREFIX}popup`;
    popup.id = `${PREFIX}popup`;

    // ── Header ──
    const header = document.createElement('div');
    header.className = `${PREFIX}popup-header`;
    header.innerHTML = `
      <span>Annotate</span>
      <span class="${PREFIX}element-label">${escapeHtml(getElementLabel(el))}</span>
    `;
    popup.appendChild(header);

    // ── Comment textarea ──
    const textarea = document.createElement('textarea');
    textarea.className = `${PREFIX}textarea`;
    textarea.placeholder = "What's wrong here?";
    textarea.rows = 3;
    popup.appendChild(textarea);

    // ── Intent selector ──
    const intentLabel = document.createElement('div');
    intentLabel.className = `${PREFIX}label`;
    intentLabel.textContent = 'Intent';
    popup.appendChild(intentLabel);

    const intents = [
      { value: 'fix', label: '🔧 Fix' },
      { value: 'change', label: '✏️ Change' },
      { value: 'question', label: '❓ Question' },
      { value: 'approve', label: '✅ Approve' },
    ];
    const intentState = { value: 'fix' };
    const intentPills = createPillGroup(intents, intentState);
    popup.appendChild(intentPills);

    // ── Severity selector ──
    const severityLabel = document.createElement('div');
    severityLabel.className = `${PREFIX}label`;
    severityLabel.textContent = 'Severity';
    popup.appendChild(severityLabel);

    const severities = [
      { value: 'blocking', label: '🔴 Blocking' },
      { value: 'important', label: '🟡 Important' },
      { value: 'suggestion', label: '💡 Suggestion' },
    ];
    const severityState = { value: 'blocking' };
    const severityPills = createPillGroup(severities, severityState);
    popup.appendChild(severityPills);

    // ── Actions ──
    const actions = document.createElement('div');
    actions.className = `${PREFIX}actions`;

    const cancelBtn = document.createElement('button');
    cancelBtn.className = `${PREFIX}btn ${PREFIX}btn-cancel`;
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', closePopup);

    const submitBtn = document.createElement('button');
    submitBtn.className = `${PREFIX}btn ${PREFIX}btn-submit`;
    submitBtn.textContent = 'Submit';
    submitBtn.addEventListener('click', () => {
      handleSubmit({
        el,
        clickX,
        clickY,
        comment: textarea.value.trim(),
        intent: intentState.value,
        severity: severityState.value,
      });
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(submitBtn);
    popup.appendChild(actions);

    document.body.appendChild(popup);
    _popup = popup;

    // Position popup near click point (keep within viewport)
    positionPopup(popup, clickX, clickY);

    // Focus textarea
    setTimeout(() => textarea.focus(), 50);
  }

  /**
   * Creates a pill group (intent or severity).
   * `state` is a shared object { value } updated on selection.
   */
  function createPillGroup(options, state) {
    const group = document.createElement('div');
    group.className = `${PREFIX}pills`;

    options.forEach(opt => {
      const pill = document.createElement('button');
      pill.className = `${PREFIX}pill${state.value === opt.value ? ` ${PREFIX}pill-selected` : ''}`;
      pill.textContent = opt.label;
      pill.dataset.value = opt.value;

      pill.addEventListener('click', () => {
        // Deselect all in group
        group.querySelectorAll(`.${PREFIX}pill`).forEach(p => {
          p.classList.remove(`${PREFIX}pill-selected`);
        });
        pill.classList.add(`${PREFIX}pill-selected`);
        state.value = opt.value;
      });

      group.appendChild(pill);
    });

    return group;
  }

  /**
   * Positions popup near (clickX, clickY), clamped inside the viewport.
   */
  function positionPopup(popup, clickX, clickY) {
    const W = popup.offsetWidth || 300;
    const H = popup.offsetHeight || 320;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const MARGIN = 12;

    let left = clickX + 16;
    let top = clickY + 16;

    if (left + W > vw - MARGIN) left = clickX - W - 16;
    if (top + H > vh - MARGIN) top = clickY - H - 16;

    // Hard clamp
    left = Math.max(MARGIN, Math.min(left, vw - W - MARGIN));
    top = Math.max(MARGIN, Math.min(top, vh - H - MARGIN));

    popup.style.left = left + 'px';
    popup.style.top = top + 'px';
  }

  function closePopup() {
    if (_popup) {
      try { _popup.remove(); } catch (_) {}
      _popup = null;
    }
  }

  // ─── Submit ───────────────────────────────────────────────────────────────

  async function handleSubmit({ el, clickX, clickY, comment, intent, severity }) {
    try {
      const rect = el.getBoundingClientRect();
      const scrollY = window.scrollY || 0;
      const scrollX = window.scrollX || 0;

      // Viewport-relative click → absolute page position
      const absX = parseFloat((clickX + scrollX).toFixed(1));
      const absY = parseFloat((clickY + scrollY).toFixed(1));

      const payload = {
        session_id: getSessionId(),
        url: window.location.href,
        element: el.tagName.toLowerCase(),
        element_path: getElementPath(el),
        comment,
        intent,
        severity,
        x: absX,
        y: absY,
        bounding_box: {
          x: parseFloat((rect.left + scrollX).toFixed(1)),
          y: parseFloat((rect.top + scrollY).toFixed(1)),
          width: parseFloat(rect.width.toFixed(1)),
          height: parseFloat(rect.height.toFixed(1)),
        },
        css_classes: Array.from(el.classList)
          .filter(c => !c.startsWith(PREFIX))
          .join(' '),
        nearby_text: getNearbyText(el),
        selected_text: (() => {
          try { return window.getSelection().toString(); } catch (_) { return ''; }
        })(),
      };

      closePopup();

      const res = await fetch(_config.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      showToast('Annotation saved ✓', 'success');
    } catch (err) {
      console.error('[AnnotateWidget] submit error:', err);
      showToast('Failed to save. Try again.', 'error');
    }
  }

  // ─── Toast ────────────────────────────────────────────────────────────────

  function showToast(message, type = 'success') {
    try {
      // Remove existing toast
      const existing = document.getElementById(`${PREFIX}toast`);
      if (existing) existing.remove();

      const toast = document.createElement('div');
      toast.id = `${PREFIX}toast`;
      toast.className = `${PREFIX}toast ${PREFIX}toast-${type}`;
      toast.textContent = message;
      document.body.appendChild(toast);

      // Auto-dismiss after 2.5s
      setTimeout(() => {
        try { toast.remove(); } catch (_) {}
      }, 2500);
    } catch (_) {}
  }

  // ─── Utility ──────────────────────────────────────────────────────────────

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  const AnnotateWidget = {
    /**
     * Initialize the widget.
     * @param {Object} options
     * @param {string}  options.apiUrl   - Endpoint to POST annotations to (default: '/api/annotate')
     * @param {boolean} options.enabled  - Whether the widget should be visible (default: true)
     */
    init(options) {
      try {
        _config = Object.assign({ apiUrl: '/api/annotate', enabled: true }, options);

        // Bail out if disabled
        if (!_config.enabled) return;

        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', _mount);
        } else {
          _mount();
        }
      } catch (err) {
        console.warn('[AnnotateWidget] init error:', err);
      }
    },

    /** Programmatically activate annotation mode. */
    activate() {
      try { activate(); } catch (_) {}
    },

    /** Programmatically deactivate annotation mode. */
    deactivate() {
      try { deactivate(); } catch (_) {}
    },

    /** Returns true if annotation mode is currently on. */
    isActive() {
      return _active;
    },
  };

  function _mount() {
    try {
      injectStyles();
      createToggleButton();
    } catch (err) {
      console.warn('[AnnotateWidget] mount error:', err);
    }
  }

  // Expose globally
  global.AnnotateWidget = AnnotateWidget;

})(window);

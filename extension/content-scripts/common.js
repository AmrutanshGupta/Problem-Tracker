(function () {
  const config = window.__PT_CONFIG;
  if (!config) return;
  const info = config.getProblemInfo();
  if (!info) return;

  const STATUS_ORDER = ['unsolved', 'solved'];
  const STATUS_LABEL = { unsolved: 'Unsolved', solved: 'Solved' };

  let record = null;
  let saveTimer = null;
  let outsideClickHandler = null;

  // DOM Hosts
  let host, shadow, pill, panel;
  let timerHost; // holds the isolated timer <iframe> — content script does not touch its internals

  function nowLabel() {
    return new Date().toISOString();
  }

  // Display-only formatting for the mirrored timeSpent value stored on the
  // bookmark record. The actual counting happens entirely in the timer's
  // own isolated page — this just renders whatever number it last stamped here.
  function formatTime(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }

  // Best-effort measurement of LeetCode's top nav bar so the timer centers
  // vertically against it exactly, instead of a guessed pixel offset.
  function getLeetcodeNavBarHeight() {
    const candidates = ['#navbar', 'nav', 'header'];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el) {
        const rect = el.getBoundingClientRect();
        if (rect.top <= 1 && rect.height > 0 && rect.height < 200) {
          return rect.height;
        }
      }
    }
    return 48; // sane fallback if the nav bar can't be located
  }

  function mount() {
    // 1. Mount the Main Bookmark Panel
    const existing = document.getElementById('pt-host');
    if (existing) existing.remove();

    host = document.createElement('div');
    host.id = 'pt-host';


    Object.assign(host.style, {
      all: 'initial', position: 'fixed', bottom: '110px', right: '22px', zIndex: 2147483647
    });

    document.documentElement.appendChild(host);

    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host {
          all: initial;
          --bg: #0D0E15;
          --bg-alt: #161824;
          --border: #2A2D40;
          --accent: #19F9D8; 
          --accent-glow: rgba(25, 249, 216, 0.6);
          --unsolved: #4A70A9;
          --text: #EFECE3;
          --muted: #8FABD4;
          --font-display: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', Roboto, sans-serif;
          --font-body: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          --font-mono: ui-monospace, 'JetBrains Mono', 'Cascadia Code', monospace;
        }
        
        * { box-sizing: border-box; font-family: var(--font-body); }
        
        .pill {
          width: 58px; height: 58px; border-radius: 50%; border: none;
          display: flex; align-items: center; justify-content: center; cursor: pointer;
          background: rgba(30, 30, 34, 0.65);
          backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 4px 16px rgba(0,0,0,0.6);
          transition: all 0.25s cubic-bezier(0.25, 0.8, 0.25, 1);
        }
        
        .pill:hover { 
          transform: translateY(-3px) scale(1.05); 
          border-color: rgba(255, 255, 255, 0.2);
          box-shadow: 0 8px 24px var(--accent-glow); 
        }
        
        .pill svg { width: 28px; height: 28px; }
        
        .pill.not-bookmarked #pt-icon-path { 
          fill: none; stroke: var(--accent); stroke-width: 2; 
          filter: drop-shadow(0 0 3px var(--accent-glow));
        }
        
        .pill.bookmarked { background: rgba(25, 249, 216, 0.15); border-color: var(--accent); }
        .pill.bookmarked #pt-icon-path { 
          fill: var(--accent); stroke: none; 
          filter: drop-shadow(0 0 6px var(--accent-glow));
        }
        
        .panel {
          width: 320px; background: var(--bg); border: 1px solid var(--border);
          border-radius: 12px; padding: 16px; color: var(--text);
          box-shadow: 0 14px 34px rgba(0,0,0,0.75); font-size: 13px; line-height: 1.4;
        }
        .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .platform-chip { display: flex; align-items: center; gap: 8px; }
        .favicon { width: 16px; height: 16px; border-radius: 4px; background: #fff; padding: 2px; }
        .platform { font-family: var(--font-display); font-size: 12px; font-weight: 600; color: var(--muted); }
        
        /* New Action Icons */
        .action-icons { display: flex; gap: 14px; align-items: center; }
        .icon-btn { cursor: pointer; color: var(--muted); font-size: 15px; transition: color 0.2s; user-select: none; }
        .icon-btn:hover { color: var(--text); }
        .icon-btn.trash:hover { color: #FF3F33; }
        
        .title { font-family: var(--font-display); font-weight: 600; font-size: 15px; margin: 12px 0; color: var(--text); }
        
        .statuses { display: flex; gap: 6px; margin-bottom: 12px; }
        .status-btn {
          flex: 1; text-align: center; padding: 8px 4px; border-radius: 6px;
          border: 1px solid var(--border); background: var(--bg-alt); color: var(--muted);
          font-size: 12px; font-weight: 600; cursor: pointer;
        }
        .status-btn.active[data-status="unsolved"] { background: rgba(74,112,169,0.22); border-color: var(--unsolved); color: var(--text); }
        .status-btn.active[data-status="solved"] { background: rgba(25, 249, 216, 0.16); border-color: var(--accent); color: var(--accent); }
        
        textarea {
          width: 100%; min-height: 60px; resize: vertical; background: var(--bg-alt);
          border: 1px solid var(--border); border-radius: 6px; color: var(--text);
          font-size: 13px; padding: 10px; font-family: var(--font-body);
        }
        textarea:focus { outline: none; border-color: var(--accent); }
        .footer { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; }
        .saved-tag { font-family: var(--font-mono); font-size: 11px; color: var(--muted); }
        .open-settings { font-size: 12px; font-weight: 600; color: var(--accent); cursor: pointer; text-decoration: none; }
        .open-settings:hover { text-decoration: underline; }
      </style>
      <div id="pt-collapsed" class="pill" title="Bookmark this problem">
        <svg viewBox="0 0 24 24"><path id="pt-icon-path" d="M6 2h12a1 1 0 0 1 1 1v19l-7-4-7 4V3a1 1 0 0 1 1-1z"/></svg>
      </div>
      <div id="pt-expanded" class="panel" style="display:none;"></div>
    `;

    pill = shadow.getElementById('pt-collapsed');
    panel = shadow.getElementById('pt-expanded');

    pill.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!record.bookmarked) {
        record.bookmarked = true;
        if (!record.addedAt) record.addedAt = nowLabel();
        if (!record.status) record.status = 'unsolved';
        record = await PTStorage.upsert(record);
        refreshPillVisual();
      }
      expandPanel();
    });

    // 2. Mount the Floating Timer as an ISOLATED extension page in an iframe.
    // This keeps it completely outside the host page's style/DOM pipeline, so
    // page-level style injectors (e.g. Dark Reader) cannot recolor it, and it
    // manages its own auto-start / storage independently of this content script.
    const existingTimer = document.getElementById('pt-timer-host');
    if (existingTimer) existingTimer.remove();

    timerHost = document.createElement('div');
    timerHost.id = 'pt-timer-host';

    if (config.platform === 'leetcode') {
      const navBarHeight = getLeetcodeNavBarHeight();
      Object.assign(timerHost.style, {
        all: 'initial', position: 'fixed', top: '0', left: '50%',
        transform: 'translateX(220px)', // horizontal position unchanged
        height: `${navBarHeight}px`, display: 'flex', alignItems: 'center',
        zIndex: 2147483647
      });
    } else {
      Object.assign(timerHost.style, {
        all: 'initial', position: 'fixed', bottom: '22px', left: '22px', zIndex: 2147483647
      });
    }

    const timerFrame = document.createElement('iframe');
    timerFrame.id = 'pt-timer-frame';
    timerFrame.src = chrome.runtime.getURL('pt-timer-frame.html') + '?id=' + encodeURIComponent(info.id);
    Object.assign(timerFrame.style, {
      all: 'initial', border: '0', background: 'transparent',
      // Snug fit + rounded + clipped: if the iframe's transparency doesn't
      // render on a given page, this still looks like a clean rounded pill
      // instead of a plain white rectangle.
      width: '160px', height: '36px', borderRadius: '18px', overflow: 'hidden'
    });
    timerHost.appendChild(timerFrame);

    document.documentElement.appendChild(timerHost);

    refreshPillVisual();
  }

  function refreshPillVisual() {
    if (!pill) return;
    pill.classList.toggle('bookmarked', !!record.bookmarked);
    pill.classList.toggle('not-bookmarked', !record.bookmarked);
    // Timer lives entirely inside its own iframe now — nothing to sync here.
  }

  function expandPanel() {
    pill.style.display = 'none';
    panel.style.display = 'block';
    renderPanel();
    attachOutsideClickHandler();
  }

  function collapsePanel() {
    panel.style.display = 'none';
    pill.style.display = 'flex';
    detachOutsideClickHandler();
  }

  function attachOutsideClickHandler() {
    detachOutsideClickHandler();
    outsideClickHandler = (e) => {
      const path = e.composedPath ? e.composedPath() : [];
      if (!path.includes(host)) {
        collapsePanel();
      }
    };
    document.addEventListener('click', outsideClickHandler, true);
  }

  function detachOutsideClickHandler() {
    if (outsideClickHandler) {
      document.removeEventListener('click', outsideClickHandler, true);
      outsideClickHandler = null;
    }
  }

  // --- Real-Time State Sync (Cross-Tab Support) — bookmark data only.
  // The timer iframe listens to chrome.storage.onChanged for its own key
  // (pt_timers) and for pt_problems (to auto-pause on solved) independently.
  chrome.storage.onChanged.addListener((changes) => {
    if (changes['pt_problems']) {
      const allProblems = changes['pt_problems'].newValue || {};
      const updatedRecord = allProblems[info.id];

      if (!updatedRecord || !updatedRecord.bookmarked) {
        record.bookmarked = false;
        if (panel && panel.style.display === 'block') collapsePanel();
        refreshPillVisual();
      } else {
        record = updatedRecord;
        refreshPillVisual();
      }
    }
  });

  function renderPanel() {
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${new URL(info.url).hostname}&sz=32`;

    panel.innerHTML = `
      <div class="row">
        <div class="platform-chip">
          <img src="${faviconUrl}" class="favicon" alt="logo" />
          <span class="platform">${config.platformLabel}</span>
        </div>
        <div class="action-icons">
          <span class="icon-btn trash" id="pt-remove" title="Remove from Tracker">🗑️</span>
          <span class="icon-btn" id="pt-close" title="Close Panel">✕</span>
        </div>
      </div>
      <div class="title">${escapeHtml(info.title)}</div>

      <div class="statuses">
        ${STATUS_ORDER.map(s => `
          <button class="status-btn ${record.status === s ? 'active' : ''}" data-status="${s}">
            ${STATUS_LABEL[s]}
          </button>
        `).join('')}
      </div>
      <textarea id="pt-notes" placeholder="Notes, pattern tags, approach...">${escapeHtml(record.notes || '')}</textarea>
      <div class="footer">
        <span class="saved-tag">${record.addedAt ? 'tracked' : 'not saved yet'}${record.timeSpent ? ' · ' + formatTime(record.timeSpent) : ''}</span>
        <span class="open-settings" id="pt-open-settings">View all →</span>
      </div>
    `;

    panel.addEventListener('click', (e) => e.stopPropagation());

    panel.querySelector('#pt-close').addEventListener('click', (e) => {
      e.stopPropagation();
      collapsePanel();
    });

    // Remove: wipes ONLY the bookmark record (pt_problems). The timer lives in
    // its own storage bucket (pt_timers) inside the isolated iframe and is
    // never touched here, so it keeps its progress and keeps running.
    panel.querySelector('#pt-remove').addEventListener('click', async (e) => {
      e.stopPropagation();

      await PTStorage.remove(info.id);

      record = {
        id: info.id, platform: config.platform, platformLabel: config.platformLabel,
        title: info.title, url: info.url, status: 'unsolved', bookmarked: false,
        notes: '', addedAt: null
      };

      collapsePanel();
      refreshPillVisual();
    });

    panel.querySelectorAll('.status-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        record.status = btn.dataset.status;
        if (!record.addedAt) record.addedAt = nowLabel();

        // No need to touch the timer here — the iframe watches pt_problems
        // itself and auto-pauses the moment status becomes 'solved'.
        record = await PTStorage.upsert(record);
        renderPanel();
      });
    });

    const notesArea = panel.querySelector('#pt-notes');
    notesArea.addEventListener('input', (e) => {
      record.notes = e.target.value;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        if (!record.addedAt) record.addedAt = nowLabel();
        record = await PTStorage.upsert(record);
      }, 500);
    });

    panel.querySelector('#pt-open-settings').addEventListener('click', (e) => {
      e.stopPropagation();
      window.open(chrome.runtime.getURL('options/options.html'), '_blank');
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  async function init() {
    const all = await PTStorage.getAll();
    record = all[info.id] || {
      id: info.id, platform: config.platform, platformLabel: config.platformLabel,
      title: info.title, url: info.url, status: 'unsolved', bookmarked: false,
      notes: '', addedAt: null
    };

    mount();
  }

  init();
})();
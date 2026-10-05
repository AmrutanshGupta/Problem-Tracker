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
          --bg: #080909;
          --surface: #0f1011;
          --surface-2: #151618;
          --border: #1c1d20;
          --border-2: #252729;
          --accent: #22d3ee; 
          --accent-glow: rgba(34, 211, 238, 0.4);
          --green: #10b981;
          --text: #e9eaec;
          --text-2: #80838f;
          --text-3: #44464f;
          --red: #f87171;
          --font: 'Geist', ui-sans-serif, -apple-system, sans-serif;
          --font-mono: ui-monospace, 'JetBrains Mono', monospace;
          --radius: 7px;
          --radius-sm: 4px;
        }
        
        * { box-sizing: border-box; font-family: var(--font); }
        
        .pill {
          width: 54px; height: 54px; border-radius: 50%; border: none;
          display: flex; align-items: center; justify-content: center; cursor: pointer;
          background: var(--surface);
          border: 1px solid var(--border-2);
          box-shadow: 0 4px 16px rgba(0,0,0,0.6);
          transition: all 0.2s;
        }
        
        .pill:hover { 
          transform: translateY(-2px); 
          border-color: rgba(34, 211, 238, 0.5);
          box-shadow: 0 8px 24px var(--accent-glow); 
        }
        
        .pill svg { width: 24px; height: 24px; }
        
        .pill.not-bookmarked #pt-icon-path { 
          fill: none; stroke: var(--text-3); stroke-width: 2; 
        }
        
        .pill.not-bookmarked:hover #pt-icon-path { stroke: var(--accent); }
        
        .pill.bookmarked { background: rgba(34, 211, 238, 0.08); border-color: var(--accent); }
        .pill.bookmarked #pt-icon-path { 
          fill: var(--accent); stroke: none; 
        }
        
        .panel {
          width: 320px; background: var(--bg); border: 1px solid var(--border);
          border-radius: 10px; padding: 14px; color: var(--text);
          box-shadow: 0 14px 34px rgba(0,0,0,0.75); font-size: 13px; line-height: 1.4;
        }
        .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .platform-chip { display: flex; align-items: center; gap: 8px; }
        
        .platform-icon-wrap {
          width: 22px; height: 22px; border-radius: var(--radius-sm);
          display: flex; align-items: center; justify-content: center; overflow: hidden;
        }
        
        .platform { font-size: 12px; font-weight: 600; color: var(--text-2); }
        
        /* New Action Icons */
        .action-icons { display: flex; gap: 6px; align-items: center; }
        .icon-btn { 
          cursor: pointer; color: var(--text-3); display: flex; align-items: center; justify-content: center;
          width: 26px; height: 26px; border-radius: var(--radius-sm); transition: all 0.15s;
        }
        .icon-btn:hover { color: var(--text); background: var(--surface-2); }
        .icon-btn.trash:hover { color: var(--red); background: rgba(248, 113, 113, 0.09); }
        
        .title { font-weight: 600; font-size: 14px; margin: 12px 0; color: var(--text); line-height: 1.3; }
        
        .statuses { display: flex; gap: 6px; margin-bottom: 12px; }
        .status-btn {
          flex: 1; text-align: center; padding: 7px 4px; border-radius: var(--radius-sm);
          border: 1px solid var(--border); background: var(--surface); color: var(--text-3);
          font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.1s;
        }
        .status-btn:hover { background: var(--surface-2); color: var(--text); }
        .status-btn.active[data-status="unsolved"] { background: var(--surface-2); border-color: var(--border-2); color: var(--text); }
        .status-btn.active[data-status="solved"] { background: rgba(16, 185, 129, 0.09); border-color: rgba(16, 185, 129, 0.22); color: var(--green); }
        
        textarea {
          width: 100%; min-height: 60px; resize: vertical; background: var(--surface);
          border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text);
          font-size: 13px; padding: 10px; font-family: var(--font); outline: none;
          transition: border-color 0.12s, background 0.12s;
        }
        textarea:placeholder { color: var(--text-3); }
        textarea:focus { border-color: rgba(34, 211, 238, 0.22); background: var(--surface-2); }
        .footer { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; }
        .saved-tag { font-family: var(--font-mono); font-size: 11px; color: var(--text-3); }
        .open-settings { font-size: 12px; font-weight: 500; color: var(--accent); cursor: pointer; text-decoration: none; padding: 3px 6px; border-radius: var(--radius-sm); transition: background 0.1s; margin-right: -6px;}
        .open-settings:hover { background: rgba(34, 211, 238, 0.08); }
      </style>
      <div id="pt-collapsed" class="pill" title="Bookmark this problem">
        <svg viewBox="0 0 24 24"><path id="pt-icon-path" d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" stroke-linecap="round" stroke-linejoin="round"/></svg>
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
        // Save to local storage immediately (instant UI feedback)
        record = await PTStorage.upsert(record);
        refreshPillVisual();
        // Also send to server via background (handles offline queueing)
        chrome.runtime.sendMessage({
          action: "BOOKMARK_UPSERT",
          payload: {
            problem_id: record.id,
            platform: record.platform,
            title: record.title,
            url: record.url,
            status: record.status,
            notes: record.notes,
          }
        });
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

  const PLATFORM_ICONS = {
    leetcode: `
      <svg viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg" width="22" height="22">
        <rect width="22" height="22" rx="4" fill="#FFA11614"/>
        <path d="M8 15.5h6" stroke="#FFA116" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M13.5 6.5 9 11l4.5 4.5" stroke="#FFA116" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      </svg>`,
    codeforces: `
      <svg viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg" width="22" height="22">
        <rect width="22" height="22" rx="4" fill="#1C86EE14"/>
        <rect x="5"  y="13" width="3" height="5" rx="1" fill="#EE4444"/>
        <rect x="9.5" y="9"  width="3" height="9" rx="1" fill="#1C86EE"/>
        <rect x="14" y="5"  width="3" height="13" rx="1" fill="#1C86EE"/>
      </svg>`,
    cses: `
      <svg viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg" width="22" height="22">
        <rect width="22" height="22" rx="4" fill="#2DB55D14"/>
        <path d="M14.5 8a5 5 0 1 0 0 6" stroke="#2DB55D" stroke-width="1.7" stroke-linecap="round" fill="none"/>
      </svg>`,
    atcoder: `
      <svg viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg" width="22" height="22">
        <rect width="22" height="22" rx="4" fill="#00A0D614"/>
        <path d="M11 5.5 16.5 16H5.5L11 5.5Z" stroke="#00A0D6" stroke-width="1.6" stroke-linejoin="round" fill="none"/>
        <path d="M8.5 13.5h5" stroke="#00A0D6" stroke-width="1.4" stroke-linecap="round"/>
      </svg>`,
  };

  function renderPanel() {
    const platformIcon = PLATFORM_ICONS[config.platform] || `
      <svg viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg" width="22" height="22">
        <rect width="22" height="22" rx="4" fill="#1c1d2014"/>
        <circle cx="11" cy="11" r="4" stroke="#44464f" stroke-width="1.5"/>
      </svg>`;

    panel.innerHTML = `
      <div class="row">
        <div class="platform-chip">
          <div class="platform-icon-wrap">${platformIcon}</div>
          <span class="platform">${config.platformLabel}</span>
        </div>
        <div class="action-icons">
          <span class="icon-btn trash" id="pt-remove" title="Remove from Tracker">
            <svg viewBox="0 0 24 24" fill="none" width="14" height="14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </span>
          <span class="icon-btn" id="pt-close" title="Close Panel">
            <svg viewBox="0 0 24 24" fill="none" width="14" height="14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </span>
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
      chrome.runtime.sendMessage({ action: "BOOKMARK_REMOVE", problem_id: info.id });

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
        // Sync status to server
        chrome.runtime.sendMessage({
          action: "BOOKMARK_STATUS",
          problem_id: record.id,
          status: record.status,
        });
      });
    });

    const notesArea = panel.querySelector('#pt-notes');
    notesArea.addEventListener('input', (e) => {
      record.notes = e.target.value;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        if (!record.addedAt) record.addedAt = nowLabel();
        record = await PTStorage.upsert(record);
        chrome.runtime.sendMessage({
          action: "BOOKMARK_UPSERT",
          payload: {
            problem_id: record.id,
            platform: record.platform,
            title: record.title,
            url: record.url,
            status: record.status,
            notes: record.notes,
          }
        });
      }, 500);
    });

    panel.querySelector('#pt-open-settings').addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' });
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
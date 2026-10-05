/* ── Platform SVG icons ──────────────────────────────────────────────
   Each icon is a 22×22 wrapper with the platform's brand mark inside.
   Colors are kept close to official brand palettes but desaturated
   slightly to fit the dark theme. ──────────────────────────────────── */

const PLATFORM_ICONS = {
  leetcode: `
    <svg viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg" width="22" height="22">
      <rect width="22" height="22" rx="4" fill="#FFA11614"/>
      <!-- LeetCode "LC" swoosh shape (simplified) -->
      <path d="M8 15.5h6" stroke="#FFA116" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M13.5 6.5 9 11l4.5 4.5" stroke="#FFA116" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>`,

  codeforces: `
    <svg viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg" width="22" height="22">
      <rect width="22" height="22" rx="4" fill="#1C86EE14"/>
      <!-- Codeforces: 3 ascending bars (logo motif) -->
      <rect x="5"  y="13" width="3" height="5" rx="1" fill="#EE4444"/>
      <rect x="9.5" y="9"  width="3" height="9" rx="1" fill="#1C86EE"/>
      <rect x="14" y="5"  width="3" height="13" rx="1" fill="#1C86EE"/>
    </svg>`,

  cses: `
    <svg viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg" width="22" height="22">
      <rect width="22" height="22" rx="4" fill="#2DB55D14"/>
      <!-- CSES: simple "C" arc — Finnish competitive programming -->
      <path d="M14.5 8a5 5 0 1 0 0 6" stroke="#2DB55D" stroke-width="1.7" stroke-linecap="round" fill="none"/>
    </svg>`,

  atcoder: `
    <svg viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg" width="22" height="22">
      <rect width="22" height="22" rx="4" fill="#00A0D614"/>
      <!-- AtCoder: upward triangle (their brand motif) -->
      <path d="M11 5.5 16.5 16H5.5L11 5.5Z" stroke="#00A0D6" stroke-width="1.6" stroke-linejoin="round" fill="none"/>
      <path d="M8.5 13.5h5" stroke="#00A0D6" stroke-width="1.4" stroke-linecap="round"/>
    </svg>`,
};

function getPlatformIcon(platform) {
  return PLATFORM_ICONS[platform] || `
    <svg viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg" width="22" height="22">
      <rect width="22" height="22" rx="4" fill="#1c1d2014"/>
      <circle cx="11" cy="11" r="4" stroke="#44464f" stroke-width="1.5"/>
    </svg>`;
}

/* ── Platform display names ─────────────────────────────────────────── */
const PLATFORM_LABEL = {
  leetcode:   'LeetCode',
  codeforces: 'Codeforces',
  cses:       'CSES',
  atcoder:    'AtCoder',
};

let allProblems = {};

/* ── Formatters ─────────────────────────────────────────────────────── */
function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatTime(totalSeconds) {
  if (!totalSeconds) return '—';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/* ── Render ─────────────────────────────────────────────────────────── */
function render() {
  const search         = document.getElementById('search').value.trim().toLowerCase();
  const platformFilter = document.getElementById('platform-filter').value;
  const statusFilter   = document.getElementById('status-filter').value;

  const rows       = document.getElementById('rows');
  const emptyState = document.getElementById('empty-state');
  const table      = document.getElementById('table');

  const allBookmarked = Object.values(allProblems).filter(p => p.bookmarked);

  const list = allBookmarked
    .filter(p => platformFilter === 'all' ? true : p.platform === platformFilter)
    .filter(p => statusFilter  === 'all' ? true : p.status   === statusFilter)
    .filter(p => search ? p.title.toLowerCase().includes(search) : true)
    .sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));

  if (allBookmarked.length === 0) {
    emptyState.style.display = 'block';
    table.style.display      = 'none';
    updateStats();
    return;
  }

  emptyState.style.display = 'none';
  table.style.display      = 'table';

  rows.innerHTML = list.map(p => `
    <tr data-id="${escapeAttr(p.id)}">
      <td>
        <span class="status-badge ${p.status}">
          ${p.status === 'solved' ? 'Solved' : 'Unsolved'}
        </span>
      </td>
      <td>
        <div class="platform-cell">
          <div class="platform-icon-wrap">
            ${getPlatformIcon(p.platform)}
          </div>
          <span class="platform-label">${PLATFORM_LABEL[p.platform] || escapeHtml(p.platform)}</span>
        </div>
      </td>
      <td class="problem-title">
        <a href="${escapeAttr(p.url)}" target="_blank" rel="noopener">${escapeHtml(p.title)}</a>
      </td>
      <td class="time-cell">${formatTime(p.timeSpent)}</td>
      <td class="notes-cell">${escapeHtml(p.notes || '')}</td>
      <td class="added-cell">${formatDate(p.addedAt)}</td>
      <td>
        <button class="delete-btn" data-id="${escapeAttr(p.id)}" title="Remove bookmark">
          <svg viewBox="0 0 24 24" fill="none" width="13" height="13" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </td>
    </tr>
  `).join('');

  rows.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      const id = e.currentTarget.dataset.id;
      await PTStorage.remove(id);
      delete allProblems[id];
      render();
    });
  });

  updateStats();
}

/* ── Stats ──────────────────────────────────────────────────────────── */
function updateStats() {
  const list   = Object.values(allProblems).filter(p => p.bookmarked);
  const total  = list.length;
  const solved = list.filter(p => p.status === 'solved').length;
  document.getElementById('stats').innerHTML =
    `<span><b>${total}</b> bookmarked</span><span><b>${solved}</b> solved</span>`;
}

/* ── Escape helpers ─────────────────────────────────────────────────── */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}

/* ── Init ───────────────────────────────────────────────────────────── */
async function init() {
  const sessionData = await new Promise(resolve =>
    chrome.storage.local.get(['pt_token', 'pt_username'], resolve)
  );

  const authGuard   = document.getElementById('auth-guard');
  const mainContent = document.getElementById('main-content');
  const userChip    = document.getElementById('user-chip');

  if (!sessionData.pt_token) {
    authGuard.style.display = 'block';
    mainContent.style.display = 'none';
    document.getElementById('open-popup-btn').addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' });
    });
    return;
  }

  authGuard.style.display   = 'none';
  mainContent.style.display = 'block';

  if (sessionData.pt_username) {
    const initials = sessionData.pt_username.slice(0, 2).toUpperCase();
    document.getElementById('options-avatar').textContent  = initials;
    document.getElementById('options-username').textContent = sessionData.pt_username;
    userChip.style.display = 'flex';
  }

  // Load local data immediately for instant render
  allProblems = await PTStorage.getAll();
  render();

  // Then fetch from server and re-render with merged data
  chrome.runtime.sendMessage({ action: "LOAD_BOOKMARKS" }, (response) => {
    if (response && response.ok) {
      PTStorage.getAll().then(merged => {
        allProblems = merged;
        render();
      });
    }
  });

  document.getElementById('search').addEventListener('input', render);
  document.getElementById('platform-filter').addEventListener('change', render);
  document.getElementById('status-filter').addEventListener('change', render);
}

init();
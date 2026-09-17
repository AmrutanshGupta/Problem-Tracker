const PLATFORM_LABEL = {
  leetcode: 'LeetCode',
  codeforces: 'Codeforces',
  cses: 'CSES',
  atcoder: 'AtCoder'
};

let allProblems = {};

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatTime(totalSeconds) {
  if (!totalSeconds) return '00:00';
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

function render() {
  const search = document.getElementById('search').value.trim().toLowerCase();
  const platformFilter = document.getElementById('platform-filter').value;
  const statusFilter = document.getElementById('status-filter').value;

  const rows = document.getElementById('rows');
  const emptyState = document.getElementById('empty-state');
  const table = document.getElementById('table');

  const list = Object.values(allProblems)
    .filter(p => p.bookmarked)
    .filter(p => (platformFilter === 'all' ? true : p.platform === platformFilter))
    .filter(p => {
      if (statusFilter === 'all') return true;
      return p.status === statusFilter;
    })
    .filter(p => (search ? p.title.toLowerCase().includes(search) : true))
    .sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));

  if (Object.values(allProblems).filter(p => p.bookmarked).length === 0) {
    emptyState.style.display = 'block';
    table.style.display = 'none';
    updateStats();
    return;
  }

  emptyState.style.display = 'none';
  table.style.display = 'table';

  rows.innerHTML = list.map(p => {
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${new URL(p.url).hostname}&sz=32`;
    return `
    <tr data-id="${escapeAttr(p.id)}">
      <td>
        <span class="status-badge ${p.status}">${p.status === 'solved' ? 'Solved' : 'Unsolved'}</span>
      </td>
      <td>
        <div class="platform-cell">
          <img src="${faviconUrl}" class="platform-logo" alt="logo" />
          <span class="platform-label">${PLATFORM_LABEL[p.platform] || p.platform}</span>
        </div>
      </td>
      <td class="problem-title"><a href="${escapeAttr(p.url)}" target="_blank" rel="noopener">${escapeHtml(p.title)}</a></td>
      <td class="time-cell">${formatTime(p.timeSpent)}</td>
      <td class="notes-cell">${escapeHtml(p.notes || '')}</td>
      <td class="added-cell">${formatDate(p.addedAt)}</td>
      <td><button class="delete-btn" data-id="${escapeAttr(p.id)}" title="Remove">✕</button></td>
    </tr>
  `}).join('');

  rows.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.dataset.id;
      await PTStorage.remove(id);
      delete allProblems[id];
      render();
    });
  });

  updateStats();
}

function updateStats() {
  const list = Object.values(allProblems).filter(p => p.bookmarked);
  const total = list.length;
  const solved = list.filter(p => p.status === 'solved').length;
  document.getElementById('stats').innerHTML = `
    <span><b>${total}</b> bookmarked</span>
    <span><b>${solved}</b> solved</span>
  `;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}

async function init() {
  allProblems = await PTStorage.getAll();
  render();

  document.getElementById('search').addEventListener('input', render);
  document.getElementById('platform-filter').addEventListener('change', render);
  document.getElementById('status-filter').addEventListener('change', render);
}

init();
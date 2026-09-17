window.__PT_CONFIG = {
  platform: 'codeforces',
  platformLabel: 'Codeforces',
  badgeShort: 'CF',
  badgeColor: '#8FABD4',
  badgeText: '#121358',
  getProblemInfo() {
    const problemsetMatch = location.pathname.match(/\/problemset\/problem\/(\d+)\/([A-Za-z0-9]+)/);
    const contestMatch = location.pathname.match(/\/contest\/(\d+)\/problem\/([A-Za-z0-9]+)/);
    const match = problemsetMatch || contestMatch;
    if (!match) return null;
    const [, contestId, index] = match;

    const titleEl = document.querySelector('.problem-statement .title');
    let title = titleEl ? titleEl.textContent.trim() : document.title.trim();
    // Codeforces titles are usually "A. Problem Name" already — keep as-is.

    return {
      id: `codeforces:${contestId}${index}`,
      title,
      url: `${location.origin}/problemset/problem/${contestId}/${index}`
    };
  }
};

window.__PT_CONFIG = {
  platform: 'cses',
  platformLabel: 'CSES',
  badgeShort: 'CS',
  badgeColor: '#95CCDD',
  badgeText: '#121358',
  getProblemInfo() {
    const match = location.pathname.match(/\/problemset\/task\/(\d+)/);
    if (!match) return null;
    const taskId = match[1];
    const titleEl = document.querySelector('h1');
    const title = titleEl ? titleEl.textContent.trim() : `Task ${taskId}`;
    return {
      id: `cses:${taskId}`,
      title,
      url: `${location.origin}/problemset/task/${taskId}`
    };
  }
};

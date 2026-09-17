window.__PT_CONFIG = {
  platform: 'atcoder',
  platformLabel: 'AtCoder',
  badgeShort: 'AC',
  badgeColor: '#2F578A',
  badgeText: '#EFECE3',
  getProblemInfo() {
    const match = location.pathname.match(/\/contests\/([^/]+)\/tasks\/([^/?]+)/);
    if (!match) return null;
    const [, contest, task] = match;
    const titleEl = document.querySelector('.h2') || document.querySelector('#main-container h2');
    let title = titleEl ? titleEl.textContent.trim() : task.replace(/_/g, ' ');
    return {
      id: `atcoder:${contest}_${task}`,
      title,
      url: `${location.origin}/contests/${contest}/tasks/${task}`
    };
  }
};

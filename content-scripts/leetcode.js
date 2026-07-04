window.__PT_CONFIG = {
  platform: 'leetcode',
  platformLabel: 'LeetCode',
  badgeShort: 'LC',
  badgeColor: '#4274D9',
  badgeText: '#EFECE3',
  getProblemInfo() {
    const match = location.pathname.match(/\/problems\/([^/]+)/);
    if (!match) return null;
    const slug = match[1];
    let title = document.title.replace(/\s*-\s*LeetCode\s*$/i, '').trim();
    if (!title) title = slug.replace(/-/g, ' ');
    return {
      id: `leetcode:${slug}`,
      title,
      url: `${location.origin}/problems/${slug}/`
    };
  }
};

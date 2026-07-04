// Shared storage helper. Uses chrome.storage.sync so bookmarks follow you
// across any Chrome install signed into the same account, with an automatic
// fallback to chrome.storage.local if sync ever hits its quota.
const PT_KEY = 'pt_problems';

const PTStorage = {
  getAll() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(PT_KEY, (res) => {
        if (chrome.runtime.lastError || !res || !res[PT_KEY]) {
          chrome.storage.local.get(PT_KEY, (localRes) => {
            resolve((localRes && localRes[PT_KEY]) || {});
          });
        } else {
          resolve(res[PT_KEY]);
        }
      });
    });
  },

  saveAll(data) {
    return new Promise((resolve) => {
      chrome.storage.sync.set({ [PT_KEY]: data }, () => {
        if (chrome.runtime.lastError) {
          // Sync quota hit (rare — ~500+ problems) — fall back to local.
          chrome.storage.local.set({ [PT_KEY]: data }, () => resolve('local'));
        } else {
          resolve('sync');
        }
      });
    });
  },

  async upsert(record) {
    const all = await this.getAll();
    all[record.id] = { ...all[record.id], ...record };
    await this.saveAll(all);
    return all[record.id];
  },

  async remove(id) {
    const all = await this.getAll();
    delete all[id];
    await this.saveAll(all);
  }
};

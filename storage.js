const PT_KEY = 'pt_problems';
const PT_MIGRATED_KEY = 'pt_migrated_from_sync_v1';

function getFromArea(area, key) {
  return new Promise((resolve) => {
    area.get(key, (res) => {
      if (chrome.runtime.lastError || !res) {
        resolve(null);
      } else {
        resolve(res[key] || null);
      }
    });
  });
}

const PTStorage = {
  async _migrateIfNeeded() {
    const alreadyMigrated = await getFromArea(chrome.storage.local, PT_MIGRATED_KEY);
    if (alreadyMigrated) return;

    const [syncData, localData] = await Promise.all([
      getFromArea(chrome.storage.sync, PT_KEY),
      getFromArea(chrome.storage.local, PT_KEY)
    ]);

    const merged = { ...(syncData || {}), ...(localData || {}) };

    await new Promise((resolve) => {
      chrome.storage.local.set({ [PT_KEY]: merged, [PT_MIGRATED_KEY]: true }, resolve);
    });
  },

  async getAll() {
    await this._migrateIfNeeded();
    const data = await getFromArea(chrome.storage.local, PT_KEY);
    return data || {};
  },

  saveAll(data) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [PT_KEY]: data }, () => resolve('local'));
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
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

// Content scripts can't reliably call openOptionsPage() themselves,
// so the injected panel asks the background script to do it.
chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === 'OPEN_OPTIONS') {
    chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html') });
  }
});

const API_BASE_URL = "https://problem-tracker-backend-a0zr.onrender.com";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "PROBLEM_SOLVED") {
        // Problem solved event received
        // Automatically snapshot code on solve (optional v2 feature)
    }
    if (request.action === "SYNC_QUEUE") {
        processSyncQueue();
    }
});

chrome.alarms.create("syncAlarm", { periodInMinutes: 1 });
chrome.alarms.create("keepAlive", { periodInMinutes: 14 });

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "syncAlarm") {
        processSyncQueue();
    }
    if (alarm.name === "keepAlive") {
        fetch(`${API_BASE_URL}/health`).catch(() => {});
    }
});

async function processSyncQueue() {
    const data = await chrome.storage.local.get(["pt_sync_queue", "pt_token"]);
    const queue = data.pt_sync_queue || [];
    const token = data.pt_token;
    
    if (queue.length === 0 || !token) return;
    
    // Processing sync queue
    let remainingQueue = [];
    
    for (const req of queue) {
        try {
            const res = await fetch(`${API_BASE_URL}${req.path}`, {
                method: req.method,
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: req.body ? JSON.stringify(req.body) : null
            });
            if (!res.ok) {
                if (res.status >= 400 && res.status < 500) {
                    // Queue item permanently failed
                } else {
                    remainingQueue.push(req);
                }
            }
        } catch (e) {
            remainingQueue.push(req);
        }
    }
    
    await chrome.storage.local.set({ "pt_sync_queue": remainingQueue });
}

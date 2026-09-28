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

// Periodic sync every minute, keepalive every 14 min, token validation daily
chrome.alarms.create("syncAlarm",      { periodInMinutes: 1 });
chrome.alarms.create("keepAlive",      { periodInMinutes: 14 });
chrome.alarms.create("tokenCheck",     { periodInMinutes: 60 });

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "syncAlarm") {
        processSyncQueue();
    }
    if (alarm.name === "keepAlive") {
        fetch(`${API_BASE_URL}/health`).catch(() => {});
    }
    if (alarm.name === "tokenCheck") {
        validateAndRefreshToken();
    }
});

/**
 * Validates the stored token by hitting /auth/me.
 * If the token is expired (401), clears the session and broadcasts AUTH_EXPIRED
 * so that any open popup reacts immediately.
 */
async function validateAndRefreshToken() {
    const data = await chrome.storage.local.get(["pt_token"]);
    if (!data.pt_token) return;

    try {
        const res = await fetch(`${API_BASE_URL}/auth/me`, {
            headers: { "Authorization": `Bearer ${data.pt_token}` }
        });

        if (res.status === 401) {
            // Token is no longer valid — clear session
            await chrome.storage.local.remove(["pt_token", "pt_username"]);
            // Notify any open popups
            chrome.runtime.sendMessage({ type: "AUTH_EXPIRED" }).catch(() => {});
        }
        // If successful, optionally refresh cached username
        if (res.ok) {
            try {
                const profile = await res.json();
                if (profile.username) {
                    await chrome.storage.local.set({ pt_username: profile.username });
                }
            } catch (_) {}
        }
    } catch (_) {
        // Network error — ignore, will retry on next alarm
    }
}

async function processSyncQueue() {
    const data = await chrome.storage.local.get(["pt_sync_queue", "pt_token"]);
    const queue = data.pt_sync_queue || [];
    const token = data.pt_token;
    
    if (queue.length === 0 || !token) return;
    
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
                    // Queue item permanently failed (bad request) — discard
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

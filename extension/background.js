chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

// Content scripts can't reliably call openOptionsPage() themselves,
// so the injected panel asks the background script to do it.
chrome.runtime.onMessage.addListener((message) => {
  if (message && message.type === 'OPEN_OPTIONS') {
    chrome.runtime.openOptionsPage();
  }
});

const API_BASE_URL = "http://localhost:8000";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "PROBLEM_SOLVED") {
        console.log("Problem solved event received for problem ID:", request.problemId);
        // Automatically snapshot code on solve (optional v2 feature)
    }
    if (request.action === "SYNC_QUEUE") {
        processSyncQueue();
    }
});

// Create an alarm to periodically check the sync queue
chrome.alarms.create("syncAlarm", { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "syncAlarm") {
        processSyncQueue();
    }
});

async function processSyncQueue() {
    const data = await chrome.storage.local.get(["pt_sync_queue", "pt_token"]);
    const queue = data.pt_sync_queue || [];
    const token = data.pt_token;
    
    if (queue.length === 0 || !token) return;
    
    console.log("Processing sync queue. Items:", queue.length);
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
                // If it's a 4xx error, there's no point retrying
                if (res.status >= 400 && res.status < 500) {
                    console.error("Queue item permanently failed", req);
                } else {
                    remainingQueue.push(req);
                }
            }
        } catch (e) {
            // Still offline, push back to queue
            remainingQueue.push(req);
        }
    }
    
    await chrome.storage.local.set({ "pt_sync_queue": remainingQueue });
}

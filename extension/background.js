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
    // ── Bookmark upsert (called from content-script page icon) ──
    if (request.action === "BOOKMARK_UPSERT") {
        handleBookmarkUpsert(request.payload).then(sendResponse).catch(err => {
            sendResponse({ ok: false, error: err.message });
        });
        return true; // keep channel open for async response
    }

    // ── Status update (solved / unsolved from page icon) ──
    if (request.action === "BOOKMARK_STATUS") {
        handleBookmarkStatus(request.problem_id, request.status)
            .then(sendResponse).catch(err => {
                sendResponse({ ok: false, error: err.message });
            });
        return true;
    }

    // ── Remove bookmark ──
    if (request.action === "BOOKMARK_REMOVE") {
        handleBookmarkRemove(request.problem_id).then(sendResponse).catch(err => {
            sendResponse({ ok: false, error: err.message });
        });
        return true;
    }

    // ── Load bookmarks from server and merge into local storage ──
    if (request.action === "LOAD_BOOKMARKS") {
        loadBookmarksFromServer().then(sendResponse).catch(err => {
            sendResponse({ ok: false, error: err.message });
        });
        return true;
    }

    // ── Trigger offline sync queue manually ──
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

async function handleBookmarkUpsert(payload) {
    const data = await chrome.storage.local.get(["pt_token"]);
    const token = data.pt_token;
    if (!token) return { ok: false, error: "not_logged_in" };

    try {
        const res = await fetch(`${API_BASE_URL}/bookmarks`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return { ok: true };
    } catch (e) {
        // Server down — enqueue for later sync (deduplication by problem_id)
        const stored = await chrome.storage.local.get(["pt_sync_queue"]);
        const queue = stored.pt_sync_queue || [];
        const alreadyQueued = queue.some(
            q => q.path === "/bookmarks" && q.body?.problem_id === payload.problem_id
        );
        if (!alreadyQueued) {
            queue.push({ path: "/bookmarks", method: "POST", body: payload });
            await chrome.storage.local.set({ pt_sync_queue: queue });
        }
        return { ok: false, queued: true };
    }
}

async function handleBookmarkStatus(problem_id, status) {
    const data = await chrome.storage.local.get(["pt_token"]);
    const token = data.pt_token;
    if (!token) return { ok: false, error: "not_logged_in" };

    const patchPath = `/bookmarks/${encodeURIComponent(problem_id)}`;
    try {
        const res = await fetch(`${API_BASE_URL}${patchPath}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`,
            },
            body: JSON.stringify({ status }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return { ok: true };
    } catch (e) {
        // Enqueue — deduplicate by overwriting any existing status update for same problem
        const stored = await chrome.storage.local.get(["pt_sync_queue"]);
        const queue = (stored.pt_sync_queue || []).filter(
            q => !(q.method === "PATCH" && q.path === patchPath)
        );
        queue.push({ path: patchPath, method: "PATCH", body: { status } });
        await chrome.storage.local.set({ pt_sync_queue: queue });
        return { ok: false, queued: true };
    }
}

async function handleBookmarkRemove(problem_id) {
    const data = await chrome.storage.local.get(["pt_token"]);
    const token = data.pt_token;
    if (!token) return { ok: false, error: "not_logged_in" };

    const deletePath = `/bookmarks/${encodeURIComponent(problem_id)}`;
    try {
        const res = await fetch(`${API_BASE_URL}${deletePath}`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${token}` },
        });
        if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
        return { ok: true };
    } catch (e) {
        const stored = await chrome.storage.local.get(["pt_sync_queue"]);
        const queue = stored.pt_sync_queue || [];
        queue.push({ path: deletePath, method: "DELETE", body: null });
        await chrome.storage.local.set({ pt_sync_queue: queue });
        return { ok: false, queued: true };
    }
}

async function loadBookmarksFromServer() {
    const data = await chrome.storage.local.get(["pt_token"]);
    const token = data.pt_token;
    if (!token) return { ok: false };

    try {
        const res = await fetch(`${API_BASE_URL}/bookmarks`, {
            headers: { "Authorization": `Bearer ${token}` },
        });
        if (!res.ok) return { ok: false };
        const serverBookmarks = await res.json();

        // Merge: convert server list into the pt_problems map format
        const stored = await chrome.storage.local.get(["pt_problems"]);
        const local = stored.pt_problems || {};

        const serverMap = new Set(serverBookmarks.map(b => b.problem_id));

        // 1. Sync DOWN (from server to local)
        for (const bm of serverBookmarks) {
            const existing = local[bm.problem_id] || {};
            local[bm.problem_id] = {
                ...existing,            // keep local fields like notes, timeSpent
                id: bm.problem_id,
                platform: bm.platform,
                title: bm.title,
                url: bm.url,
                status: bm.status || existing.status || "unsolved",
                bookmarked: true,
                addedAt: existing.addedAt || bm.created_at || null,
            };
        }

        // 2. Sync UP (from local to server) for legacy bookmarks
        // This ensures the 33 bookmarks you saved before this update get pushed to the cloud
        for (const [id, bm] of Object.entries(local)) {
            if (bm.bookmarked && !serverMap.has(id)) {
                // Enqueue them to be uploaded in the background
                handleBookmarkUpsert({
                    problem_id: bm.id,
                    platform: bm.platform,
                    title: bm.title,
                    url: bm.url,
                    status: bm.status || "unsolved"
                });
            }
        }

        await chrome.storage.local.set({ pt_problems: local });
        return { ok: true, count: serverBookmarks.length };
    } catch (e) {
        return { ok: false, error: e.message };
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

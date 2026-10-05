const API_BASE_URL = "https://problem-tracker-backend-a0zr.onrender.com";

// ─── Token / Session Helpers ────────────────────────────────────────────────

async function getStoredSession() {
  const data = await chrome.storage.local.get(["pt_token", "pt_username"]);
  return { token: data.pt_token || null, username: data.pt_username || null };
}

async function saveSession(token, username) {
  await chrome.storage.local.set({ pt_token: token, pt_username: username });
}

async function clearSession() {
  await chrome.storage.local.remove(["pt_token", "pt_username"]);
}

// ─── Core Fetch Wrapper ──────────────────────────────────────────────────────

async function fetchAPI(path, method = "GET", body = null, isRetry = false) {
  const { token } = await getStoredSession();

  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  let res;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, options);
  } catch (err) {
    // Offline: queue non-GET requests
    if (method !== "GET") {
      const current = await chrome.storage.local.get("pt_sync_queue");
      const queue = current.pt_sync_queue || [];
      queue.push({ path, method, body });
      await chrome.storage.local.set({ pt_sync_queue: queue });
      chrome.runtime.sendMessage({ action: "SYNC_QUEUE" });
      throw new Error("You are offline. Action queued for sync.");
    }
    throw new Error("Network error. Please check your connection.");
  }

  if (res.status === 401 && !isRetry) {
    // Token expired or invalid — clear session and signal logout
    await clearSession();
    // Dispatch a custom event so the popup can react immediately
    chrome.runtime.sendMessage({ type: "AUTH_EXPIRED" });
    throw new Error("SESSION_EXPIRED");
  }

  if (!res.ok) {
    let detail = `API Error ${res.status}`;
    try {
      const errBody = await res.json();
      detail = errBody.detail || detail;
    } catch (_) {}
    throw new Error(detail);
  }

  return res.json();
}

// ─── Auth Form Helper ────────────────────────────────────────────────────────

async function postAuthForm(endpoint, username, password) {
  const params = new URLSearchParams();
  params.append("username", username);
  params.append("password", password);

  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  let data;
  try {
    data = await res.json();
  } catch (_) {
    throw new Error(`Server error (${res.status})`);
  }

  if (!res.ok) {
    throw new Error(data.detail || `Error ${res.status}`);
  }

  await saveSession(data.access_token, data.username);
  return data;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export const api = {
  /** Register a brand new account */
  register: (username, password) => postAuthForm("/auth/register", username, password),

  /** Log in with existing credentials */
  login: (username, password) => postAuthForm("/auth/token", username, password),

  /** Fetch the currently logged-in user's profile (validates token) */
  me: () => fetchAPI("/auth/me", "GET"),

  /** Sign out — clears local session */
  logout: async () => {
    await clearSession();
  },

  bookmark: (problem_id, platform, title, url) =>
    fetchAPI("/bookmarks", "POST", { problem_id, platform, title, url }),

  /** Fetch all bookmarks from server */
  getBookmarks: () => fetchAPI("/bookmarks", "GET"),

  /** Update just the status of a bookmark (solved/unsolved) */
  updateBookmarkStatus: (problem_id, status) =>
    fetchAPI(`/bookmarks/${problem_id}`, "PATCH", { status }),

  /** Remove a bookmark */
  removeBookmark: (problem_id) =>
    fetchAPI(`/bookmarks/${problem_id}`, "DELETE"),

  getActivity: () => fetchAPI("/analytics/activity", "GET"),

  getDueReviews: () => fetchAPI("/review/due", "GET"),

  scheduleReview: (problem_id) => fetchAPI(`/review/${problem_id}/schedule`, "POST"),

  completeReview: (problem_id, quality) =>
    fetchAPI(`/review/${problem_id}/complete`, "POST", { quality }),
};

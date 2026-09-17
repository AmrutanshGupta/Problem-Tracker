const API_BASE_URL = "http://localhost:8000";

async function fetchAPI(path, method = "GET", body = null) {
  const data = await chrome.storage.local.get("pt_token");
  const token = data.pt_token;
  
  const headers = {
    "Content-Type": "application/json"
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  
  const options = {
    method,
    headers
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, options);
    if (!res.ok) {
      if (res.status === 401) {
        throw new Error("Unauthorized. Please login.");
      }
      throw new Error(`API Error: ${res.statusText}`);
    }
    return res.json();
  } catch (err) {
    if (err.message.includes("Failed to fetch") || err.message.includes("NetworkError")) {
      if (method !== "GET") {
         // Queue it for later
         const current = await chrome.storage.local.get("pt_sync_queue");
         const queue = current.pt_sync_queue || [];
         queue.push({ path, method, body });
         await chrome.storage.local.set({ "pt_sync_queue": queue });
         
         // Trigger background worker to attempt sync
         chrome.runtime.sendMessage({ action: "SYNC_QUEUE" });
         throw new Error("You are offline. Action queued for sync.");
      }
    }
    throw err;
  }
}

export const api = {
  login: async (username, password) => {
    const params = new URLSearchParams();
    params.append('username', username);
    params.append('password', password);
    const res = await fetch(`${API_BASE_URL}/auth/token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params
    });
    if (!res.ok) throw new Error("Login failed");
    const data = await res.json();
    await chrome.storage.local.set({ "pt_token": data.access_token });
    return data;
  },
  
  bookmark: (problem_id, platform, title, url) => 
    fetchAPI("/bookmarks", "POST", { problem_id, platform, title, url }),
    
  saveSnapshot: (problem_id, language, code_text) => 
    fetchAPI("/snapshots", "POST", { problem_id, language, code_text }),
    
  getDueReviews: () => fetchAPI("/review/due", "GET"),
  
  scheduleReview: (problem_id) => fetchAPI(`/review/${problem_id}/schedule`, "POST"),
  
  completeReview: (problem_id, quality) => fetchAPI(`/review/${problem_id}/complete`, "POST", { quality })
};

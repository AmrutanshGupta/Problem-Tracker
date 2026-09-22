import { api } from './lib/api-client.js';

document.addEventListener('DOMContentLoaded', async () => {
  const loginSection = document.getElementById('login-section');
  const mainSection = document.getElementById('main-section');
  const reviewSection = document.getElementById('review-section');
  
  const { pt_token } = await chrome.storage.local.get("pt_token");
  if (!pt_token) {
    loginSection.classList.remove('hidden');
  } else {
    showMainUI();
  }
  
  document.getElementById('login-btn').addEventListener('click', async () => {
    const u = document.getElementById('username').value;
    const p = document.getElementById('password').value;
    try {
      await api.login(u, p);
      loginSection.classList.add('hidden');
      showMainUI();
    } catch(e) {
      alert(e.message);
    }
  });

  async function showMainUI() {
    mainSection.classList.remove('hidden');
    reviewSection.classList.remove('hidden');
    await loadReviews();
    await loadActivity();
  }
  
  async function loadActivity() {
      try {
          const activity = await api.getActivity();
          if (activity && activity.length > 0) {
              // The first element is the most recent day
              const today = activity[0];
              document.getElementById('today-reviews').innerText = today.reviews_completed || 0;
              document.getElementById('today-bookmarks').innerText = today.bookmarks_added || 0;
          }
      } catch(e) {
          console.error("Failed to load activity", e);
      }
  }
  
  async function getCurrentProblemDetails() {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return {
          problem_id: tab.url.split('/').pop() || "unknown",
          platform: new URL(tab.url).hostname,
          title: tab.title,
          url: tab.url
      };
  }
  
  document.getElementById('bookmark-btn').addEventListener('click', async () => {
      const details = await getCurrentProblemDetails();
      try {
          await api.bookmark(details.problem_id, details.platform, details.title, details.url);
          alert("Bookmarked!");
      } catch(e) { alert(e); }
  });
  
  
  document.getElementById('revisit-btn').addEventListener('click', async () => {
      const details = await getCurrentProblemDetails();
      try {
          await api.scheduleReview(details.problem_id);
          alert("Scheduled for review!");
          loadReviews();
      } catch(e) { alert(e); }
  });

  async function loadReviews() {
      try {
          const due = await api.getDueReviews();
          document.getElementById('due-count').innerText = due.length;
          const list = document.getElementById('review-list');
          list.innerHTML = '';
          due.forEach(item => {
              const li = document.createElement('li');
              li.className = 'review-item';
              li.innerHTML = `
                  <strong>${item.problem_id}</strong>
                  <div class="review-actions">
                      <button data-q="1" data-id="${item.problem_id}">Hard</button>
                      <button data-q="3" data-id="${item.problem_id}">Good</button>
                      <button data-q="5" data-id="${item.problem_id}">Easy</button>
                  </div>
              `;
              list.appendChild(li);
          });
          
          list.querySelectorAll('button').forEach(btn => {
              btn.addEventListener('click', async (e) => {
                  const id = e.target.getAttribute('data-id');
                  const q = parseInt(e.target.getAttribute('data-q'));
                  await api.completeReview(id, q);
                  loadReviews();
              });
          });
      } catch(e) {
          // Failed to load reviews
      }
  }
});

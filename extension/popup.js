import { api } from './lib/api-client.js';

// ─── Toast ────────────────────────────────────────────────────────────────────

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const dot = document.createElement('span');
  dot.className = 'toast-dot';
  const text = document.createElement('span');
  text.textContent = message;
  toast.appendChild(dot);
  toast.appendChild(text);
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

// ─── DOM refs ────────────────────────────────────────────────────────────────

const authSection   = document.getElementById('auth-section');
const mainSection   = document.getElementById('main-section');
const reviewSection = document.getElementById('review-section');

const headerLive      = document.getElementById('header-live');
const headerProfile   = document.getElementById('header-profile');
const avatarInitials  = document.getElementById('avatar-initials');
const profileUsername = document.getElementById('profile-username');

const tabLogin    = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');

const authUsername  = document.getElementById('auth-username');
const authPassword  = document.getElementById('auth-password');
const authPassword2 = document.getElementById('auth-password2');
const authError     = document.getElementById('auth-error');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authBtnText   = document.getElementById('auth-btn-text');
const authHint      = document.getElementById('auth-hint');

const bookmarkBtn   = document.getElementById('bookmark-btn');
const bookmarkIcon  = document.getElementById('bookmark-icon');
const bookmarkLabel = document.getElementById('bookmark-label');

// ─── Auth mode toggle ─────────────────────────────────────────────────────────

let currentAuthMode = 'login';

function setAuthMode(mode) {
  currentAuthMode = mode;
  tabLogin.classList.toggle('active', mode === 'login');
  tabRegister.classList.toggle('active', mode === 'register');
  authPassword2.style.display = mode === 'register' ? 'block' : 'none';
  authBtnText.textContent = mode === 'login' ? 'Sign In' : 'Create Account';
  authHint.textContent = mode === 'login'
    ? "Don't have an account? Switch to Create Account."
    : 'Already have an account? Switch to Sign In.';
  clearAuthError();
  authUsername.classList.remove('error');
  authPassword.classList.remove('error');
  authPassword2.classList.remove('error');
}

tabLogin.addEventListener('click', () => setAuthMode('login'));
tabRegister.addEventListener('click', () => setAuthMode('register'));

// ─── Auth error helpers ───────────────────────────────────────────────────────

function showAuthError(msg) { authError.textContent = msg; }
function clearAuthError()   { authError.textContent = ''; }

// ─── Auth submit ─────────────────────────────────────────────────────────────

authSubmitBtn.addEventListener('click', async () => {
  clearAuthError();
  const username  = authUsername.value.trim();
  const password  = authPassword.value;
  const password2 = authPassword2.value;

  if (!username) { showAuthError('Please enter a username.'); authUsername.classList.add('error'); return; }
  if (!password) { showAuthError('Please enter a password.'); authPassword.classList.add('error'); return; }

  if (currentAuthMode === 'register') {
    if (username.length < 3) { showAuthError('Username must be at least 3 characters.'); authUsername.classList.add('error'); return; }
    if (password.length < 6) { showAuthError('Password must be at least 6 characters.'); authPassword.classList.add('error'); return; }
    if (password !== password2) { showAuthError('Passwords do not match.'); authPassword2.classList.add('error'); return; }
  }

  authSubmitBtn.disabled = true;
  authBtnText.textContent = currentAuthMode === 'login' ? 'Signing in…' : 'Creating account…';

  try {
    const data = currentAuthMode === 'login'
      ? await api.login(username, password)
      : await api.register(username, password);
    showToast(`Welcome, ${data.username}`, 'success');
    showMainUI(data.username);
  } catch (err) {
    showAuthError(err.message || 'Something went wrong. Please try again.');
    authUsername.classList.add('error');
    authPassword.classList.add('error');
  } finally {
    authSubmitBtn.disabled = false;
    authBtnText.textContent = currentAuthMode === 'login' ? 'Sign In' : 'Create Account';
  }
});

// Enter key support
[authUsername, authPassword, authPassword2].forEach(el => {
  el.addEventListener('keydown', e => { if (e.key === 'Enter') authSubmitBtn.click(); });
  el.addEventListener('input',   () => { el.classList.remove('error'); clearAuthError(); });
});

// ─── Profile badge + sign-out popover ────────────────────────────────────────

const profileBadgeBtn   = document.getElementById('profile-badge-btn');
const signoutPopover    = document.getElementById('signout-popover');
const popoverDefault    = document.getElementById('popover-default');
const popoverConfirm    = document.getElementById('popover-confirm');
const signoutInitialBtn = document.getElementById('signout-initial-btn');
const signoutConfirmBtn = document.getElementById('signout-confirm-btn');
const signoutCancelBtn  = document.getElementById('signout-cancel-btn');

profileBadgeBtn.addEventListener('click', e => {
  e.stopPropagation();
  const isOpen = signoutPopover.classList.contains('open');
  resetPopoverState();
  signoutPopover.classList.toggle('open', !isOpen);
});

document.addEventListener('click', () => {
  resetPopoverState();
  signoutPopover.classList.remove('open');
});

signoutPopover.addEventListener('click', e => e.stopPropagation());

signoutInitialBtn.addEventListener('click', () => {
  popoverDefault.style.display = 'none';
  popoverConfirm.classList.add('show');
});

signoutCancelBtn.addEventListener('click', () => {
  resetPopoverState();
  signoutPopover.classList.remove('open');
});

signoutConfirmBtn.addEventListener('click', async () => {
  await api.logout();
  signoutPopover.classList.remove('open');
  showToast('Signed out.', 'info');
  showAuthUI();
});

function resetPopoverState() {
  popoverDefault.style.display = '';
  popoverConfirm.classList.remove('show');
}

// ─── Action buttons ───────────────────────────────────────────────────────────

document.getElementById('view-all-btn').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html') });
});

bookmarkBtn.addEventListener('click', async () => {
  const details = await getCurrentProblemDetails();
  bookmarkBtn.disabled = true;
  try {
    await api.bookmark(details.problem_id, details.platform, details.title, details.url);
    bookmarkBtn.classList.add('success');
    bookmarkIcon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" width="14" height="14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    bookmarkLabel.textContent = 'Bookmarked';
    showToast('Problem bookmarked', 'success');
    await loadActivity();
    setTimeout(() => {
      bookmarkBtn.classList.remove('success');
      bookmarkIcon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" width="14" height="14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`;
      bookmarkLabel.textContent = 'Bookmark this problem';
      bookmarkBtn.disabled = false;
    }, 2000);
  } catch (e) {
    bookmarkBtn.disabled = false;
    showToast(e.message || 'Failed to bookmark.', 'error');
  }
});

document.getElementById('revisit-btn').addEventListener('click', async () => {
  const details = await getCurrentProblemDetails();
  try {
    await api.scheduleReview(details.problem_id);
    showToast('Scheduled for review', 'success');
    loadReviews();
  } catch (e) {
    showToast(e.message || 'Failed to schedule review.', 'error');
  }
});

// ─── Display helpers ──────────────────────────────────────────────────────────

function showAuthUI() {
  authSection.style.display   = 'block';
  mainSection.style.display   = 'none';
  headerLive.style.display    = 'flex';
  headerProfile.style.display = 'none';
  setAuthMode('login');
  authUsername.value  = '';
  authPassword.value  = '';
  authPassword2.value = '';
}

function showMainUI(username) {
  authSection.style.display   = 'none';
  mainSection.style.display   = 'block';
  headerLive.style.display    = 'none';
  headerProfile.style.display = 'block';
  const initials = username ? username.slice(0, 2).toUpperCase() : '?';
  avatarInitials.textContent  = initials;
  profileUsername.textContent = username || '—';
  loadActivity();
  loadReviews();
}

// ─── Session expiry from background ──────────────────────────────────────────

chrome.runtime.onMessage.addListener(message => {
  if (message && message.type === 'AUTH_EXPIRED') {
    showToast('Session expired. Please sign in again.', 'error');
    showAuthUI();
  }
});

// ─── Startup — runs immediately because type="module" is already deferred ─────
// DO NOT wrap in DOMContentLoaded — the DOM is ready by the time a module runs.

(async () => {
  const data = await chrome.storage.local.get(['pt_token', 'pt_username']);

  if (!data.pt_token) {
    showAuthUI();
    return;
  }

  try {
    const profile = await api.me();
    await chrome.storage.local.set({ pt_username: profile.username });
    showMainUI(profile.username);
  } catch (err) {
    if (err.message === 'SESSION_EXPIRED') {
      showToast('Session expired. Please sign in again.', 'error');
    }
    showAuthUI();
  }
})();

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getCurrentProblemDetails() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return {
    problem_id: tab.url.split('/').pop() || 'unknown',
    platform:   new URL(tab.url).hostname,
    title:      tab.title,
    url:        tab.url
  };
}

async function loadActivity() {
  try {
    const activity = await api.getActivity();
    if (activity && activity.length > 0) {
      const today = activity[0];
      document.getElementById('today-reviews').textContent   = today.reviews_completed || 0;
      document.getElementById('today-bookmarks').textContent = today.bookmarks_added   || 0;
    }
  } catch (e) {
    console.error('Failed to load activity', e);
  }
}

async function loadReviews() {
  try {
    const due  = await api.getDueReviews();
    document.getElementById('due-count').textContent = due.length;
    const list = document.getElementById('review-list');
    list.innerHTML = '';

    reviewSection.style.display = due.length > 0 ? 'block' : 'none';

    due.forEach(item => {
      const li = document.createElement('li');
      li.className = 'review-item';
      const displayTitle = item.title || item.problem_id;
      const titleHtml = item.url
        ? `<a class="review-title" href="${item.url}" target="_blank" rel="noopener">${displayTitle}</a>`
        : `<span class="review-title">${displayTitle}</span>`;

      li.innerHTML = `
        ${titleHtml}
        <div class="review-actions">
          <button data-q="1" data-id="${item.problem_id}">Hard</button>
          <button data-q="3" data-id="${item.problem_id}">Good</button>
          <button data-q="5" data-id="${item.problem_id}">Easy</button>
        </div>
      `;
      list.appendChild(li);
    });

    list.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', async e => {
        const id = e.target.getAttribute('data-id');
        const q  = parseInt(e.target.getAttribute('data-q'));
        try {
          await api.completeReview(id, q);
          showToast('Review recorded', 'success');
          loadReviews();
          loadActivity();
        } catch (err) {
          showToast(err.message || 'Failed to save review.', 'error');
        }
      });
    });
  } catch (e) {
    console.error('Failed to load reviews', e);
  }
}

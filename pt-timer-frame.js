(function () {
  const params = new URLSearchParams(location.search);
  const problemId = params.get('id');

  const TIMER_KEY = 'pt_timers';
  const PROBLEM_KEY = 'pt_problems';

  let timerRecord = null;
  let timerInterval = null;
  let baseSeconds = 0;
  let sessionSeconds = 0;

  const display = document.getElementById('pt-time-display');
  const playBtn = document.getElementById('pt-playpause');
  const resetBtn = document.getElementById('pt-reset');

  function formatTime(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  // Tracks whether the timer has already auto-started once during this tab's
  // lifetime. sessionStorage survives a plain reload (F5) but is cleared when
  // the tab/browser is actually closed — even across many shutdown cycles —
  // which is exactly the "reload vs fresh open" distinction we need.
  const SESSION_FLAG_PREFIX = 'pt_session_started_';

  function hasSessionStarted() {
    try {
      return sessionStorage.getItem(SESSION_FLAG_PREFIX + problemId) === '1';
    } catch (e) {
      return false;
    }
  }

  function markSessionStarted() {
    try {
      sessionStorage.setItem(SESSION_FLAG_PREFIX + problemId, '1');
    } catch (e) {
      // If sessionStorage is unavailable for some reason, fail silently —
      // worst case the timer just auto-starts on every load, as before.
    }
  }

  function renderDisplay() {
    display.textContent = formatTime(baseSeconds + sessionSeconds);
  }

  async function getAllTimers() {
    const r = await chrome.storage.local.get(TIMER_KEY);
    return r[TIMER_KEY] || {};
  }

  async function upsertTimer(rec) {
    const all = await getAllTimers();
    all[rec.id] = rec;
    await chrome.storage.local.set({ [TIMER_KEY]: all });
    mirrorTimeToBookmark(rec.timeSpent || 0);
    return rec;
  }

  // One-way mirror: stamps the timer's accumulated time onto the bookmark
  // record purely so it's visible alongside the bookmark's other data.
  // This NEVER creates a bookmark and is NEVER read back — the timer above
  // remains the only source of truth for how time is calculated.
  async function mirrorTimeToBookmark(seconds) {
    try {
      const r = await chrome.storage.local.get(PROBLEM_KEY);
      const all = r[PROBLEM_KEY] || {};
      const existing = all[problemId];
      if (existing) {
        all[problemId] = { ...existing, timeSpent: seconds };
        await chrome.storage.local.set({ [PROBLEM_KEY]: all });
      }
    } catch (e) {
      // Non-critical — the timer's own storage is unaffected either way.
    }
  }

  async function getProblemStatus() {
    const r = await chrome.storage.local.get(PROBLEM_KEY);
    const all = r[PROBLEM_KEY] || {};
    return all[problemId] ? all[problemId].status : 'unsolved';
  }

  function manageTicking() {
    if (timerRecord.timerRunning && !timerInterval) {
      timerInterval = setInterval(() => {
        sessionSeconds++;
        renderDisplay();
      }, 1000);
    } else if (!timerRecord.timerRunning && timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  async function syncTime() {
    if (sessionSeconds > 0) {
      timerRecord.timeSpent = baseSeconds + sessionSeconds;
      baseSeconds = timerRecord.timeSpent;
      sessionSeconds = 0;
      timerRecord = await upsertTimer(timerRecord);
    }
  }

  playBtn.addEventListener('click', async () => {
    await syncTime();
    timerRecord.timerRunning = !timerRecord.timerRunning;
    timerRecord = await upsertTimer(timerRecord);
    playBtn.textContent = timerRecord.timerRunning ? '⏸' : '▶';
    manageTicking();
  });

  resetBtn.addEventListener('click', async () => {
    sessionSeconds = 0;
    baseSeconds = 0;
    timerRecord.timeSpent = 0;
    timerRecord.timerRunning = false;
    timerRecord = await upsertTimer(timerRecord);
    renderDisplay();
    playBtn.textContent = '▶';
    manageTicking();
  });

  // Keep in sync if the timer is changed from another tab of the same problem
  chrome.storage.onChanged.addListener((changes) => {
    if (changes[TIMER_KEY]) {
      const all = changes[TIMER_KEY].newValue || {};
      const updated = all[problemId];
      if (updated) {
        timerRecord = updated;
        baseSeconds = timerRecord.timeSpent || 0;
        sessionSeconds = 0;
        renderDisplay();
        playBtn.textContent = timerRecord.timerRunning ? '⏸' : '▶';
        manageTicking();
      }
    }

    // Auto-pause the moment this problem gets marked solved, from any tab
    if (changes[PROBLEM_KEY]) {
      const all = changes[PROBLEM_KEY].newValue || {};
      const p = all[problemId];
      if (p && p.status === 'solved' && timerRecord && timerRecord.timerRunning) {
        syncTime().then(async () => {
          timerRecord.timerRunning = false;
          timerRecord = await upsertTimer(timerRecord);
          playBtn.textContent = '▶';
          manageTicking();
        });
      }
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') syncTime();
  });
  window.addEventListener('beforeunload', () => syncTime());

  async function init() {
    if (!problemId) return;

    const all = await getAllTimers();
    timerRecord = all[problemId] || { id: problemId, timeSpent: 0, timerRunning: false };
    baseSeconds = timerRecord.timeSpent || 0;

    // Auto-start only applies to a genuinely fresh open of the tab/site.
    // A plain page reload within the same tab retains whatever paused/running
    // state was last saved instead of force-restarting the timer.
    if (!hasSessionStarted()) {
      const status = await getProblemStatus();
      if (status !== 'solved') {
        timerRecord.timerRunning = true;
        timerRecord = await upsertTimer(timerRecord);
      }
      markSessionStarted();
    }

    renderDisplay();
    playBtn.textContent = timerRecord.timerRunning ? '⏸' : '▶';
    manageTicking();
  }

  init();
})();
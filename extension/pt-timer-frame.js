(function () {
  const params = new URLSearchParams(location.search);
  const problemId = params.get('id');

  const TIMER_KEY = 'pt_timers';
  const PROBLEM_KEY = 'pt_problems';

  let timerRecord = null;

  let displayInterval = null;
  let syncInterval = null;

  const display = document.getElementById('pt-time-display');
  const playBtn = document.getElementById('pt-playpause');
  const resetBtn = document.getElementById('pt-reset');

  function formatTime(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }

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
      // ignore
    }
  }

  function currentTotalSeconds() {
    if (!timerRecord) return 0;
    const base = timerRecord.timeSpent || 0;
    if (timerRecord.timerRunning && timerRecord.startedAt) {
      return base + Math.floor((Date.now() - timerRecord.startedAt) / 1000);
    }
    return base;
  }

  function renderDisplay() {
    display.textContent = formatTime(currentTotalSeconds());
  }

  function updatePlayButton() {
    playBtn.textContent = timerRecord && timerRecord.timerRunning ? '⏸' : '▶';
  }

  async function getAllTimers() {
    const r = await chrome.storage.local.get(TIMER_KEY);
    return r[TIMER_KEY] || {};
  }

  // IMPORTANT: takes a snapshot of `rec` immediately, rather than holding a
  // reference to the shared `timerRecord` object. Previously this function
  // stored the *live* object, so a click (pause/resume) and the periodic
  // background sync (every 15s, while running) could end up mutating the
  // exact same in-flight object concurrently — whichever write happened to
  // land last would silently clobber the other, sometimes leaving the
  // button stuck on the wrong icon even though nothing threw an error.
  async function upsertTimer(rec) {
    const snapshot = { ...rec };
    const all = await getAllTimers();
    all[snapshot.id] = snapshot;
    await chrome.storage.local.set({ [TIMER_KEY]: all });
    mirrorTimeToBookmark(currentTotalSecondsFor(snapshot));
    return snapshot;
  }

  function currentTotalSecondsFor(rec) {
    const base = rec.timeSpent || 0;
    if (rec.timerRunning && rec.startedAt) {
      return base + Math.floor((Date.now() - rec.startedAt) / 1000);
    }
    return base;
  }

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

  async function syncTime() {
    if (!timerRecord || !timerRecord.timerRunning || !timerRecord.startedAt) return;
    const updated = {
      ...timerRecord,
      timeSpent: currentTotalSeconds(),
      startedAt: Date.now()
    };
    timerRecord = await upsertTimer(updated);
  }

  function manageTicking() {
    const shouldRun = !!(timerRecord && timerRecord.timerRunning);

    if (shouldRun && !displayInterval) {
      displayInterval = setInterval(renderDisplay, 1000);
    } else if (!shouldRun && displayInterval) {
      clearInterval(displayInterval);
      displayInterval = null;
    }

    if (shouldRun && !syncInterval) {
      syncInterval = setInterval(syncTime, 15000);
    } else if (!shouldRun && syncInterval) {
      clearInterval(syncInterval);
      syncInterval = null;
    }
  }

  playBtn.addEventListener('click', async () => {
    if (!timerRecord) return; // timer hasn't finished loading yet — ignore the click rather than throw

    const updated = { ...timerRecord };
    if (updated.timerRunning) {
      // Pause: finalize the elapsed time and drop the anchor.
      updated.timeSpent = currentTotalSeconds();
      updated.timerRunning = false;
      updated.startedAt = null;
    } else {
      // Resume: start a fresh segment from now.
      updated.timerRunning = true;
      updated.startedAt = Date.now();
    }

    timerRecord = updated;
    updatePlayButton(); // reflect the click immediately, don't wait on storage
    renderDisplay();
    manageTicking();

    timerRecord = await upsertTimer(updated);
    updatePlayButton();
  });

  resetBtn.addEventListener('click', async () => {
    if (!timerRecord) return;

    const updated = { ...timerRecord, timeSpent: 0, timerRunning: false, startedAt: null };
    timerRecord = updated;
    renderDisplay();
    updatePlayButton();
    manageTicking();

    timerRecord = await upsertTimer(updated);
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes[TIMER_KEY]) {
      const all = changes[TIMER_KEY].newValue || {};
      const updated = all[problemId];
      if (updated) {
        timerRecord = updated;
        renderDisplay();
        updatePlayButton();
        manageTicking();
      }
    }

    if (changes[PROBLEM_KEY]) {
      const all = changes[PROBLEM_KEY].newValue || {};
      const p = all[problemId];
      if (p && p.status === 'solved' && timerRecord && timerRecord.timerRunning) {
        (async () => {
          const updated = {
            ...timerRecord,
            timeSpent: currentTotalSeconds(),
            timerRunning: false,
            startedAt: null
          };
          timerRecord = await upsertTimer(updated);
          updatePlayButton();
          renderDisplay();
          manageTicking();
        })();
      }
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') syncTime();
    else renderDisplay(); // catch up the display immediately on return
  });
  window.addEventListener('beforeunload', () => syncTime());

  async function init() {
    if (!problemId) return;

    const all = await getAllTimers();
    timerRecord = all[problemId] || {
      id: problemId, timeSpent: 0, timerRunning: false, startedAt: null
    };

    if (timerRecord.timerRunning && !timerRecord.startedAt) {
      timerRecord.startedAt = Date.now();
    }

    if (!hasSessionStarted()) {
      const status = await getProblemStatus();
      if (status !== 'solved') {
        timerRecord = { ...timerRecord, timerRunning: true, startedAt: Date.now() };
        timerRecord = await upsertTimer(timerRecord);
      }
      markSessionStarted();
    }

    renderDisplay();
    updatePlayButton();
    manageTicking();
  }

  init();
})();
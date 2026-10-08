(function () {
  const params = new URLSearchParams(location.search);
  const problemId = params.get('id');

  const TIMER_KEY = 'pt_timers';
  const PROBLEM_KEY = 'pt_problems';

  let timerRecord = null;

  // Display refresh interval — only for visual ticking, NOT for timekeeping.
  // Accuracy comes from wall-clock math (Date.now() - startedAt), not tick counting.
  // Even if the browser throttles this interval on a hidden tab, the display
  // instantly corrects itself the moment the tab becomes visible again.
  let displayInterval = null;
  let syncInterval = null;

  // (no pause-on-hide flag needed — the timer keeps running in the background)

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

  // Wall-clock accurate: always compute from the stored anchor, not tick count.
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

  // Checkpoint: finalize elapsed time into timeSpent and reset startedAt to now.
  // Used by the periodic sync interval to keep storage fresh.
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

  // ── Keep timer running when tab is hidden ────────────────────────────────
  // The timer NEVER pauses when the tab goes into the background.
  // timekeeping is pure wall-clock math (Date.now() - startedAt), so
  // browser throttling of setInterval has zero effect on accuracy.
  //
  // On tab re-focus: snap the display to the correct time immediately,
  // then restart the display interval at full 1 Hz for smooth ticking.
  // On tab close (beforeunload): finalize & persist the elapsed time.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      // Immediately show the correct accumulated time.
      renderDisplay();
      // Restart display interval at full 1 Hz (browser may have throttled it).
      if (timerRecord && timerRecord.timerRunning) {
        if (displayInterval) {
          clearInterval(displayInterval);
          displayInterval = null;
        }
        displayInterval = setInterval(renderDisplay, 1000);
      }
    }
    // On 'hidden': do nothing — the wall-clock anchor keeps accruing time.
  });

  // Tab closed/reloaded: write a fresh checkpoint so the wall-clock anchor
  // stays accurate.
  //
  // We use a sessionStorage flag to distinguish reload from close:
  //   - Reload: sessionStorage survives → init() resumes the timer seamlessly.
  //   - Close:  sessionStorage dies with the tab → init() on next open pauses
  //             the timer at the accumulated time so no phantom time is added.
  window.addEventListener('beforeunload', () => {
    if (timerRecord && timerRecord.timerRunning) {
      // Mark this as a reload so init() can tell the difference.
      try { sessionStorage.setItem('pt_reloading_' + problemId, '1'); } catch (_) {}
      const updated = {
        ...timerRecord,
        timeSpent: currentTotalSeconds(),
        startedAt: Date.now(), // fresh anchor so reload math is correct
        timerRunning: true
      };
      timerRecord = updated;
      upsertTimer(updated);
    }
  });

  playBtn.addEventListener('click', async () => {
    if (!timerRecord) return; // timer hasn't finished loading yet — ignore the click

    const updated = { ...timerRecord };
    if (updated.timerRunning) {
      // Pause: finalize elapsed time and drop the wall-clock anchor.
      updated.timeSpent = currentTotalSeconds();
      updated.timerRunning = false;
      updated.startedAt = null;
    } else {
      // Resume: start a fresh wall-clock segment from now.
      updated.timerRunning = true;
      updated.startedAt = Date.now();
    }

    timerRecord = updated;
    updatePlayButton();
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
      const newAll = changes[PROBLEM_KEY].newValue || {};
      const oldAll = changes[PROBLEM_KEY].oldValue || {};
      const p    = newAll[problemId];
      const oldP = oldAll[problemId];

      // solved → auto-pause
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

      // solved → unsolved: auto-resume (only on a real status transition)
      if (
        p && p.status === 'unsolved' &&
        oldP && oldP.status === 'solved' &&
        timerRecord && !timerRecord.timerRunning
      ) {
        (async () => {
          const updated = {
            ...timerRecord,
            timerRunning: true,
            startedAt: Date.now()
          };
          timerRecord = await upsertTimer(updated);
          updatePlayButton();
          renderDisplay();
          manageTicking();
        })();
      }
    }
  });

  async function init() {
    if (!problemId) return;

    const all = await getAllTimers();
    timerRecord = all[problemId] || {
      id: problemId, timeSpent: 0, timerRunning: false, startedAt: null
    };

    // If we find a record with timerRunning=true, figure out intent:
    //
    //  (a) Reload: sessionStorage has 'pt_reloading_<id>' → resume seamlessly.
    //  (b) Close+reopen: sessionStorage is empty → pause at accumulated time.
    //  (c) Crash / computer sleep (gap > 4h): always pause.
    const MAX_UNATTENDED_MS = 4 * 60 * 60 * 1000; // 4 hours
    if (timerRecord.timerRunning && timerRecord.startedAt) {
      const gap = Date.now() - timerRecord.startedAt;
      const isReload = (() => {
        try { return sessionStorage.getItem('pt_reloading_' + problemId) === '1'; } catch (_) { return false; }
      })();
      // Always clear the flag right away.
      try { sessionStorage.removeItem('pt_reloading_' + problemId); } catch (_) {}

      if (isReload && gap <= MAX_UNATTENDED_MS) {
        // Normal reload — resume seamlessly; manageTicking() below handles the rest.
      } else {
        // Tab was closed and reopened, or computer slept — pause at saved time.
        const elapsed = currentTotalSeconds();
        timerRecord = { ...timerRecord, timeSpent: elapsed, timerRunning: false, startedAt: null };
        await upsertTimer(timerRecord);
      }
    }

    if (!hasSessionStarted()) {
      const status = await getProblemStatus();
      if (status !== 'solved') {
        // Auto-start on first open in this session
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
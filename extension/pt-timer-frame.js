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

  // Track whether the timer was running before we auto-paused it on hide,
  // so we can auto-resume it when the tab becomes visible again.
  let wasRunningBeforeHide = false;

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

  // ── Pause on hide, resume on show ─────────────────────────────────────
  // This is the key fix: instead of letting the browser throttle/freeze
  // setInterval silently, we explicitly pause the timer when the tab is
  // hidden and resume it when visible. The saved timeSpent is accurate
  // because we always use wall-clock math before pausing.
  //
  // Consequence: closing the tab triggers 'hidden' → timer is paused and
  // persisted. Reopening the tab (same or new window) shows the exact
  // time at which you left, with the timer paused.
  async function pauseForHide() {
    if (!timerRecord || !timerRecord.timerRunning) {
      wasRunningBeforeHide = false;
      return;
    }
    wasRunningBeforeHide = true;
    const updated = {
      ...timerRecord,
      timeSpent: currentTotalSeconds(),
      timerRunning: false,
      startedAt: null
    };
    timerRecord = updated;
    updatePlayButton();
    manageTicking();
    // Persist synchronously-ish before the tab is suspended
    timerRecord = await upsertTimer(updated);
    updatePlayButton();
  }

  async function resumeAfterShow() {
    if (!wasRunningBeforeHide) {
      // Timer was already paused by the user — just refresh the display.
      renderDisplay();
      return;
    }
    wasRunningBeforeHide = false;
    if (!timerRecord) return;
    const updated = {
      ...timerRecord,
      timerRunning: true,
      startedAt: Date.now()
    };
    timerRecord = updated;
    updatePlayButton();
    renderDisplay();
    manageTicking();
    timerRecord = await upsertTimer(updated);
    updatePlayButton();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      pauseForHide();
    } else {
      resumeAfterShow();
    }
  });

  // Also pause on beforeunload as a belt-and-suspenders safety net
  // (visibilitychange fires first in most cases, but beforeunload catches edge cases).
  window.addEventListener('beforeunload', () => {
    if (timerRecord && timerRecord.timerRunning) {
      // Synchronous storage isn't available, but we can at least update timerRecord
      // in memory; the async upsert will race but often wins before the page dies.
      const updated = {
        ...timerRecord,
        timeSpent: currentTotalSeconds(),
        timerRunning: false,
        startedAt: null
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
      wasRunningBeforeHide = false; // user manually paused, don't auto-resume
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

    wasRunningBeforeHide = false;
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
          wasRunningBeforeHide = false;
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

    // If we find a record that was left in timerRunning=true with a startedAt
    // (e.g. crash / hard kill that skipped visibilitychange), recover gracefully:
    // treat it as paused at the computed elapsed time rather than fast-forwarding.
    if (timerRecord.timerRunning && timerRecord.startedAt) {
      // Calculate how long it was "running" since last checkpoint.
      // We intentionally keep it paused on load — the user can resume manually.
      const elapsed = currentTotalSeconds();
      timerRecord = { ...timerRecord, timeSpent: elapsed, timerRunning: false, startedAt: null };
      await upsertTimer(timerRecord);
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
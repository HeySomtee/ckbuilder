/* Presentation only. No wallet, API or chain reads belong in startup. */
(() => {
  const splash = document.getElementById('streak-startup');
  const recovery = document.getElementById('streak-landing-recovery');
  const recoveryWasVisible = recovery && getComputedStyle(recovery).visibility === 'visible';
  const root = document.getElementById('root');
  const isApp = location.pathname === '/season' || location.pathname.startsWith('/season/');
  const logo = splash?.querySelector('.streak-startup-logo');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let ready = false,
    done = false,
    recovering = false,
    artworkFailed = false;
  let artworkStarted = null;
  let artworkFrame, presentationTimer, artworkTimer, recoveryTimer;
  if (isApp) {
    document.documentElement.dataset.streakStartup = 'app';
    if (root) root.inert = true;
  } else splash?.remove();

  function finish(immediate = false) {
    if (done) return;
    done = true;
    clearTimeout(recoveryTimer);
    clearTimeout(presentationTimer);
    clearTimeout(artworkTimer);
    cancelAnimationFrame(artworkFrame);
    const hadFocus = recovery?.contains(document.activeElement);
    recovery?.remove();
    if (root) root.inert = false;
    window.removeEventListener('error', onError, true);
    window.removeEventListener('vite:preloadError', fail);
    document.removeEventListener('streak:shell-ready', onReady);
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    reducedMotion.removeEventListener('change', onMotionChange);
    logo?.removeEventListener('load', onArtwork);
    logo?.removeEventListener('error', onArtworkError);
    if (hadFocus && root) {
      root.tabIndex = -1;
      root.focus({ preventScroll: true });
    }
    if (!isApp || immediate === true || reducedMotion.matches || document.hidden || recovering) {
      splash?.remove();
      return;
    }
    if (!splash) return;
    splash.dataset.phase = 'exiting';
    splash.inert = true;
    splash.setAttribute('aria-hidden', 'true');
    let firstFrame, secondFrame;
    const remove = () => {
      clearTimeout(exitTimer);
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      splash.remove();
    };
    const exitTimer = setTimeout(remove, 500);
    splash.addEventListener('animationend', (event) => {
      if (event.target === splash) remove();
    });
    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => splash.classList.add('streak-startup-leaving'));
    });
  }
  function scheduleExit() {
    if (!ready || done) return;
    clearTimeout(presentationTimer);
    if (reducedMotion.matches || document.hidden || artworkFailed) {
      finish(true);
      return;
    }
    if (artworkStarted === null) return;
    clearTimeout(artworkTimer);
    const remaining = 2000 - (performance.now() - artworkStarted);
    if (remaining <= 0) finish();
    else presentationTimer = setTimeout(finish, remaining);
  }
  function onArtwork() {
    if (done || artworkStarted !== null || artworkFrame) return;
    artworkFrame = requestAnimationFrame(() => {
      artworkStarted = performance.now();
      scheduleExit();
    });
  }
  function onArtworkError() {
    artworkFailed = true;
    scheduleExit();
  }
  function onReady(event) {
    if (done) return;
    ready = true;
    clearTimeout(recoveryTimer);
    if (
      !isApp ||
      recovering ||
      event?.detail?.immediate ||
      document.documentElement.dataset.streakLegacyRedirect === 'true'
    ) {
      finish(true);
      return;
    }
    if (splash) splash.dataset.phase = 'presenting';
    if (artworkStarted === null && !artworkTimer)
      artworkTimer = setTimeout(() => finish(true), 1000);
    scheduleExit();
  }
  function onKeyDown(event) {
    if (ready && event.key === 'Escape') {
      event.preventDefault();
      finish();
    }
  }
  function onVisibilityChange() {
    if (ready && document.hidden) finish(true);
  }
  function onMotionChange() {
    if (ready && reducedMotion.matches) finish(true);
  }
  function showRecovery(failed = false) {
    if (done || ready || !recovery) return;
    recovering = true;
    clearTimeout(recoveryTimer);
    if (splash) splash.hidden = true;
    if (failed) {
      document.getElementById('streak-recovery-title').textContent = 'Let’s get you back in.';
      document.getElementById('streak-recovery-detail').textContent =
        'Streak could not finish loading. Try again or open your current wallet.';
    }
    recovery.dataset.visible = 'true';
  }
  function fail() {
    if (ready) finish(true);
    else showRecovery(true);
  }
  function onError(event) {
    if (event.target instanceof HTMLScriptElement && event.target.type === 'module') {
      fail();
      return;
    }
    // Ignore unrelated scripts and wallet-extension errors during the intro.
    if (event instanceof ErrorEvent && event.filename) {
      try {
        const source = new URL(event.filename, location.href);
        if (
          source.origin === location.origin &&
          (source.pathname.startsWith('/season/assets/') || source.pathname.startsWith('/src/'))
        )
          fail();
      } catch {
        /* The bounded timeout handles unknown script sources. */
      }
    }
  }
  document.getElementById('streak-startup-retry')?.addEventListener('click', (event) => {
    event.preventDefault();
    location.reload();
  });
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('visibilitychange', onVisibilityChange);
  reducedMotion.addEventListener('change', onMotionChange);
  logo?.addEventListener('load', onArtwork);
  logo?.addEventListener('error', onArtworkError);
  if (isApp && logo?.complete) {
    if (logo.naturalWidth > 0) onArtwork();
    else onArtworkError();
  }
  window.addEventListener('error', onError, true);
  window.addEventListener('vite:preloadError', fail);
  document.addEventListener('streak:shell-ready', onReady);
  // Disable the independent CSS watchdog only after setup completes.
  document.documentElement.dataset.streakController = 'ready';
  if (recoveryWasVisible) showRecovery();
  if (
    document.documentElement.dataset.streakShellReady === 'true' ||
    document.documentElement.dataset.streakLegacyRedirect === 'true'
  )
    onReady();
  else recoveryTimer = setTimeout(() => showRecovery(), 10_000);
})();

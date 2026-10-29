/* No wallet or data reads here. This only covers the initial application bundle. */
(() => {
  const splash = document.getElementById('streak-startup');
  const landingRecovery = document.getElementById('streak-landing-recovery');
  if (location.pathname !== '/season' && !location.pathname.startsWith('/season/')) {
    // Landing content renders immediately. Keep ordinary recovery separate from branding.
    splash?.remove();
    if (!landingRecovery) return;
    landingRecovery.hidden = true;
    const showRecovery = () => {
      landingRecovery.querySelector('[role="status"]').textContent = 'Let’s get you back in.';
      landingRecovery.hidden = false;
      clearTimeout(recoveryTimer);
    };
    const onError = (event) => {
      if (
        event instanceof ErrorEvent ||
        (event.target instanceof HTMLScriptElement && event.target.type === 'module')
      )
        showRecovery();
    };
    const finish = () => {
      clearTimeout(recoveryTimer);
      window.removeEventListener('error', onError, true);
      window.removeEventListener('vite:preloadError', showRecovery);
      document.removeEventListener('streak:shell-ready', finish);
      landingRecovery.remove();
    };
    const recoveryTimer = setTimeout(showRecovery, 10_000);
    window.addEventListener('error', onError, true);
    window.addEventListener('vite:preloadError', showRecovery);
    document.addEventListener('streak:shell-ready', finish);
    if (document.documentElement.dataset.streakShellReady === 'true') finish();
    return;
  }
  landingRecovery?.remove();
  if (!splash) return;
  document.documentElement.dataset.streakStartup = 'app';
  const status = document.getElementById('streak-startup-status');
  const detail = document.getElementById('streak-startup-detail');
  const actions = document.getElementById('streak-startup-actions');
  const progress = document.getElementById('streak-startup-progress');
  const retry = document.getElementById('streak-startup-retry');
  const skip = document.getElementById('streak-startup-skip');
  const logo = splash.querySelector('.streak-startup-logo');
  const root = document.getElementById('root');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const presentationMs = 2000;
  let ready = false;
  let done = false;
  let failed = false;
  let artworkStarted = null;
  let artworkFailed = false;
  let artworkFrame;
  let presentationTimer;
  let artworkTimer;
  let slowTimer;
  let recoveryTimer;
  let releaseLoader;
  // Decoration never holds the shell or changes startup recovery.
  import('/cell-loader.js')
    .then(({ cellLoaderMarkup, registerCellLoader }) => {
      if (done || ready || failed) return;
      progress.innerHTML = cellLoaderMarkup('wave');
      releaseLoader = registerCellLoader(progress.querySelector('svg'));
    })
    .catch(() => {
      progress.hidden = true;
    });
  // The HTML keeps ordinary recovery links usable if this controller cannot load.
  actions.hidden = true;
  if (root) root.inert = true;

  function finish(immediate = false) {
    if (done) return;
    done = true;
    releaseLoader?.();
    releaseLoader = undefined;
    clearTimeout(slowTimer);
    clearTimeout(recoveryTimer);
    clearTimeout(presentationTimer);
    clearTimeout(artworkTimer);
    cancelAnimationFrame(artworkFrame);
    const hadFocus = splash.contains(document.activeElement);
    if (root) root.inert = false;
    window.removeEventListener('error', onError, true);
    window.removeEventListener('vite:preloadError', fail);
    document.removeEventListener('streak:shell-ready', onReady);
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    reducedMotion.removeEventListener('change', onMotionChange);
    logo.removeEventListener('load', onArtwork);
    logo.removeEventListener('error', onArtworkError);
    if (hadFocus && root) {
      root.tabIndex = -1;
      root.focus({ preventScroll: true });
    }
    if (immediate === true || reducedMotion.matches || document.hidden) {
      splash.remove();
      return;
    }
    // The shell is already usable. Only the decorative exit remains, with no
    // pointer interception, tab stops or loading announcement over the app.
    splash.dataset.phase = 'exiting';
    splash.inert = true;
    splash.setAttribute('aria-hidden', 'true');
    progress.hidden = true;
    status.hidden = true;
    detail.hidden = true;
    actions.hidden = true;
    skip.hidden = true;
    let firstFrame;
    let secondFrame;
    const remove = () => {
      clearTimeout(exitTimer);
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      splash.remove();
    };
    // Bound cleanup even when background tabs or disabled CSS skip animationend.
    const exitTimer = setTimeout(remove, 500);
    splash.addEventListener('animationend', (event) => {
      if (event.target === splash) remove();
    });
    // Give warm-cache startup a painted frame before the visual handoff.
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
    const remaining = presentationMs - (performance.now() - artworkStarted);
    if (remaining <= 0) finish();
    else presentationTimer = setTimeout(finish, remaining);
  }

  function onArtwork() {
    if (done || artworkStarted !== null || artworkFrame) return;
    // Start the short presentation at the first paint of the loaded artwork.
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
    releaseLoader?.();
    releaseLoader = undefined;
    // A React recovery screen or legacy redirect must never wait for branding.
    if (
      event?.detail?.immediate ||
      document.documentElement.dataset.streakLegacyRedirect === 'true'
    ) {
      finish(true);
      return;
    }
    clearTimeout(slowTimer);
    clearTimeout(recoveryTimer);
    splash.dataset.phase = 'presenting';
    status.textContent = 'Your game. Your call.';
    progress.hidden = true;
    detail.hidden = true;
    actions.hidden = true;
    skip.hidden = false;
    // Missing artwork cannot hold a usable app indefinitely.
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
    if (ready && document.hidden) finish();
  }

  function onMotionChange() {
    if (ready && reducedMotion.matches) finish();
  }

  function showRecovery() {
    if (done) return;
    detail.hidden = false;
    actions.hidden = false;
  }

  function fail() {
    if (done || failed) return;
    if (ready) {
      finish(true);
      return;
    }
    failed = true;
    releaseLoader?.();
    releaseLoader = undefined;
    clearTimeout(slowTimer);
    clearTimeout(recoveryTimer);
    status.textContent = 'Let’s get you back in.';
    detail.textContent = 'Streak could not finish loading. Try again or open your current wallet.';
    progress.hidden = true;
    showRecovery();
  }

  function onError(event) {
    if (
      event instanceof ErrorEvent ||
      (event.target instanceof HTMLScriptElement && event.target.type === 'module')
    )
      fail();
  }

  retry.addEventListener('click', (event) => {
    event.preventDefault();
    location.reload();
  });
  skip.addEventListener('click', () => finish());
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('visibilitychange', onVisibilityChange);
  reducedMotion.addEventListener('change', onMotionChange);
  logo.addEventListener('load', onArtwork);
  logo.addEventListener('error', onArtworkError);
  if (logo.complete) {
    if (logo.naturalWidth > 0) onArtwork();
    else onArtworkError();
  }
  window.addEventListener('error', onError, true);
  window.addEventListener('vite:preloadError', fail);
  document.addEventListener('streak:shell-ready', onReady);
  if (
    document.documentElement.dataset.streakShellReady === 'true' ||
    document.documentElement.dataset.streakLegacyRedirect === 'true'
  ) {
    onReady();
    return;
  }
  slowTimer = setTimeout(() => {
    status.textContent = 'Still getting things ready…';
  }, 3000);
  recoveryTimer = setTimeout(() => {
    detail.textContent =
      'This is taking longer than usual. You can retry or open your current wallet.';
    showRecovery();
  }, 10_000);
})();

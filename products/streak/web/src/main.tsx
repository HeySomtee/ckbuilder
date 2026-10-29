import { Component, StrictMode, useLayoutEffect } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './app/app';
import { Landing } from './app/landing';
import './design-system/styles.css';

function finishStartup(immediate = false) {
  const landingRecovery = document.getElementById('streak-landing-recovery');
  const hadRecoveryFocus = landingRecovery?.contains(document.activeElement);
  document.documentElement.dataset.streakShellReady = 'true';
  document.dispatchEvent(new CustomEvent('streak:shell-ready', { detail: { immediate } }));
  document.getElementById('streak-landing-recovery')?.remove();
  // A failed startup-controller download must not cover a successfully mounted app.
  const splash = document.getElementById('streak-startup');
  if (splash?.dataset.phase !== 'presenting' && splash?.dataset.phase !== 'exiting') {
    splash?.remove();
    const root = document.getElementById('root');
    if (root) root.inert = false;
  }
  if (hadRecoveryFocus) {
    const root = document.getElementById('root');
    if (root) {
      root.tabIndex = -1;
      root.focus({ preventScroll: true });
    }
  }
}

function ShellReady({ children }: { children: ReactNode }) {
  useLayoutEffect(finishStartup, []);
  return children;
}

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    finishStartup(true);
  }
  render() {
    return this.state.failed ? (
      <main className="recovery">
        <h1>Let’s get you back.</h1>
        <p>
          This screen could not load. Your account and funds have not been changed by this error.
        </p>
        <button onClick={() => location.reload()}>Reload Streak</button>
        <a href="/index.html#wallet">Open the current Wallet</a>
      </main>
    ) : (
      this.props.children
    );
  }
}
const client = new QueryClient({
  defaultOptions: {
    queries: { gcTime: 5 * 60_000, refetchOnWindowFocus: true },
    mutations: { retry: false },
  },
});
const root = document.getElementById('root');
if (!root) throw new Error('Missing application root.');
const isMarkets = location.pathname === '/season' || location.pathname.startsWith('/season/');
document.title = isMarkets ? 'Markets | Streak' : 'Streak | Your game. Your call.';
if (document.documentElement.dataset.streakLegacyRedirect !== 'true')
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <QueryClientProvider client={client}>
          <ShellReady>{isMarkets ? <App /> : <Landing />}</ShellReady>
        </QueryClientProvider>
      </ErrorBoundary>
    </StrictMode>,
  );

import { Component, StrictMode } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './app/app';
import { Landing } from './app/landing';
import './design-system/styles.css';

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
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
          {isMarkets ? <App /> : <Landing />}
        </QueryClientProvider>
      </ErrorBoundary>
    </StrictMode>,
  );

/* Test entry only. Production never imports this component harness. */
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
import { WalletOverview, WalletSummary } from '../web/src/features/account/wallet-ui';
import { getAccount, disconnectAccount } from '../web/src/features/account/api';
import type { Account } from '../web/src/features/account/api';
import type { WebComponentConnector } from '@ckb-ccc/connector';
import '../web/src/design-system/styles.css';
import { PaymentProgress } from '../web/src/features/direct/payment-progress';

// Exercise terminal recovery notifications using the real shared component.
// This fixture owns no transaction or journal; the checkout suite covers those.
export function showFinishedRecovery(operationKey: string) {
  const host = document.createElement('div');
  document.body.append(host);
  createRoot(host).render(
    <PaymentProgress
      stage="attention"
      terminal
      operationKey={operationKey}
      count={1}
      hidden={false}
      onOpen={() => {}}
    />,
  );
}

const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
let capacity = 1234_00000001n,
  balanceFails = false,
  balanceReads = 0;
let copied = '';
Object.defineProperty(navigator, 'clipboard', {
  configurable: true,
  value: {
    writeText: async (text: string) => {
      copied = text;
    },
  },
});
export const copiedAddress = () => copied;
export const reads = () => balanceReads;
export function balanceFailure(failed: boolean) {
  balanceFails = failed;
}
export function setCapacity(value: string) {
  capacity = BigInt(value);
}
export async function refreshAccount() {
  await cache.invalidateQueries({ queryKey: ['account'] });
}
export function replaceAccount(account: Account | null) {
  cache.setQueryData(['account'], account);
}
export async function connectSynthetic(element: WebComponentConnector) {
  const { connectEvm } = await import('./wallet-browser-fixture.mjs');
  const update = element.updateSigner.bind(element);
  element.updateSigner = async (...args) => {
    const signer = args[1]?.signer;
    if (signer)
      signer.client.getBalanceSingle = async () => {
        balanceReads++;
        if (balanceFails) throw Error('Synthetic balance service unavailable.');
        return capacity;
      };
    return update(...args);
  };
  await connectEvm(element);
}
function Harness() {
  const account = useQuery({ queryKey: ['account'], queryFn: ({ signal }) => getAccount(signal) });
  const [destination, setDestination] = useState('');
  return (
    <main style={{ padding: '24px', maxWidth: '1100px', marginInline: 'auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <WalletSummary account={account.data ?? null} accountReady={!account.isPending} />
      </div>
      <WalletOverview
        account={account.data ?? null}
        accountReady={!account.isPending}
        onSignIn={() => void account.refetch()}
        onActivity={() => setDestination('Activity opened')}
        onRecovery={() => setDestination('Recovery opened')}
        onDisconnect={() => void disconnectAccount().then(() => replaceAccount(null))}
      />
      <p role="status">{destination}</p>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={cache}>
    <Harness />
  </QueryClientProvider>,
);

/* Isolated production slip/component entry. No production test globals. */
import React, { useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import type { WebComponentConnector } from '@ckb-ccc/connector';
import { PredictionSlip } from '../web/src/features/predictions/slip';
import { DraftStore } from '../web/src/features/predictions/draft';
import { getAccount } from '../web/src/features/account/api';
import type { Account } from '../web/src/features/account/api';
import { chooseWallet, getWalletState, subscribeWallet } from '../web/src/lib/wallet';
import { BatchTransaction } from '../web/src/features/direct/batch-ui';
import { BatchClient } from '../web/src/features/direct/batch-client';
import { batchTransport } from '../web/src/features/direct/batch-api';
import { IndexedBatchJournal } from '../web/src/features/direct/batch-journal';
import { IndexedJournal } from '../web/src/features/direct/journal';
import { IndexedSponsoredJournal } from '../web/src/features/direct/sponsored-journal';
import '../web/src/design-system/styles.css';
import '../web/src/design-system/predictions.css';

declare global {
  interface Window {
    syntheticRpc(method: string, args: unknown[]): Promise<unknown>;
    syntheticSigning(): Promise<boolean>;
  }
}
const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const store = new DraftStore(localStorage);
export const draft = () => store.getSnapshot().draft;
export const replaceAccount = (account: Account | null) => cache.setQueryData(['account'], account);
export const changeStake = (index: number, value: string) =>
  store.amount(draft().picks[index].lineId, value);
export async function saved(scope: string) {
  return new IndexedBatchJournal().list(scope);
}
export async function connectSynthetic(element: WebComponentConnector) {
  const { ccc } = await import('@ckb-ccc/core');
  const { batchOwnerKey, attachBatchRpc } = await import('./batch-browser-fixture.mjs');
  const client = attachBatchRpc(
    new ccc.ClientPublicTestnet({ url: 'https://testnet.ckb.dev/', fallbacks: [] }),
    window.syntheticRpc,
  );
  const signer = new ccc.SignerCkbPrivateKey(client, batchOwnerKey),
    sign = signer.signTransaction.bind(signer);
  signer.signTransaction = async (transaction) => {
    if (await window.syntheticSigning()) throw Error('Synthetic wallet rejected this request.');
    return sign(transaction);
  };
  element.onClose(
    () =>
      void element.updateSigner(
        { name: 'Synthetic combined wallet' },
        { name: 'Native synthetic signer', signer },
      ),
  );
}
export async function crossStore(record: Awaited<ReturnType<IndexedBatchJournal['list']>>[number]) {
  const { ccc } = await import('@ckb-ccc/core');
  // Cross-store reservation behavior is checked using valid stored records below;
  // no synthetic replacement transaction is submitted.
  const direct = {
    version: 'testnet-v1',
    scope: record.scope,
    ownerHash: record.ownerHash,
    kind: 'claim',
    descriptor: record.descriptor,
    createdAt: Date.now(),
    status: 'signed',
    principalShannons: '10000000000',
    storageShannons: '32100000000',
    feeShannons: '1000',
    payoutShannons: '42100000000',
    shard: null,
    outcome: 0,
  };
  const tx = ccc.Transaction.from({
    inputs: [{ previousOutput: record.inputs[1] }],
    outputs: [{ capacity: 42100000000n, lock: record.offer.ownerLock }],
    outputsData: ['0x'],
    witnesses: ['0x01'],
  });
  const result = await Promise.allSettled([
    new IndexedJournal().put({
      ...direct,
      hash: tx.hash(),
      inputs: record.inputs.slice(1, 2),
      signedBytes: tx.toHex(),
    } as Parameters<IndexedJournal['put']>[0]),
    new IndexedSponsoredJournal().otherReservations(record.scope),
    new IndexedBatchJournal().put({
      ...record,
      sourcePicks: record.sourcePicks?.map((pick) => ({
        ...pick,
        lineId: pick.lineId + '-changed',
      })),
    }),
  ]);
  return result.map((entry) => (entry.status === 'rejected' ? String(entry.reason) : entry.value));
}
function Harness() {
  const account = useQuery({ queryKey: ['account'], queryFn: ({ signal }) => getAccount(signal) });
  const [open, setOpen] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const wallet = useSyncExternalStore(subscribeWallet, getWalletState);
  const recovery = useQuery({
    queryKey: ['fixture-recovery', wallet.revision],
    enabled: recovering && !!wallet.connection,
    queryFn: async () => {
      const client = new BatchClient(wallet.connection!.signer, batchTransport);
      return { client, records: await client.history() };
    },
  });
  return (
    <main id="main">
      <h1>Combined slip browser check</h1>
      <button onClick={() => setOpen(true)}>Open prediction slip</button>
      <button onClick={() => setRecovering(true)}>Show saved payment recovery</button>
      {recovering && recovery.data && (
        <section aria-label="Saved combined payments">
          {recovery.data.records.map((record) => (
            <BatchTransaction
              key={record.hash}
              record={record}
              client={recovery.data!.client}
              refresh={() => void recovery.refetch()}
              draftStore={store}
            />
          ))}
        </section>
      )}
      <PredictionSlip
        store={store}
        open={open}
        onOpen={() => setOpen(true)}
        onDismiss={() => setOpen(false)}
        accountKey={account.data?.id ?? 'guest'}
        account={account.data ?? null}
        accountReady={!account.isPending}
        onSignIn={() => void chooseWallet()}
        signInPending={false}
      />
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={cache}>
    <Harness />
  </QueryClientProvider>,
);

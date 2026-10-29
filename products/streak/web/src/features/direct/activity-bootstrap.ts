import { ccc } from '@ckb-ccc/core';
import type { QueryClient } from '@tanstack/react-query';
import type { ActiveWallet } from '../../lib/wallet';
import { IndexedJournal } from './journal';
import { IndexedSponsoredJournal } from './sponsored-journal';
import { IndexedBatchJournal } from './batch-journal';
import { parseDescriptor, VERSION } from './protocol';
import { discoverMarket } from './discovery';
import { warmActivity } from './activity-query';

/** Only public RPC + local journal reads. Never calls a wallet provider or signer. */
export async function bootstrapActivity(
  cache: QueryClient,
  wallet: ActiveWallet,
  signal: AbortSignal,
  current: () => boolean,
) {
  if (signal.aborted || !current()) return;
  const rpc = wallet.signer.client;
  if (
    rpc.addressPrefix !== 'ckt' ||
    !['https://testnet.ckb.dev/', 'wss://testnet.ckb.dev/ws'].includes(rpc.url)
  )
    return;
  const ownerHash = (await ccc.Address.fromString(wallet.address, rpc)).script.hash();
  if (signal.aborted || !current()) return;
  const scope = `${VERSION}:${ownerHash}:wallet`;
  const [direct, sponsored, batch] = await Promise.all([
    new IndexedJournal().list(scope),
    new IndexedSponsoredJournal().list(scope),
    new IndexedBatchJournal().list(scope),
  ]);
  if (signal.aborted || !current()) return;
  const saved = [
    ...direct.map((r) => ({ ...r, descriptors: [r.descriptor] })),
    ...sponsored
      .filter((r) => r.status === 'committed' || r.finalSignedBytes)
      .map((r) => ({ ...r, descriptors: [r.descriptor] })),
    ...batch.filter((r) => r.status === 'committed' || r.finalSignedBytes),
  ]
    .filter((r) => r.ownerHash === ownerHash)
    .sort((a, b) => b.createdAt - a.createdAt);
  await warmActivity(
    cache,
    {
      discover: async (descriptor, progress, readSignal) => {
        const checked = await parseDescriptor(descriptor);
        readSignal.throwIfAborted();
        // SDK reads cannot be forcibly aborted. The shared query fences callbacks
        // and final results, and the next market is never started after cancellation.
        return discoverMarket(rpc, checked, ownerHash, progress);
      },
    },
    ownerHash,
    saved.flatMap((r) => r.descriptors),
    signal,
    current,
  );
}

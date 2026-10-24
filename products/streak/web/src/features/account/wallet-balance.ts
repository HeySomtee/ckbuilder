import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  assertActiveWallet,
  assertWalletAccount,
  getWalletState,
  subscribeWallet,
} from '../../lib/wallet';
import type { Account } from './api';

/** Shared navigation/overview cache. The chain adapter is loaded only after explicit connection. */
export function useWalletBalance(account: Account | null, accountReady: boolean) {
  const wallet = useSyncExternalStore(subscribeWallet, getWalletState),
    connection = wallet.connection;
  const balance = useQuery({
    queryKey: [
      'private',
      'wallet-balance',
      account?.id ?? 'guest',
      account?.walletAddress ?? '',
      connection?.revision ?? wallet.revision,
    ],
    enabled: accountReady && !!connection,
    queryFn: async ({ signal }) => {
      if (!connection) throw Error('Connect your wallet to view its balance.');
      await assertActiveWallet(connection);
      if (account) await assertWalletAccount(connection, account.walletAddress);
      signal.throwIfAborted();
      const [{ DirectClient }, { MANIFEST }] = await Promise.all([
        import('../direct/client'),
        import('../direct/protocol'),
      ]);
      const capacity = await new DirectClient(connection.signer, MANIFEST, 'wallet').balance();
      await assertActiveWallet(connection);
      signal.throwIfAborted();
      return capacity;
    },
    retry: false,
    staleTime: 15_000,
    gcTime: 300_000,
    refetchInterval: connection ? 30_000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  return {
    wallet,
    connection,
    balance,
    address: connection?.address ?? account?.walletAddress ?? null,
  };
}

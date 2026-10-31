import type { ccc } from '@ckb-ccc/connector';

interface WalletProvider {
  request(args: { method: string; params: unknown[] }): Promise<unknown>;
}
function injectedProvider(signer: ccc.Signer): WalletProvider | undefined {
  if (signer.type !== 'EVM' || !('provider' in signer)) return;
  const provider = signer.provider;
  if (
    !provider ||
    typeof provider !== 'object' ||
    !('request' in provider) ||
    typeof provider.request !== 'function'
  )
    return;
  return provider as WalletProvider;
}
function unsupported(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    (error.code === 4200 || error.code === -32601)
  );
}

// Only explicit disconnect/reconnect uses these methods. Restoration is read-only.
export async function releaseWalletPermission(signer: ccc.Signer): Promise<string | null> {
  const provider = injectedProvider(signer);
  try {
    if (provider)
      await provider.request({
        method: 'wallet_revokePermissions',
        params: [{ eth_accounts: {} }],
      });
    else await signer.disconnect();
    return null;
  } catch {
    return 'Disconnected from Streak. Your wallet kept its site permission. Choose the account you want when reconnecting; some wallets require selecting it in the wallet app.';
  }
}

export async function selectWalletAccount(signer: ccc.Signer): Promise<void> {
  const provider = injectedProvider(signer);
  if (!provider) return;
  try {
    await provider.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] });
  } catch (error) {
    // Unsupported methods may fall back to the wallet's currently selected account.
    // Cancellation and other failures must never silently select the old account.
    if (!unsupported(error)) throw error;
  }
}

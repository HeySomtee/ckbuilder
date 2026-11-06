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
  // Treat an explicit method-whitelist error like 4200 / -32601 only for the
  // optional wallet_requestPermissions call, never account access or signing.
  // A wrapped rejection or other failure still takes precedence.
  const pending: unknown[] = [error];
  const seen = new Set<object>();
  let methodMissing = false;
  let unlistedMethod = false;
  while (pending.length) {
    const value = pending.pop();
    if (typeof value === 'string') {
      if (
        /\b(rejected|denied|cancelled|canceled|unauthori[sz]ed|pending|disconnected)\b|\bnot (?:authori[sz]ed|connected)\b|\bno connected wallet\b|\bconnection (?:lost|closed)\b/i.test(
          value,
        )
      )
        return false;
      unlistedMethod ||= /^rpc method is not whitelisted[.!]?$/i.test(value.trim());
      continue;
    }
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    if (seen.size >= 8) return false;
    seen.add(value);
    if ('message' in value && typeof value.message === 'string') pending.push(value.message);
    if ('code' in value && value.code !== undefined) {
      const code =
        typeof value.code === 'string' && /^-?\d+$/.test(value.code)
          ? Number(value.code)
          : value.code;
      if (code === 4200 || code === -32601) methodMissing = true;
      else if (code !== -32603 && code !== -32000 && code !== -32001) return false;
    }
    if ('cause' in value) pending.push(value.cause);
    if ('error' in value) pending.push(value.error);
    if ('data' in value) pending.push(value.data);
    if ('originalError' in value) pending.push(value.originalError);
  }
  return methodMissing || unlistedMethod;
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

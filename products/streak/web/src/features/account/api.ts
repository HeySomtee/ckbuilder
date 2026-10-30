import { ApiError, isRecord, request, text } from '../../lib/http';
import {
  assertActiveWallet,
  assertWalletAccount,
  chooseWallet,
  disconnectWallet,
  getWalletState,
} from '../../lib/wallet';
import { parseAccount, parseTelegramLink } from './data';
import type { Account, TelegramLink } from './data';
export type { Account, TelegramLink } from './data';
export async function getAccount(signal: AbortSignal): Promise<Account | null> {
  try {
    const data = await request('/me', signal);
    return parseAccount(data);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}
export async function connectTelegram(): Promise<TelegramLink> {
  return parseTelegramLink(await request('/integrations/telegram/connect', undefined, {}));
}
export async function disconnectTelegram(): Promise<Account> {
  return parseAccount(await request('/integrations/telegram/disconnect', undefined, {}));
}
export async function signOut(): Promise<void> {
  await request('/logout', undefined, {});
  disconnectWallet('Signed out. Connect your wallet when you are ready.');
}
export async function signIn(onProgress?: (label: string) => void): Promise<Account> {
  let stage = 'Connecting wallet';
  try {
    return await performSignIn((label) => {
      stage = label;
      onProgress?.(label);
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : isRecord(error) && typeof error.message === 'string'
          ? error.message
          : typeof error === 'string'
            ? error
            : '';
    if (/no connected wallet/i.test(message))
      throw new Error(
        'Your wallet reports no active connection. Reconnect this site inside your wallet, then try signing in again.',
      );
    throw new Error(message.trim() || `${stage} did not finish. Please try signing in again.`);
  }
}
async function performSignIn(onProgress: (label: string) => void): Promise<Account> {
  onProgress?.('Connecting wallet');
  const signer = await chooseWallet();
  // Secondary JoyID keys require a separately verified delegation proof.
  // Explain this before requesting a signature that the server cannot accept.
  if (signer.signType === 'JoyId') {
    const identity: unknown = JSON.parse(await signer.getIdentity());
    if (
      !isRecord(identity) ||
      identity.keyType !== 'main_key' ||
      typeof identity.publicKey !== 'string' ||
      !/^[a-fA-F0-9]{128}$/.test(identity.publicKey)
    )
      throw new Error(
        'Use your original JoyID passkey, or choose MetaMask, Zerion or a CKB wallet. Secondary JoyID keys are not supported yet.',
      );
  }
  const connection = getWalletState().connection;
  if (!connection) throw new Error('Wallet connection changed. Please sign in again.');
  // A mobile provider can expose an address through eth_accounts while its
  // signing permission is no longer active. Renew access only on this explicit
  // sign-in action, never during restoration, and pin the originally selected account.
  if (signer.type === 'EVM' && 'provider' in signer) {
    onProgress('Confirm wallet access');
    await signer.connect();
    await assertActiveWallet(connection);
  }
  const address = await signer.getRecommendedAddress();
  onProgress?.('Preparing sign-in');
  const data = await request('/auth/nonce', undefined, { address });
  if (!isRecord(data)) throw new Error('Unable to prepare sign-in.');
  const message = text(data.message);
  const challengeId = text(data.challengeId);
  if (
    !message.includes(`Origin: ${location.origin}\n`) ||
    !message.includes(`Address: ${address}\n`) ||
    !message.includes(`Nonce: ${challengeId}\n`)
  )
    throw new Error('The sign-in message does not match this site and wallet.');
  onProgress?.('Approve sign-in in your wallet');
  const signature = await signer.signMessage(message);
  onProgress?.('Verifying sign-in');
  await assertActiveWallet(connection);
  await request('/auth/verify', undefined, { address, challengeId, signature });
  onProgress('Checking sign-in session');
  const account = await getAccount(new AbortController().signal);
  if (!account)
    throw new Error(
      'Your sign-in session was not retained. Allow cookies for this site in your wallet browser, then try again.',
    );
  await assertWalletAccount(connection, account.walletAddress);
  return account;
}

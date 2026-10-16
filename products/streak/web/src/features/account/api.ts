import { ApiError, isRecord, request, text } from '../../lib/http';
import {
  assertActiveWallet,
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
export async function signIn(): Promise<void> {
  const signer = await chooseWallet();
  const connection = getWalletState().connection;
  if (!connection) throw new Error('Wallet connection changed. Please sign in again.');
  const address = await signer.getRecommendedAddress();
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
  const signature = await signer.signMessage(message);
  await assertActiveWallet(connection);
  await request('/auth/verify', undefined, { address, challengeId, signature });
}

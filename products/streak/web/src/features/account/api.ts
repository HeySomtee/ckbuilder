import { ApiError, isRecord, request, text } from '../../lib/http';
export interface Account {
  id: string;
  username: string;
  walletAddress: string;
}
export async function getAccount(signal: AbortSignal): Promise<Account | null> {
  try {
    const data = await request('/me', signal);
    if (!isRecord(data) || !isRecord(data.user)) throw new Error('Unable to read your account.');
    return {
      id: text(data.user.id),
      username: text(data.user.username),
      walletAddress: text(data.user.walletAddress),
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}
export async function signOut(): Promise<void> {
  await request('/logout', undefined, {});
}
export async function signIn(): Promise<void> {
  const { chooseWallet } = await import('../../lib/wallet');
  const signer = await chooseWallet();
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
  await request('/auth/verify', undefined, { address, challengeId, signature });
}

export interface Account {
  id: string;
  username: string;
  walletAddress: string;
  telegramConnected: boolean;
  telegramUsername: string | null;
  telegramAvailable: boolean;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Unable to read your account.');
  return value as Record<string, unknown>;
}
function boundedText(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum)
    throw Error('Unable to read your account.');
  return value;
}
export function parseAccount(value: unknown): Account {
  const user = record(record(value).user);
  for (const key of ['telegramConnected', 'telegramAvailable'])
    if (user[key] !== undefined && typeof user[key] !== 'boolean')
      throw Error('Unable to verify your Telegram connection.');
  if (
    user.telegramUsername !== undefined &&
    user.telegramUsername !== null &&
    (typeof user.telegramUsername !== 'string' ||
      !/^[a-zA-Z0-9_]{1,32}$/.test(user.telegramUsername))
  )
    throw Error('Unable to verify your Telegram username.');
  const connected = user.telegramConnected === true;
  return {
    id: boundedText(user.id, 120),
    username: boundedText(user.username, 120),
    walletAddress: boundedText(user.walletAddress, 400),
    telegramConnected: connected,
    telegramUsername:
      connected && typeof user.telegramUsername === 'string' ? user.telegramUsername : null,
    telegramAvailable: user.telegramAvailable === true,
  };
}

export interface TelegramLink {
  url: string;
  expiresAt: number;
}
export function parseTelegramLink(value: unknown, now = Date.now()): TelegramLink {
  const data = record(value);
  if (typeof data.url !== 'string' || data.url.length > 250 || typeof data.expiresAt !== 'string')
    throw Error('Telegram returned an invalid connection link.');
  let url: URL;
  try {
    url = new URL(data.url);
  } catch {
    throw Error('Telegram returned an invalid connection link.');
  }
  const expiry = Date.parse(data.expiresAt),
    parameters = [...url.searchParams.keys()];
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 't.me' ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    !/^\/[a-zA-Z0-9_]{5,32}$/.test(url.pathname) ||
    parameters.length !== 1 ||
    parameters[0] !== 'start' ||
    !/^link_[a-zA-Z0-9_-]{16,128}$/.test(url.searchParams.get('start') ?? '') ||
    !Number.isFinite(expiry) ||
    expiry <= now ||
    expiry > now + 16 * 60_000
  )
    throw Error('Telegram returned an invalid or expired connection link.');
  return { url: url.toString(), expiresAt: expiry };
}

export function shortWalletAddress(address: string): string {
  return address.length <= 22 ? address : `${address.slice(0, 9)}...${address.slice(-7)}`;
}

/** Display only: truncate shannons without losing precision through Number. */
export function displayWalletBalance(shannons: bigint): string {
  const cents = shannons / 1_000_000n;
  return `${(cents / 100n).toLocaleString('en-US')}.${(cents % 100n).toString().padStart(2, '0')}`;
}

import type { IncomingMessage } from 'http';
import { FiveError } from '../five/domain';

export function configuredGameMode(env: NodeJS.ProcessEnv = process.env): 'api' | 'test' {
  const mode = env.STREAK_GAMES_DATA_MODE ?? 'api';
  if (mode !== 'api' && mode !== 'test')
    throw new FiveError('STREAK_GAMES_DATA_MODE must be api or test.', 503);
  if (
    mode === 'test' &&
    (env.NODE_ENV === 'production' ||
      env.RENDER ||
      env.STREAK_PUBLIC_ORIGIN ||
      env.STREAK_GAMES_TEST_ENABLED !== '1' ||
      env.STREAK_FIVE_NETWORK !== 'testnet')
  )
    throw new FiveError(
      'Dummy game data is available only on a configured local testnet instance.',
      503,
    );
  return mode;
}

export function localGameMode(req: IncomingMessage, env: NodeJS.ProcessEnv = process.env) {
  const mode = configuredGameMode(env);
  if (mode === 'test') {
    const peer = req.socket.remoteAddress;
    let host = '';
    try {
      host = new URL(`http://${req.headers.host}`).hostname;
    } catch {
      /* Denied below. */
    }
    if (
      !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer ?? '') ||
      !['localhost', '127.0.0.1', '[::1]'].includes(host) ||
      req.headers.forwarded ||
      req.headers['x-forwarded-for'] ||
      req.headers['x-forwarded-host'] ||
      req.headers['x-forwarded-proto']
    )
      throw new FiveError('Dummy game data is available only through localhost.', 403);
  }
  return mode;
}

export function requestGameMode(
  req: IncomingMessage,
  url: URL,
  env: NodeJS.ProcessEnv = process.env,
) {
  const mode = localGameMode(req, env);
  const requested = url.searchParams.get('data');
  // The browser pins its mode for the lifetime of the document. A restart into
  // another mode must never route a prepared signature to a different store.
  if (
    url.searchParams.getAll('data').length > 1 ||
    (requested !== null && requested !== mode) ||
    (req.method === 'POST' && mode === 'test' && requested === null)
  )
    throw new FiveError('Game data settings changed. Reload this page before continuing.', 409);
  return mode;
}

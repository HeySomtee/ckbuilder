/** Key-free API transport. The signer and operator service are separate processes. */
export class SponsorProxyError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function sponsorProxy(
  path: string,
  request?: unknown,
  authenticatedOwnerAddress?: string,
): Promise<unknown> {
  const endpoint = process.env.STREAK_SPONSOR_URL,
    token = process.env.STREAK_SPONSOR_IPC_SECRET;
  if (!endpoint || !token || !/^[0-9a-f]{64}$/.test(token))
    throw Error('Sponsor service is not configured');
  const origin = new URL(endpoint);
  if (
    origin.protocol !== 'http:' ||
    origin.hostname !== '127.0.0.1' ||
    !origin.port ||
    origin.pathname !== '/' ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash
  )
    throw Error('Sponsor service must use an explicit loopback HTTP port');
  if (
    !/^\/(?:batch\/)?(?:configuration|fixture|status|offer|submit|resolve|resume)(?:\?.*)?$/.test(
      path,
    )
  )
    throw Error('Invalid sponsor operation');
  const response = await fetch(`${origin.origin}${path}`, {
    method: request === undefined ? 'GET' : 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(60_000),
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...(request === undefined
      ? {}
      : { body: JSON.stringify({ request, authenticatedOwnerAddress }) }),
  });
  const reader = response.body?.getReader();
  if (!reader) throw Error('Sponsor response is empty');
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 600_000) throw Error('Sponsor response exceeds its byte limit');
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel();
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!response.ok) {
    const message =
      value && typeof value === 'object' && 'error' in value && typeof value.error === 'string'
        ? value.error
        : '';
    if (
      message.length <= 240 &&
      /^(Sponsor is completing|Streak needs additional|Streak is at|Unsigned sponsor offer expired|Invalid owner transaction signature|Fixture terms changed|This fixture already has|Sponsored contract deployment|Sponsor funding is awaiting|Owner needs principal|Owner input must be live|Sponsor queue is busy|This fixture has reached|Use the wallet linked|This proposal belongs|Sponsor request could not complete|Payment review is temporarily unavailable|Atomic payment is awaiting|New predictions use|This fixture has positions|This fixture has no available|This fixture is closed)/.test(
        message,
      )
    )
      throw new SponsorProxyError(
        [403, 409, 429].includes(response.status) ? response.status : 409,
        message,
      );
    throw Error('Sponsor service unavailable');
  }
  return value;
}

import * as ccc from '@ckb-ccc/core';

/** Exact UTXO ancestry makes competing creation attempts mutually exclusive. */
export async function sponsoredOriginDescendant(
  client: ccc.Client,
  candidate: ccc.OutPoint,
  origins: ccc.OutPoint[],
): Promise<boolean> {
  const needed = new Set(origins.map((origin) => origin.toHex()));
  if (!needed.size) return true;
  needed.delete(candidate.toHex());
  if (!needed.size) return true;
  const visited = new Set<string>();
  let pending: string[] = [candidate.txHash];
  for (let depth = 0; depth < 8 && pending.length; depth++) {
    const next: string[] = [];
    for (const hash of pending) {
      if (visited.has(hash)) continue;
      visited.add(hash);
      if (visited.size > 64)
        throw Error('Sponsor funding ancestry exceeds its bounded recovery window');
      const parent = await client.getTransactionNoCache(hash);
      if (!parent || parent.status !== 'committed') continue;
      if (parent.transaction.hash() !== hash || parent.transaction.inputs.length > 64)
        throw Error('Invalid sponsor funding ancestry');
      for (const input of parent.transaction.inputs) {
        needed.delete(input.previousOutput.toHex());
        next.push(input.previousOutput.txHash);
      }
      if (!needed.size) return true;
    }
    pending = next;
  }
  throw Error('Sponsor funding ancestry exceeds its bounded recovery window');
}

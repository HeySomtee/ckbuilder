import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export class ReviewWaitingError extends Error {
  constructor(readonly position: number) {
    super('Your payment review is queued. No payment has been sent.');
  }
}
type Entry = { id: string; owner: string; digest: string; joinedAt: number; expiresAt: number };
const LEASE_MS = 90_000;
const MAX_WAIT_MS = 10 * 60_000;

/** Unsigned admission only. Every mutation must hold the existing operator lease.
 * Expiry never releases transaction inputs, signatures or competition entries. */
export class ReviewQueue {
  private readonly file: string;
  constructor(
    directory: string,
    private readonly now: () => number = Date.now,
  ) {
    this.file = join(directory, 'payment-review-queue.json');
  }
  private read(): Entry[] {
    if (!existsSync(this.file)) return [];
    if (statSync(this.file).size > 65_536) throw Error('Payment review queue exceeds its bound');
    const value: unknown = JSON.parse(readFileSync(this.file, 'utf8'));
    if (!Array.isArray(value) || value.length > 128) throw Error('Invalid payment review queue');
    const entries: Entry[] = value.map((row: unknown) => {
      if (!row || typeof row !== 'object') throw Error('Invalid payment review entry');
      const r = row as Record<string, unknown>;
      if (
        typeof r.id !== 'string' ||
        !/^[0-9a-f-]{36}$/.test(r.id) ||
        typeof r.owner !== 'string' ||
        !/^[0-9a-f]{64}$/.test(r.owner) ||
        typeof r.digest !== 'string' ||
        !/^0x[0-9a-f]{64}$/.test(r.digest) ||
        typeof r.joinedAt !== 'number' ||
        !Number.isSafeInteger(r.joinedAt) ||
        typeof r.expiresAt !== 'number' ||
        !Number.isSafeInteger(r.expiresAt)
      )
        throw Error('Invalid payment review entry');
      return {
        id: r.id,
        owner: r.owner,
        digest: r.digest,
        joinedAt: r.joinedAt,
        expiresAt: r.expiresAt,
      };
    });
    if (
      new Set(entries.map((e) => e.owner)).size !== entries.length ||
      new Set(entries.map((e) => e.id)).size !== entries.length
    )
      throw Error('Duplicate payment review entry');
    const now = this.now();
    return entries.filter((e) => e.expiresAt > now && e.joinedAt + MAX_WAIT_MS > now);
  }
  private write(entries: Entry[]): void {
    const temporary = `${this.file}.${randomUUID()}.next`;
    writeFileSync(temporary, JSON.stringify(entries), { flag: 'wx', mode: 0o600 });
    renameSync(temporary, this.file);
  }
  touch(id: string, address: string, digest: string): number {
    const entries = this.read();
    const owner = createHash('sha256').update(address).digest('hex');
    let entry = entries.find((e) => e.id === id);
    if (entry && (entry.owner !== owner || entry.digest !== digest))
      throw Error('Request identity belongs to another slip');
    if (!entry) {
      // One waiting review per wallet. A genuinely new request joins the back.
      const previous = entries.findIndex((e) => e.owner === owner);
      if (previous >= 0) entries.splice(previous, 1);
      if (entries.length >= 128) throw Error('Sponsor queue is busy. Please try again shortly.');
      entry = { id, owner, digest, joinedAt: this.now(), expiresAt: 0 };
      entries.push(entry);
    }
    entry.expiresAt = Math.min(this.now() + LEASE_MS, entry.joinedAt + MAX_WAIT_MS);
    this.write(entries);
    return entries.indexOf(entry) + 1;
  }
  leave(id: string): void {
    this.write(this.read().filter((e) => e.id !== id));
  }
  cancel(id: string, address: string): void {
    const owner = createHash('sha256').update(address).digest('hex');
    this.write(this.read().filter((e) => e.id !== id || e.owner !== owner));
  }
}

import type { ccc } from '@ckb-ccc/core';

/** Deduplicate identical reads only inside one observation, never across spends. */
export function readSession(client: ccc.Client): ccc.Client {
  const reads = new Map<string, unknown>();
  const methods = new Set([
    'getTransactionNoCache',
    'getHeaderByNumberNoCache',
    'getCellLiveNoCache',
  ]);
  return new Proxy(client, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property, target);
      if (typeof value !== 'function') return value;
      if (!methods.has(String(property))) return value.bind(target);
      return (...args: unknown[]) => {
        const key = `${String(property)}:${JSON.stringify(args, (_, v: unknown) => (typeof v === 'bigint' ? v.toString() : v))}`;
        if (!reads.has(key)) reads.set(key, Reflect.apply(value, target, args));
        return reads.get(key);
      };
    },
  });
}

export async function mapConcurrent<T, R>(
  items: readonly T[],
  width: number,
  map: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const output: R[] = new Array(items.length);
  let next = 0;
  let failed = false;
  await Promise.all(
    Array.from({ length: Math.min(width, items.length) }, async () => {
      while (!failed && next < items.length) {
        const index = next++;
        try {
          output[index] = await map(items[index], index);
        } catch (error) {
          failed = true;
          throw error;
        }
      }
    }),
  );
  return output;
}

export class ReadQueue {
  private active = 0;
  private waiting: (() => void)[] = [];
  private readonly width: number;
  constructor(width: number) {
    this.width = width;
  }
  async run<T>(action: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (this.active >= this.width) await new Promise<void>((resolve) => this.waiting.push(resolve));
    else this.active++;
    try {
      signal?.throwIfAborted();
      return await action();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    }
  }
}

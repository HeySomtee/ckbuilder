/** Bounded read-only work. Drain every started read before releasing an operator lease. */
export async function readBatch<T, R>(
  items: readonly T[],
  read: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const values: R[] = [];
  for (let offset = 0; offset < items.length; offset += 4) {
    const batch = await Promise.allSettled(
      items
        .slice(offset, offset + 4)
        .map((item, index) => Promise.resolve().then(() => read(item, offset + index))),
    );
    const failed = batch.find((result) => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
    for (const result of batch) if (result.status === 'fulfilled') values.push(result.value);
  }
  return values;
}

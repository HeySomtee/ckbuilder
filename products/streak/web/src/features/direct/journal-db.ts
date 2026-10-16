import { object } from './protocol.ts';
import { parseReservation } from './reservations.ts';

export const DIRECT_STORE = 'transactions';
export const SPONSORED_STORE = 'sponsored';
export const BATCH_STORE = 'batch';
const STORES = [DIRECT_STORE, SPONSORED_STORE, BATCH_STORE];
const MAX_RECORDS = 128;

async function open(): Promise<IDBDatabase> {
  if (!globalThis.indexedDB)
    throw Error(
      'Transaction recovery storage is unavailable. Enable browser storage before signing.',
    );
  return new Promise((resolve, reject) => {
    let finished = false;
    const fail = (message: string) => {
      if (!finished) {
        finished = true;
        reject(Error(message));
      }
    };
    const request = indexedDB.open('streak-direct-transactions-v1', 3);
    request.onupgradeneeded = () => {
      for (const store of STORES)
        if (!request.result.objectStoreNames.contains(store))
          request.result.createObjectStore(store, { keyPath: 'key' });
    };
    request.onsuccess = () => {
      if (finished) request.result.close();
      else {
        finished = true;
        resolve(request.result);
      }
    };
    request.onerror = () =>
      fail('Transaction recovery storage could not be opened. Refresh older Streak tabs.');
    request.onblocked = () => fail('Close older Streak tabs before opening transaction recovery.');
  });
}

export async function otherStoredRecords(store: string, scope: string): Promise<unknown[]> {
  return (
    await Promise.all(
      STORES.filter((name) => name !== store).map((name) => storedRecords(name, scope)),
    )
  ).flat();
}

export async function storedRecords(store: string, scope: string): Promise<unknown[]> {
  const db = await open();
  try {
    const values = await new Promise<unknown[]>((resolve, reject) => {
      const tx = db.transaction(STORES, 'readonly');
      const requests = STORES.map((name) =>
        tx.objectStore(name).getAll(undefined, MAX_RECORDS + 1),
      );
      tx.oncomplete = () => {
        const total = requests.reduce((sum, request) => sum + request.result.length, 0);
        if (total > MAX_RECORDS)
          reject(
            Error('Transaction recovery storage is full. Export your history before continuing.'),
          );
        else resolve(requests[STORES.indexOf(store)].result as unknown[]);
      };
      tx.onerror = () =>
        reject(Error('Saved transactions could not be read. Do not submit another payment.'));
    });
    return values.filter((value) => object(value).scope === scope);
  } finally {
    db.close();
  }
}

export async function putStored(
  storeName: string,
  checked: { scope: string; hash: string; inputs: readonly { txHash: string; index: number }[] },
  validateUpdate?: (previous: unknown) => void,
): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORES, 'readwrite');
      const store = tx.objectStore(storeName),
        key = `${checked.scope}:${checked.hash}`;
      let failure = 'Transaction could not be saved. No new submission was started.';
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(Error(failure));
      tx.onabort = () => reject(Error(failure));
      const requests = STORES.map((name) =>
        tx.objectStore(name).getAll(undefined, MAX_RECORDS + 1),
      );
      let remaining = requests.length;
      for (const request of requests)
        request.onsuccess = () => {
          if (--remaining) return;
          try {
            const values: unknown[] = requests.flatMap((entry) => entry.result);
            const previous = requests[STORES.indexOf(storeName)].result.find(
              (value: unknown) => object(value).key === key,
            );
            if (previous) validateUpdate?.(previous);
            if (!previous && values.length >= MAX_RECORDS)
              throw Error(
                'Transaction history is full. Signing is paused until history is exported.',
              );
            if (!previous) {
              const reserved = new Set(checked.inputs.map((p) => `${p.txHash}:${p.index}`));
              for (const value of values) {
                const row = object(value);
                if (row.hash === checked.hash) continue;
                if (row.status === 'discarded' && parseReservation(row).discardedUnsubmitted)
                  continue;
                // Every caller revalidates canonical conflict evidence before signing.
                if (row.status === 'resolved' && row.conflictProof) continue;
                if (!Array.isArray(row.inputs))
                  throw Error('Saved input reservations are invalid.');
                if (
                  row.inputs.some((input) => {
                    const p = object(input);
                    return reserved.has(`${String(p.txHash)}:${String(p.index)}`);
                  })
                )
                  throw Error(
                    'Another saved transaction already reserves an input. No submission was started.',
                  );
              }
            }
            store.put({ ...checked, key });
          } catch (error) {
            failure = error instanceof Error ? error.message : failure;
            tx.abort();
          }
        };
    });
  } finally {
    db.close();
  }
}

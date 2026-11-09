import { existsSync, readFileSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { object, writeExclusiveJson } from './registry';
import { OPERATION_FILE } from './journal';

const filename = (directory: string) => join(directory, 'payment-admission-drain.json');

/** A ready lifecycle operation gets priority over replenishing payment slots. */
export function admissionDrain(directory: string, now = Date.now()): string | undefined {
  const file = filename(directory);
  if (!existsSync(file)) return;
  if (statSync(file).size > 4096) throw Error('Invalid payment admission drain');
  const row = object(JSON.parse(readFileSync(file, 'utf8')), 'payment admission drain');
  if (
    row.version !== 1 ||
    typeof row.operationId !== 'string' ||
    !OPERATION_FILE.test(`${row.operationId}.json`) ||
    typeof row.expiresAt !== 'number' ||
    !Number.isSafeInteger(row.expiresAt)
  )
    throw Error('Invalid payment admission drain');
  return row.expiresAt > now ? row.operationId : undefined;
}

/** All writers hold the same operator lease. Keep the first waiting fixture. */
export function requestAdmissionDrain(
  directory: string,
  operationId: string,
  now = Date.now(),
): void {
  const prior = admissionDrain(directory, now);
  if (prior && prior !== operationId) return;
  const file = filename(directory),
    temporary = `${file}.${randomUUID()}.next`;
  writeExclusiveJson(temporary, { version: 1, operationId, expiresAt: now + 300_000 });
  renameSync(temporary, file);
  admissionDrain(directory, now);
}

/** Clear only after immutable signing; the ordinary barrier then protects that spend. */
export function completeAdmissionDrain(directory: string, operationId: string): void {
  if (admissionDrain(directory) === operationId) unlinkSync(filename(directory));
}

import * as ccc from '@ckb-ccc/core';
import { existsSync, readFileSync, readdirSync, renameSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { runOperator } from './cli';
import { OperatorJournal, reconcileOperation } from './journal';
import { loadOperatorMarket } from './operator';
import {
  DirectRegistry,
  PUBLIC_DIRECT_CONFIG,
  type DirectMarketRecord,
  writeExclusiveJson,
} from './registry';

export interface WorkerState {
  exists: boolean;
  closed: boolean;
  eligibleReport: boolean;
  blocked?: string;
}
export interface WorkerPorts {
  now(): number;
  inspect(record: DirectMarketRecord): Promise<WorkerState>;
  execute(
    action: 'report' | 'settle' | 'void' | 'reconcile',
    record: DirectMarketRecord,
  ): Promise<void>;
}
export interface WorkerResult {
  fixtureId: string;
  action: 'report' | 'settle' | 'void' | 'reconcile' | 'wait' | 'closed';
  status: 'complete' | 'waiting' | 'needs-review';
  reason?: string;
}

/** At most four markets per invocation, serial fund selection, no fabricated football results. */
export async function workerCycle(
  records: DirectMarketRecord[],
  cursor: number,
  ports: WorkerPorts,
): Promise<{ cursor: number; results: WorkerResult[] }> {
  if (records.length > 256 || !Number.isSafeInteger(cursor) || cursor < 0)
    throw Error('Worker catalogue or cursor exceeds its bound');
  const results: WorkerResult[] = [];
  for (let offset = 0; offset < Math.min(4, records.length); offset++) {
    const record = records[(cursor + offset) % records.length];
    let action: WorkerResult['action'] = 'wait';
    try {
      await ports.execute('reconcile', record);
      const state = await ports.inspect(record);
      if (state.closed) {
        results.push({ fixtureId: record.fixtureId, action: 'closed', status: 'complete' });
        continue;
      }
      if (state.blocked) {
        results.push({
          fixtureId: record.fixtureId,
          action: 'wait',
          status: 'needs-review',
          reason: state.blocked,
        });
        continue;
      }
      if (!state.exists || ports.now() < record.cutoffMs) {
        results.push({ fixtureId: record.fixtureId, action: 'wait', status: 'waiting' });
        continue;
      }
      action = state.eligibleReport
        ? 'settle'
        : ports.now() >= record.terms.deadlineMs
          ? 'void'
          : 'report';
      await ports.execute(action, record);
      results.push({ fixtureId: record.fixtureId, action, status: 'complete' });
    } catch (error) {
      // Redact provider/RPC material. Expected nonfinal feeds remain explicitly waiting.
      const message = error instanceof Error ? error.message : '';
      const pending =
        /First result observation|no supported final result|requires two matching|regulation-time scores|kickoff changed/.test(
          message,
        );
      results.push({
        fixtureId: record.fixtureId,
        action,
        status: pending ? 'waiting' : 'needs-review',
        reason: pending
          ? 'Awaiting fresh, matching pinned football evidence.'
          : 'Operator step failed. Reconcile this fixture using its durable journal before retrying.',
      });
    }
  }
  return {
    cursor: records.length ? (cursor + Math.min(4, records.length)) % records.length : 0,
    results,
  };
}

export async function runWorkerOnce(): Promise<void> {
  if (process.env.NODE_ENV === 'test')
    throw Error('Live worker CLI is forbidden in routine tests; inject local worker ports');
  const directory = process.env.STREAK_DIRECT_OPERATOR_DIR,
    registryDirectory = process.env.STREAK_DIRECT_REGISTRY_DIR;
  if (!directory || !registryDirectory || !isAbsolute(directory) || !isAbsolute(registryDirectory))
    throw Error('Configure absolute durable operator and registry directories');
  if (!process.env.STREAK_DIRECT_PRIVATE_KEY)
    throw Error(
      'Worker needs explicit operator signing environment; it never loads .env or key files',
    );
  if (process.env.NODE_ENV === 'production' && process.env.STREAK_DIRECT_DURABLE_STATE_ACK !== '1')
    throw Error('Hosted worker needs an acknowledged durable volume');
  const journal = new OperatorJournal(directory),
    registry = new DirectRegistry(registryDirectory);
  const lease = new OperatorJournal(join(directory, 'worker-lease'));
  const client = new ccc.ClientPublicTestnet({
    url: PUBLIC_DIRECT_CONFIG.rpc,
    fallbacks: [],
    timeout: 15_000,
    maxConcurrent: 2,
  });
  await lease.exclusive(async () => {
    const records = new Map(registry.all().map((record) => [record.fixtureId, record]));
    const files = readdirSync(directory).filter((file) =>
      /^create-api-football-[1-9][0-9]{0,14}\.json$/.test(file),
    );
    if (files.length > 256) throw Error('Worker creation journal exceeds pilot bounds');
    for (const file of files) {
      const creation = journal.load(file.slice(0, -5));
      if (creation && !records.has(creation.fixtureId))
        records.set(creation.fixtureId, creation.descriptor);
    }
    const ordered = [...records.values()].sort(
      (left, right) => left.cutoffMs - right.cutoffMs || left.id.localeCompare(right.id),
    );
    const cursorFile = join(directory, 'worker-cursor.json');
    const cursor = existsSync(cursorFile)
      ? (JSON.parse(readFileSync(cursorFile, 'utf8')).cursor as unknown)
      : 0;
    if (typeof cursor !== 'number' || !Number.isSafeInteger(cursor) || cursor < 0)
      throw Error('Invalid durable worker cursor');
    const result = await workerCycle(ordered, cursor, {
      now: Date.now,
      async execute(action, record) {
        await runOperator([
          action,
          record.fixtureId,
          ...(action === 'reconcile' ? [] : ['--broadcast']),
        ]);
      },
      async inspect(record) {
        for (const action of ['close', 'report'] as const) {
          const operation = journal.load(`${action}-${record.fixtureId}`);
          if (!operation) continue;
          const state = await reconcileOperation(client, operation);
          if (['pending', 'uncertain', 'rejected'].includes(state.status))
            return {
              exists: true,
              closed: false,
              eligibleReport: false,
              blocked: `Existing ${action} transaction is ${state.status}; its exact hash needs reconciliation.`,
            };
          if (
            action === 'report' &&
            state.status === 'ready-to-rebroadcast' &&
            Date.now() >= record.terms.deadlineMs
          )
            return {
              exists: true,
              closed: false,
              eligibleReport: false,
              blocked:
                'An unconfirmed signed report crossed the deadline. Reconcile it before choosing the timeout path.',
            };
        }
        const state = await loadOperatorMarket(client, record);
        const data = state.market?.cell.outputData;
        const timestamp = state.market ? Number(state.market.header.timestamp) : 0;
        const eligibleReport =
          !!data &&
          /^0x00010[012]$/.test(data) &&
          timestamp >= record.cutoffMs &&
          timestamp < record.terms.deadlineMs;
        return { exists: !!state.market, closed: state.closed, eligibleReport };
      },
    });
    const temporary = `${cursorFile}.${randomUUID()}.next`;
    writeExclusiveJson(temporary, { cursor: result.cursor, completedAt: new Date().toISOString() });
    renameSync(temporary, cursorFile);
    console.log(JSON.stringify({ worker: 'direct-testnet', ...result }, null, 2));
  });
}

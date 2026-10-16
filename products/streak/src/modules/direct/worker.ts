import * as ccc from '@ckb-ccc/core';
import { existsSync, readFileSync, readdirSync, renameSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { runOperator, boundedJson, operatorFundingBarrier } from './cli';
import { OperatorJournal, reconcileOperation, operationKey, OPERATION_FILE } from './journal';
import { loadOperatorMarket, MARKET_RESERVE_SHANNONS } from './operator';
import { canonicalSponsorConflicts } from './sponsor-journal';
import {
  ProvisionQueue,
  parseProvisionCatalogue,
  provisionCycle,
  provisioningCatalogueUrl,
} from './provision';
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
  if (records.length > 512 || !Number.isSafeInteger(cursor) || cursor < 0)
    throw Error('Worker catalogue or cursor exceeds its bound');
  // Future markets do not consume RPC/provider work or delay due lifecycle actions.
  const due = records
    .filter((record) => record.cutoffMs <= ports.now())
    .sort((a, b) => a.terms.deadlineMs - b.terms.deadlineMs || a.id.localeCompare(b.id));
  if (!due.length)
    return {
      cursor: 0,
      results: records
        .slice(0, 4)
        .map((record) => ({ fixtureId: record.fixtureId, action: 'wait', status: 'waiting' })),
    };
  const results: WorkerResult[] = [];
  for (let offset = 0; offset < Math.min(4, due.length); offset++) {
    const record = due[(cursor + offset) % due.length];
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
    cursor: due.length ? (cursor + Math.min(4, due.length)) % due.length : 0,
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
  if (resolve(directory) === resolve(registryDirectory))
    throw Error('Keep the signed journal separate from the public registry');
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
    const catalogueUrl = process.env.STREAK_DIRECT_CATALOGUE_URL;
    const progressDirectory = process.env.STREAK_DIRECT_PROGRESS_DIR;
    if (!!catalogueUrl !== !!progressDirectory)
      throw Error(
        'Configure both the local fixture catalogue and separate public progress directory',
      );
    if (
      progressDirectory &&
      (!isAbsolute(progressDirectory) ||
        [resolve(directory), resolve(registryDirectory)].includes(resolve(progressDirectory)))
    )
      throw Error('Use a separate absolute public progress directory');
    // Demand creation is the product default. Historical bulk creation requires an
    // explicit operator mode; its signed transactions and lifecycle remain intact.
    const queue =
      catalogueUrl && process.env.STREAK_DIRECT_PROVISION_MODE === 'bulk-v2'
        ? new ProvisionQueue(join(directory, 'provision-v2'))
        : undefined;
    let catalogueReady = false;
    if (queue) {
      try {
        const payload = await boundedJson(provisioningCatalogueUrl(catalogueUrl!), {
          headers: { accept: 'application/json' },
        });
        queue.synchronize(parseProvisionCatalogue(payload, Date.now()), Date.now());
        catalogueReady = true;
      } catch {
        queue.status = 'waiting-catalogue';
        // A missing catalogue pauses new funding, never existing refunds or results.
      }
    }
    const records = new Map(registry.all().map((record) => [record.id, record]));
    const conflictState = await canonicalSponsorConflicts(client, journal.directory);
    for (const [id, record] of records)
      if (conflictState.resolved.has(record.creationTxHash)) records.delete(id);
    const files = readdirSync(directory).filter(
      (file) => OPERATION_FILE.test(file) && file.startsWith('create-'),
    );
    if (files.length > 1536)
      throw Error('Worker creation journal exceeds its reviewed operation bound');
    for (const file of files) {
      const creation = journal.load(file.slice(0, -5));
      if (
        creation &&
        !conflictState.resolved.has(creation.transactionHash) &&
        !records.has(creation.descriptor.id)
      )
        records.set(creation.descriptor.id, creation.descriptor);
    }
    const checkpointFile = join(directory, 'worker-checkpoints.json');
    const checkpoints: Record<string, { observedAtMs: number; closed: boolean }> = {};
    if (existsSync(checkpointFile)) {
      const saved = JSON.parse(readFileSync(checkpointFile, 'utf8')) as unknown;
      if (
        !saved ||
        typeof saved !== 'object' ||
        Array.isArray(saved) ||
        Object.keys(saved).length > 512
      )
        throw Error('Invalid worker checkpoint bounds');
      for (const [id, raw] of Object.entries(saved)) {
        if (
          !raw ||
          typeof raw !== 'object' ||
          typeof raw.observedAtMs !== 'number' ||
          !Number.isSafeInteger(raw.observedAtMs) ||
          typeof raw.closed !== 'boolean'
        )
          throw Error('Invalid worker checkpoint');
        checkpoints[id] = { observedAtMs: raw.observedAtMs, closed: raw.closed };
      }
    }
    const ordered = [...records.values()]
      .filter(
        (record) =>
          !checkpoints[record.id]?.closed ||
          Date.now() - checkpoints[record.id].observedAtMs >= 900_000,
      )
      .sort((left, right) => left.cutoffMs - right.cutoffMs || left.id.localeCompare(right.id));
    const cursorFile = join(directory, 'worker-cursor.json');
    const cursor = existsSync(cursorFile)
      ? (JSON.parse(readFileSync(cursorFile, 'utf8')).cursor as unknown)
      : 0;
    if (typeof cursor !== 'number' || !Number.isSafeInteger(cursor) || cursor < 0)
      throw Error('Invalid durable worker cursor');
    const result = await workerCycle(ordered, cursor, {
      now: Date.now,
      async execute(action, record) {
        await runOperator(
          [action, record.fixtureId, ...(action === 'reconcile' ? [] : ['--broadcast'])],
          { record, quiet: true },
        );
      },
      async inspect(record) {
        for (const action of ['close', 'report'] as const) {
          const operation = journal.load(
            operationKey(action, record.fixtureId, record.type.codeHash, record.creationTxHash),
          );
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
        checkpoints[record.id] = { observedAtMs: Date.now(), closed: state.closed };
        return { exists: !!state.market, closed: state.closed, eligibleReport };
      },
    });
    const temporary = `${cursorFile}.${randomUUID()}.next`;
    writeExclusiveJson(temporary, { cursor: result.cursor, completedAt: new Date().toISOString() });
    renameSync(temporary, cursorFile);
    const checkpointTemporary = `${checkpointFile}.${randomUUID()}.next`;
    writeExclusiveJson(checkpointTemporary, checkpoints);
    renameSync(checkpointTemporary, checkpointFile);
    if (queue && catalogueReady) {
      try {
        await provisionCycle(queue, {
          now: Date.now,
          registered: () => registry.all(),
          barrier: () => operatorFundingBarrier(client, journal, registry),
          async available() {
            const signer = new ccc.SignerCkbPrivateKey(
              client,
              process.env.STREAK_DIRECT_PRIVATE_KEY!,
            );
            const lock = (await signer.getRecommendedAddressObj()).script;
            const page = await client.findCellsPagedNoCache(
              {
                script: lock,
                scriptType: 'lock',
                scriptSearchMode: 'exact',
                withData: true,
                filter: { scriptLenRange: [0, 1], outputDataLenRange: [0, 1] },
              },
              'desc',
              64,
            );
            return page.cells
              .filter(
                (cell) =>
                  !cell.cellOutput.type &&
                  cell.outputData === '0x' &&
                  cell.cellOutput.lock.eq(lock),
              )
              .reduce((sum, cell) => sum + cell.cellOutput.capacity, 0n);
          },
          create: (entry) =>
            runOperator(['create', entry.fixtureId, '--broadcast'], {
              expectedFixture: entry,
              quiet: true,
            }),
          resume: (entry) =>
            runOperator(['create', entry.fixtureId, '--broadcast'], {
              expectedFixture: entry,
              quiet: true,
            }),
        });
      } catch {
        queue.status = 'blocked-review';
      }
    }
    const provisioning =
      queue && progressDirectory
        ? queue.publish(progressDirectory, MARKET_RESERVE_SHANNONS, Date.now())
        : undefined;
    console.log(
      JSON.stringify(
        {
          worker: 'direct-testnet',
          ...result,
          ...(provisioning
            ? {
                provisioning: {
                  status: provisioning.status,
                  counts: provisioning.counts,
                  remainingReserveShannons: provisioning.remainingReserveShannons,
                  estimatedShortfallShannons: provisioning.estimatedShortfallShannons,
                },
              }
            : {}),
        },
        null,
        2,
      ),
    );
  });
}

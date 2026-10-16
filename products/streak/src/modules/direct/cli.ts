import * as ccc from '@ckb-ccc/core';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import {
  DirectRegistry,
  object,
  PROVIDER_ORIGIN,
  PUBLIC_DIRECT_CONFIG,
  type DirectMarketRecord,
  writeExclusiveJson,
} from './registry';
import { buildClose, buildCreate, buildReport, loadOperatorMarket } from './operator';
import {
  broadcastOperation,
  OperatorJournal,
  reconcileOperation,
  type OperatorAction,
  type SignedOperation,
} from './journal';
import {
  confirmFootballEvidence,
  parseFootballObservation,
  validateFootballEvidence,
  validateScheduledFixture,
  type ConfirmedFootballEvidence,
} from './oracle';

async function boundedJson(url: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw Error(`Remote read failed with HTTP ${response.status}`);
  const reader = response.body?.getReader();
  if (!reader) throw Error('Remote response is empty');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 2_000_000) throw Error('Remote response exceeds two megabytes');
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel();
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function fixturePayload(providerFixtureId: string): Promise<unknown> {
  const key = process.env.API_SPORTS_KEY;
  if (!key)
    throw Error('Set API_SPORTS_KEY explicitly for this operator process; no env file is loaded');
  return boundedJson(`${PROVIDER_ORIGIN}/fixtures?id=${providerFixtureId}`, {
    headers: { 'x-apisports-key': key, accept: 'application/json' },
  });
}

async function verifyDeployment(client: ccc.Client): Promise<void> {
  const envelope = object(
    await boundedJson(PUBLIC_DIRECT_CONFIG.rpc, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'get_blockchain_info', params: [] }),
    }),
    'chain identity',
  );
  if (object(envelope.result, 'chain identity result').chain !== 'ckb_testnet')
    throw Error('Operator refuses a network other than CKB testnet');
  for (const [index, expected] of [
    PUBLIC_DIRECT_CONFIG.protocolHash,
    PUBLIC_DIRECT_CONFIG.guardHash,
  ].entries()) {
    const cell = await client.getCellLiveNoCache(
      PUBLIC_DIRECT_CONFIG.codeDeps[index].outPoint,
      true,
      false,
    );
    if (!cell || ccc.hashCkb(cell.outputData) !== expected)
      throw Error('Pinned deployed code is missing or has the wrong hash');
  }
}

async function confirmedEvidence(
  record: DirectMarketRecord,
  journal: OperatorJournal,
): Promise<ConfirmedFootballEvidence | undefined> {
  const current = validateFootballEvidence(
    record,
    await fixturePayload(record.terms.providerFixtureId),
    Date.now(),
  );
  const folder = join(journal.directory, `${record.fixtureId}.football`);
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  const files = readdirSync(folder)
    .filter((file) => /^\d+-[0-9a-f]{64}\.json$/.test(file))
    .sort()
    .reverse();
  if (files.length >= 256)
    throw Error(
      'Football observation limit reached; review and archive observations before proceeding',
    );
  let result: ConfirmedFootballEvidence | undefined;
  for (const file of files.slice(0, 16)) {
    const path = join(folder, file);
    if (statSync(path).size > 4096) throw Error('Football observation exceeds its size limit');
    const previous = parseFootballObservation(record, JSON.parse(readFileSync(path, 'utf8')));
    if (
      previous.digest === current.digest &&
      previous.observedAtMs <= current.observedAtMs - 30_000
    ) {
      result = confirmFootballEvidence(previous, current, Date.now());
      break;
    }
  }
  const file = join(folder, `${current.observedAtMs}-${current.digest.slice(2)}.json`);
  if (!existsSync(file)) writeExclusiveJson(file, current);
  return result;
}

async function reconcileAndPublish(
  client: ccc.Client,
  journal: OperatorJournal,
  registry: DirectRegistry,
  operation: SignedOperation,
) {
  const state = await reconcileOperation(client, operation);
  journal.record(operation.operationId, state);
  if (
    operation.action === 'create' &&
    state.status === 'committed' &&
    (state.confirmations ?? 0) >= 4
  )
    registry.add(operation.descriptor);
  return {
    ...state,
    explorer: `https://pudge.explorer.nervos.org/transaction/${operation.transactionHash}`,
  };
}

/** Explicit CLI only. The API never imports this module or reads signing material. */
export async function runOperator(arguments_: string[]): Promise<void> {
  if (process.env.NODE_ENV === 'test')
    throw Error(
      'The public testnet operator CLI is forbidden in routine tests; use injected local builders',
    );
  const [command, rawId, ...options] = arguments_;
  const allowed = ['create', 'observe', 'report', 'settle', 'void', 'status', 'reconcile'];
  if (
    !allowed.includes(command) ||
    !/^(?:api-football-)?[1-9][0-9]{0,14}$/.test(rawId ?? '') ||
    options.some((option) => option !== '--broadcast') ||
    options.length > 1
  )
    throw Error(
      'Usage: direct-operator.cjs create|observe|report|settle|void|status|reconcile FIXTURE_ID [--broadcast]',
    );
  const providerFixtureId = rawId.replace(/^api-football-/, '');
  const fixtureId = `api-football-${providerFixtureId}`;
  const shouldBroadcast = options.includes('--broadcast');
  if (shouldBroadcast && ['observe', 'status', 'reconcile'].includes(command))
    throw Error('This command is read-only');
  const stateDir = process.env.STREAK_DIRECT_OPERATOR_DIR;
  const registryDir = process.env.STREAK_DIRECT_REGISTRY_DIR;
  if (!stateDir || !registryDir || !isAbsolute(stateDir) || !isAbsolute(registryDir))
    throw Error(
      'Set absolute STREAK_DIRECT_OPERATOR_DIR and STREAK_DIRECT_REGISTRY_DIR on durable operator storage',
    );
  if (resolve(stateDir) === resolve(registryDir))
    throw Error('Keep signed operator state separate from the public registry directory');
  if (process.env.NODE_ENV === 'production' && process.env.STREAK_DIRECT_DURABLE_STATE_ACK !== '1')
    throw Error(
      'Hosted operation requires durable-volume confirmation through STREAK_DIRECT_DURABLE_STATE_ACK=1; ephemeral storage is unsupported',
    );
  const registry = new DirectRegistry(registryDir);
  const journal = new OperatorJournal(stateDir);
  const client = new ccc.ClientPublicTestnet({
    url: PUBLIC_DIRECT_CONFIG.rpc,
    fallbacks: [],
    timeout: 15_000,
    maxConcurrent: 2,
  });
  await verifyDeployment(client);
  const task = async () => {
    let record = registry.get(fixtureId) ?? journal.load(`create-${fixtureId}`)?.descriptor;
    if (command === 'reconcile') {
      const states = [];
      for (const action of ['create', 'report', 'close'] as const) {
        const entry = journal.load(`${action}-${fixtureId}`);
        if (entry)
          states.push({
            operation: entry.operationId,
            ...(await reconcileAndPublish(client, journal, registry, entry)),
          });
      }
      console.log(JSON.stringify({ fixtureId, states }, null, 2));
      return;
    }
    if (command === 'status') {
      if (!record) throw Error('This fixture has no registered or prepared direct market');
      const state = await loadOperatorMarket(client, record);
      console.log(
        JSON.stringify(
          {
            fixtureId,
            closed: state.closed,
            controlData: state.market?.cell.outputData,
            controlTimestamp: state.market ? Number(state.market.header.timestamp) : undefined,
            shardRecords: state.shards.map((entry) => ({
              id: parseInt(entry.cell.outputData.slice(4, 6), 16),
              accepted: parseInt(entry.cell.outputData.slice(6, 8), 16),
              pending: parseInt(entry.cell.outputData.slice(8, 10), 16),
            })),
            terms: record.terms,
            fixtureBinding: PUBLIC_DIRECT_CONFIG.fixtureBinding,
          },
          null,
          2,
        ),
      );
      return;
    }
    if (command === 'observe') {
      if (!record) throw Error('Create this fixture market first');
      const evidence = await confirmedEvidence(record, journal);
      console.log(
        JSON.stringify(
          {
            fixtureId,
            confirmed: !!evidence,
            detail: evidence
              ? 'Matching terminal regulation-time observations are ready for reporting.'
              : 'Observation saved. Read the provider again after at least 30 seconds.',
          },
          null,
          2,
        ),
      );
      return;
    }
    const action: OperatorAction =
      command === 'create' ? 'create' : command === 'report' ? 'report' : 'close';
    let operation = journal.load(`${action}-${fixtureId}`);
    let freshEvidence: ConfirmedFootballEvidence | undefined;
    if (!operation) {
      if (action === 'create' && record)
        throw Error('Fixture is already mapped to an immutable market');
      const key = process.env.STREAK_DIRECT_PRIVATE_KEY;
      if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key))
        throw Error(
          'Set STREAK_DIRECT_PRIVATE_KEY explicitly for this isolated operator process; no wallet key file is loaded',
        );
      const signer = new ccc.SignerCkbPrivateKey(client, key);
      let tx: ccc.Transaction;
      if (action === 'create') {
        const fixture = validateScheduledFixture(
          await fixturePayload(providerFixtureId),
          providerFixtureId,
          Date.now(),
        );
        const prepared = await buildCreate(client, signer, fixture);
        record = prepared.record;
        tx = prepared.tx;
      } else {
        if (!record) throw Error('Create and reconcile this fixture market first');
        if (action === 'report') {
          const evidence = await confirmedEvidence(record, journal);
          if (!evidence)
            throw Error(
              'First result observation saved. Run report again after at least 30 seconds.',
            );
          freshEvidence = evidence;
          tx = await buildReport(client, signer, record, evidence);
        } else
          tx = await buildClose(client, signer, record, command === 'void' ? 'void' : 'settle');
      }
      const signed = await signer.signTransaction(tx);
      if (action === 'create' && signed.hash() !== record!.creationTxHash)
        throw Error('Signing changed the reviewed market transaction');
      operation = journal.persist(action, record!, signed);
    }
    if (shouldBroadcast && action === 'report') {
      // Restarted signed reports must still agree with fresh trusted football evidence.
      const evidence =
        freshEvidence && Date.now() - freshEvidence.observedAtMs <= 60_000
          ? freshEvidence
          : await confirmedEvidence(operation.descriptor, journal);
      const data = ccc.Transaction.fromBytes(operation.signedTransaction).outputsData[0];
      if (!evidence || data !== `0x0001${evidence.outcome.toString(16).padStart(2, '0')}`)
        throw Error('The prepared report no longer matches fresh confirmed football evidence');
    }
    const observed = shouldBroadcast
      ? await broadcastOperation(client, journal, operation)
      : await reconcileOperation(client, operation);
    journal.record(operation.operationId, observed);
    const status = await reconcileAndPublish(client, journal, registry, operation);
    console.log(
      JSON.stringify(
        {
          operation: operation.operationId,
          ...status,
          instruction:
            'Rerun this command with --broadcast only to submit the exact persisted transaction. Use reconcile after confirmation. Unknown outcomes never rebuild automatically.',
          registered: !!registry.get(fixtureId),
        },
        null,
        2,
      ),
    );
  };
  if (['status', 'reconcile'].includes(command)) await task();
  else await journal.exclusive(task);
}

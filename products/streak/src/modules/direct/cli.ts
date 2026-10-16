import * as ccc from '@ckb-ccc/core';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import {
  DirectRegistry,
  object,
  PROVIDER_ORIGIN,
  PUBLIC_DIRECT_CONFIG,
  V3_DIRECT_CONFIG,
  LEGACY_DIRECT_CONFIG,
  protocolConfigFor,
  type DirectProtocolConfig,
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
  type Reconciliation,
  operationKey,
  OPERATION_FILE,
} from './journal';
import { verifyProvisionFixture, type ProvisionFixture, type ProvisionBarrier } from './provision';
import {
  assertSponsorInputsAvailable,
  sponsorFundingBlocked,
  canonicalSponsorConflicts,
  cancelUnsignedSponsorOffers,
} from './sponsor-journal';
import {
  confirmFootballEvidence,
  parseFootballObservation,
  validateFootballEvidence,
  validateScheduledFixture,
  type ConfirmedFootballEvidence,
} from './oracle';

export async function boundedJson(url: string, init: RequestInit): Promise<unknown> {
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

async function verifyDeployment(client: ccc.Client, config: DirectProtocolConfig): Promise<void> {
  if (config.codeDeps.length !== 2)
    throw Error(
      'Current protocol deployment is not funded and pinned yet. Automatic creation remains queued.',
    );
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
  for (const [index, expected] of [config.protocolHash, config.guardHash].entries()) {
    const cell = await client.getCellLiveNoCache(config.codeDeps[index].outPoint, true, false);
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
  return recordReconciliation(client, journal, registry, operation, state);
}

async function recordReconciliation(
  client: ccc.Client,
  journal: OperatorJournal,
  registry: DirectRegistry,
  operation: SignedOperation,
  state: Reconciliation,
) {
  journal.record(operation.operationId, state);
  if (
    operation.action === 'create' &&
    operation.descriptor.type.codeHash !== LEGACY_DIRECT_CONFIG.protocolHash &&
    state.status === 'committed' &&
    (state.confirmations ?? 0) >= 4
  )
    await registry.publishCanonical(operation.descriptor, client);
  return {
    ...state,
    explorer: `https://pudge.explorer.nervos.org/transaction/${operation.transactionHash}`,
  };
}

export interface OperatorDeployment {
  protocolHash: string;
  transactionHash: string;
  signedTransaction: string;
  createdAtMs: number;
}
/** A deployment spends from the same wallet but is not a fabricated football market. */
export function loadOperatorDeployment(
  journal: OperatorJournal,
  generation: 'v2' | 'v3' = 'v2',
): OperatorDeployment | undefined {
  const path = join(journal.directory, `deployment-${generation}.json`);
  if (!existsSync(path)) return undefined;
  if (statSync(path).size > 2_100_000)
    throw Error('Operator deployment journal exceeds its byte bound');
  const row = object(JSON.parse(readFileSync(path, 'utf8')), 'operator deployment');
  if (
    row.protocolHash !==
      (generation === 'v3'
        ? V3_DIRECT_CONFIG.protocolHash
        : (journal.config?.protocolHash ?? PUBLIC_DIRECT_CONFIG.protocolHash)) ||
    typeof row.transactionHash !== 'string' ||
    !/^0x[0-9a-f]{64}$/.test(row.transactionHash) ||
    typeof row.signedTransaction !== 'string' ||
    !/^0x(?:[0-9a-f]{2})+$/.test(row.signedTransaction) ||
    typeof row.createdAtMs !== 'number' ||
    !Number.isSafeInteger(row.createdAtMs) ||
    row.createdAtMs <= 0
  )
    throw Error('Invalid pinned operator deployment journal');
  const tx = ccc.Transaction.fromBytes(row.signedTransaction);
  if (
    tx.hash() !== row.transactionHash ||
    tx.inputs.length > 64 ||
    !tx.inputs.length ||
    tx.outputs.length > 64 ||
    tx.toBytes().length > 1_000_000 ||
    !tx.witnesses.length ||
    !tx.outputsData.some((data) => ccc.hashCkb(data) === row.protocolHash)
  )
    throw Error('Operator deployment bytes do not match the pinned protocol and hash');
  return {
    protocolHash: row.protocolHash,
    transactionHash: row.transactionHash,
    signedTransaction: row.signedTransaction,
    createdAtMs: row.createdAtMs,
  };
}

/** Reconcile unsettled jobs before selecting the operator's reusable funding cell. */
export async function operatorFundingBarrier(
  client: ccc.Client,
  journal: OperatorJournal,
  registry: DirectRegistry,
): Promise<ProvisionBarrier> {
  const conflicts = await canonicalSponsorConflicts(client, journal.directory);
  freshResolvedSponsors.set(journal, { observedAt: Date.now(), hashes: conflicts.resolved });
  if (conflicts.uncertain) return { clear: false, pending: [] };
  if (sponsorFundingBlocked(journal.directory, Date.now(), conflicts.resolved))
    return { clear: false, pending: [] };
  for (const deployment of [
    loadOperatorDeployment(journal),
    loadOperatorDeployment(journal, 'v3'),
  ].filter((value): value is OperatorDeployment => !!value)) {
    const state = await reconcileOperation(client, deployment);
    if (state.status !== 'committed' || (state.confirmations ?? 0) < 4)
      return { clear: false, pending: [] };
  }
  const files = readdirSync(journal.directory).filter((file) => OPERATION_FILE.test(file));
  if (files.length > 1536) throw Error('Operator journal exceeds both generation bounds');
  const operations: SignedOperation[] = [];
  const unfinished = new Set<string>();
  const referencedTransactions = new Set<string>();
  for (const file of files) {
    const operation = journal.load(file.slice(0, -5))!;
    if (
      conflicts.resolved.has(operation.transactionHash) ||
      conflicts.resolved.has(operation.descriptor.creationTxHash)
    ) {
      conflicts.resolved.add(operation.transactionHash);
      continue;
    }
    operations.push(operation);
    const tx = ccc.Transaction.fromBytes(operation.signedTransaction);
    for (const input of tx.inputs) referencedTransactions.add(input.previousOutput.txHash);
    const folder = join(journal.directory, `${operation.operationId}.events`);
    const observations = existsSync(folder) ? readdirSync(folder).sort() : [];
    if (observations.length > 256) throw Error('Operator observation history exceeds its bound');
    const last = observations.at(-1);
    let settled = false;
    if (last) {
      const path = join(folder, last);
      if (statSync(path).size > 4096) throw Error('Operator observation exceeds its byte bound');
      const state = object(JSON.parse(readFileSync(path, 'utf8')), 'operator funding observation');
      settled =
        state.transactionHash === operation.transactionHash &&
        state.status === 'committed' &&
        typeof state.confirmations === 'number' &&
        state.confirmations >= 4;
    }
    if (!settled) unfinished.add(operation.operationId);
  }
  if (new Set(operations.map((operation) => operation.transactionHash)).size !== operations.length)
    throw Error('Duplicate signed transaction identities in the operator journal');
  // A canonical child proves its referenced ancestors are canonical. Independent
  // wallet cells create separate leaves, regardless of wall-clock operation order.
  const anchors = operations.filter(
    (operation) => !referencedTransactions.has(operation.transactionHash),
  );
  if (operations.length && !anchors.length)
    throw Error('Operator dependency graph has no terminal anchor');
  const candidates = operations.filter(
    (operation) =>
      unfinished.has(operation.operationId) ||
      !referencedTransactions.has(operation.transactionHash),
  );
  candidates.sort(
    (a, b) => a.createdAtMs - b.createdAtMs || a.operationId.localeCompare(b.operationId),
  );
  const pending: ProvisionBarrier['pending'] = [];
  for (let offset = 0; offset < candidates.length; offset += 4) {
    const batch = candidates.slice(offset, offset + 4);
    const results = await Promise.allSettled(
      batch.map((operation) => reconcileOperation(client, operation)),
    );
    // Reads can overlap. Durable event and catalogue mutations remain serial.
    let failure: unknown;
    for (const [index, result] of results.entries()) {
      if (result.status === 'rejected') {
        failure ??= result.reason;
        continue;
      }
      const operation = batch[index];
      const state = await recordReconciliation(client, journal, registry, operation, result.value);
      if (state.status !== 'committed' || (state.confirmations ?? 0) < 4)
        pending.push({
          fixtureId: operation.fixtureId,
          action: operation.action,
          protocolHash: operation.descriptor.type.codeHash,
          transactionHash: operation.transactionHash,
          kickoffMs: operation.descriptor.cutoffMs,
          status: state.status,
          confirmations: state.confirmations,
        });
    }
    if (failure !== undefined) throw failure;
  }
  return { clear: pending.length === 0, pending };
}

const freshResolvedSponsors = new WeakMap<
  OperatorJournal,
  { observedAt: number; hashes: Set<string> }
>();

/** A reorg must never make an old signed input available for a different operator transaction. */
export function assertFreshOperatorInputs(
  journal: OperatorJournal,
  candidate: ccc.Transaction,
): void {
  const files = readdirSync(journal.directory).filter((file) => OPERATION_FILE.test(file));
  if (files.length > 1536) throw Error('Operator journal exceeds both generation bounds');
  const inputs = new Set(
    candidate.inputs.map((input) => `${input.previousOutput.txHash}:${input.previousOutput.index}`),
  );
  const released = freshResolvedSponsors.get(journal);
  assertSponsorInputsAvailable(
    journal.directory,
    candidate,
    Date.now(),
    released && Date.now() - released.observedAt <= 30_000 ? released.hashes : undefined,
  );
  const deployments = [
    loadOperatorDeployment(journal),
    loadOperatorDeployment(journal, 'v3'),
  ].filter((value): value is OperatorDeployment => !!value);
  if (
    deployments.some((deployment) =>
      ccc.Transaction.fromBytes(deployment.signedTransaction).inputs.some((input) =>
        inputs.has(`${input.previousOutput.txHash}:${input.previousOutput.index}`),
      ),
    )
  )
    throw Error(
      'A proposed input belongs to the immutable deployment transaction. Reconcile it without a replacement signature.',
    );
  for (const file of files) {
    const operation = journal.load(file.slice(0, -5))!;
    const resolved = freshResolvedSponsors.get(journal);
    if (
      resolved &&
      Date.now() - resolved.observedAt <= 30_000 &&
      resolved.hashes.has(operation.transactionHash)
    )
      continue;
    const previous = ccc.Transaction.fromBytes(operation.signedTransaction);
    if (
      previous.inputs.some((input) =>
        inputs.has(`${input.previousOutput.txHash}:${input.previousOutput.index}`),
      )
    )
      throw Error(
        'A proposed input already belongs to an immutable signed operation. Reconcile it without creating a replacement signature.',
      );
  }
}

/** Explicit CLI only. The API never imports this module or reads signing material. */
export async function runOperator(
  arguments_: string[],
  options_: {
    expectedFixture?: ProvisionFixture;
    record?: DirectMarketRecord;
    quiet?: boolean;
  } = {},
): Promise<void> {
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
  const task = async () => {
    let record =
      options_.record ??
      registry.get(fixtureId) ??
      journal.load(operationKey('create', fixtureId))?.descriptor;
    if (record && record.fixtureId !== fixtureId)
      throw Error('Requested operator record has another fixture');
    await verifyDeployment(client, record ? protocolConfigFor(record) : PUBLIC_DIRECT_CONFIG);
    const keyFor = (action: OperatorAction) =>
      operationKey(action, fixtureId, record?.type.codeHash, record?.creationTxHash);
    if (command === 'reconcile') {
      const states = [];
      for (const action of ['create', 'report', 'close'] as const) {
        const entry = journal.load(keyFor(action));
        if (entry)
          states.push({
            operation: entry.operationId,
            ...(await reconcileAndPublish(client, journal, registry, entry)),
          });
      }
      if (!options_.quiet) console.log(JSON.stringify({ fixtureId, states }, null, 2));
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
    let operation = journal.load(keyFor(action));
    let freshEvidence: ConfirmedFootballEvidence | undefined;
    if (!operation) {
      if (action === 'create' && record)
        throw Error('Fixture is already mapped to an immutable market');
      // Do not preempt a wallet review merely because a match kicked off. First
      // establish that a report or exit is actually ready, while holding the same
      // lease used by offer creation and owner-partial acceptance.
      if (action === 'report') {
        if (!record) throw Error('Create and reconcile this fixture market first');
        freshEvidence = await confirmedEvidence(record, journal);
        if (!freshEvidence)
          throw Error(
            'First result observation saved. Run report again after at least 30 seconds.',
          );
        cancelUnsignedSponsorOffers(journal.directory);
      } else if (action === 'close') {
        if (!record) throw Error('Create and reconcile this fixture market first');
        const state = await loadOperatorMarket(client, record);
        if (!state.market || state.closed || [0, 1, 2, 3].some((id) => !state.shards[id]))
          throw Error('Market closure state is unavailable');
        const data = state.market.cell.outputData,
          timestamp = Number(state.market.header.timestamp);
        const eligible =
          /^0x00010[012]$/.test(data) &&
          timestamp >= record.cutoffMs &&
          timestamp < record.terms.deadlineMs;
        if (
          (command === 'void' && eligible) ||
          (command === 'settle' && !eligible) ||
          (!eligible && Date.now() < record.terms.deadlineMs)
        )
          throw Error('Market is not ready for this closure action');
        cancelUnsignedSponsorOffers(journal.directory);
      }
      const barrier = await operatorFundingBarrier(client, journal, registry);
      if (!barrier.clear)
        throw Error(
          'A prior operator funding spend is unresolved or has fewer than four confirmations. Reconcile exact signed bytes before creating another transaction.',
        );
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
        if (options_.expectedFixture) verifyProvisionFixture(fixture, options_.expectedFixture);
        const prepared = await buildCreate(client, signer, fixture);
        record = prepared.record;
        tx = prepared.tx;
      } else {
        if (!record) throw Error('Create and reconcile this fixture market first');
        if (action === 'report') {
          const evidence = freshEvidence;
          if (!evidence)
            throw Error(
              'First result observation saved. Run report again after at least 30 seconds.',
            );
          freshEvidence = evidence;
          tx = await buildReport(client, signer, record, evidence);
        } else
          tx = await buildClose(client, signer, record, command === 'void' ? 'void' : 'settle');
      }
      assertFreshOperatorInputs(journal, tx);
      const signed = await signer.signTransaction(tx);
      if (action === 'create' && signed.hash() !== record!.creationTxHash)
        throw Error('Signing changed the reviewed market transaction');
      operation = journal.persist(action, record!, signed);
    }
    if (shouldBroadcast && action === 'create' && options_.expectedFixture) {
      if (
        operation.descriptor.type.codeHash !== PUBLIC_DIRECT_CONFIG.protocolHash ||
        operation.descriptor.cutoffMs !== options_.expectedFixture.kickoffMs
      )
        throw Error(
          'Prepared creation differs from the current provisioning generation or kickoff',
        );
      verifyProvisionFixture(
        validateScheduledFixture(
          await fixturePayload(providerFixtureId),
          providerFixtureId,
          Date.now(),
        ),
        options_.expectedFixture,
      );
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
    if (!options_.quiet)
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

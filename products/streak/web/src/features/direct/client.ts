import { ccc } from '@ckb-ccc/core';
import {
  assertSameTerms,
  bytes,
  checkCell,
  CKB,
  GUARD_HASH,
  hex,
  MANIFEST,
  protocolManifest,
  maxLockArgs,
  MIN_PRINCIPAL,
  parseDescriptor,
  parseManifest,
  point,
  pointKey,
  STORAGE,
  U64_MAX,
  VERSION,
} from './protocol.ts';
import type { Descriptor, Manifest, Outcome, Point } from './protocol.ts';
import { confirmedHeader, discoverMarket, loadMarket } from './discovery.ts';
import type { MarketSnapshot } from './discovery.ts';
import { IndexedJournal, MAX_TX_BYTES, parseRecord } from './journal.ts';
import type { Journal, JournalRecord } from './journal.ts';
import { reservationReleased } from './reservations.ts';

export type Identity = Readonly<{ address: string; ownerHash: string; scope: string }>;
export type Review = Readonly<{
  kind: 'deposit' | 'claim';
  descriptor: Descriptor;
  ownerHash: string;
  principalShannons: string;
  storageShannons: string;
  feeShannons: string;
  totalShannons: string;
  payoutShannons: string;
  shard: number | null;
  outcome: Outcome | null;
  expiresAt: number;
  hash: string;
}>;
export type Recovery = Readonly<{
  record: JournalRecord;
  status:
    | 'submitted'
    | 'committed'
    | 'confirmed'
    | 'unknown'
    | 'rejected'
    | 'conflict'
    | 'reorg'
    | 'resolved';
  confirmations: number;
  inputsLive: boolean | null;
  message: string;
}>;
type Intent = {
  tx: ccc.Transaction;
  owner: ccc.Script;
  inputs: readonly ccc.Cell[];
  control: Point | null;
  inputHeader: string | null;
  identity: Identity;
  preparedAt: number;
};
type Options = {
  now?: () => number;
  exclusive?: <T>(name: string, action: () => Promise<T>) => Promise<T>;
};
const intents = new WeakMap<Review, Intent>();
const MAX_FEE = CKB / 10n,
  REVIEW_MS = 60_000;
const devnetDependencies = new WeakMap<DirectClient, ccc.CellDep[]>();

async function browserExclusive<T>(name: string, action: () => Promise<T>): Promise<T> {
  if (!globalThis.navigator?.locks)
    throw Error(
      'This browser cannot coordinate safe wallet submissions. Use a browser with Web Locks support.',
    );
  return navigator.locks.request(name, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
    if (!lock)
      throw Error('Another Streak tab is using this wallet. Finish that submission first.');
    return action();
  });
}
function bounded(tx: ccc.Transaction): void {
  if (
    tx.inputs.length < 2 ||
    tx.inputs.length > 64 ||
    tx.outputs.length < 1 ||
    tx.outputs.length > 3 ||
    tx.toBytes().length > MAX_TX_BYTES ||
    tx.cellDeps.length > 16 ||
    new Set(tx.inputs.map((i) => pointKey(i.previousOutput))).size !== tx.inputs.length
  )
    throw Error('Transaction exceeds the reviewed one-position limits.');
}
function sameCell(a: ccc.Cell, b: ccc.Cell): boolean {
  return a.cellOutput.toHex() === b.cellOutput.toHex() && a.outputData === b.outputData;
}
function exactFee(tx: ccc.Transaction, inputs: readonly ccc.Cell[]): bigint {
  const fee =
    inputs.reduce((sum, cell) => sum + cell.cellOutput.capacity, 0n) -
    tx.outputs.reduce((sum, output) => sum + output.capacity, 0n);
  if (fee < 0n || fee > MAX_FEE)
    throw Error('The calculated network fee is outside the reviewed limit.');
  return fee;
}
export function assertSignedIntent(unsigned: ccc.Transaction, signed: ccc.Transaction): void {
  bounded(signed);
  if (unsigned.hash() !== signed.hash())
    throw Error(
      'The wallet changed the reviewed transaction. Nothing was broadcast. Review again.',
    );
}

export class DirectClient {
  readonly signer: ccc.Signer;
  readonly manifest: Manifest;
  private readonly journal: Journal;
  private readonly scopeId: string;
  private readonly now: () => number;
  private readonly exclusive: Options['exclusive'];
  private expectedOwner: string | null = null;
  private nextShard = 0;
  constructor(
    signer: ccc.Signer,
    manifest: Manifest,
    scopeId: string,
    journal: Journal = new IndexedJournal(),
    options: Options = {},
  ) {
    this.signer = signer;
    this.manifest = parseManifest(manifest);
    this.scopeId = scopeId;
    if (!scopeId || scopeId.length > 180) throw Error('A stable wallet scope is required.');
    this.journal = journal;
    this.now = options.now ?? Date.now;
    this.exclusive = options.exclusive ?? browserExclusive;
  }
  private deps(descriptor: Descriptor): ccc.CellDep[] {
    const deps =
      devnetDependencies.get(this) ??
      protocolManifest(descriptor.type.codeHash).codeDeps.map((d) => ccc.CellDep.from(d));
    if (deps.length !== 2)
      throw Error(
        'The compatible contract deployment is awaiting confirmation. Your picks are saved.',
      );
    return deps;
  }
  async identity(): Promise<Identity> {
    const client = this.signer.client;
    if (client.addressPrefix !== 'ckt') throw Error('Connect a CKB testnet wallet.');
    if (
      !devnetDependencies.has(this) &&
      !['https://testnet.ckb.dev/', 'wss://testnet.ckb.dev/ws'].includes(client.url)
    )
      throw Error('This wallet is not connected to the pinned CKB testnet service.');
    const address = await ccc.Address.fromString(await this.signer.getRecommendedAddress(), client),
      ownerHash = address.script.hash();
    if (this.expectedOwner && this.expectedOwner !== ownerHash)
      throw Error('The connected wallet changed. Reconnect and review again.');
    this.expectedOwner = ownerHash;
    return Object.freeze({
      address: address.toString(),
      ownerHash,
      scope: `${devnetDependencies.has(this) ? 'devnet' : VERSION}:${ownerHash}:${this.scopeId}`,
    });
  }
  async balance(): Promise<bigint> {
    const identity = await this.identity(),
      address = await ccc.Address.fromString(identity.address, this.signer.client);
    return this.signer.client.getBalanceSingle(address.script);
  }
  async history(): Promise<JournalRecord[]> {
    return this.journal.list((await this.identity()).scope);
  }
  async discover(descriptor: Descriptor): Promise<MarketSnapshot> {
    const identity = await this.identity();
    return discoverMarket(
      this.signer.client,
      await parseDescriptor(descriptor),
      identity.ownerHash,
    );
  }
  private async outstanding(
    identity: Identity,
    kind: Review['kind'],
    descriptor: Descriptor,
    claim?: Point,
  ): Promise<Pick<JournalRecord, 'inputs'>[]> {
    const pending: Pick<JournalRecord, 'inputs'>[] = [];
    for (const record of (await this.journal.otherReservations?.(identity.scope)) ?? []) {
      if (await reservationReleased(this.signer.client, record)) continue;
      pending.push(record);
      if (
        kind === 'deposit' &&
        (record.fixtureIds ?? [record.fixtureId]).includes(descriptor.fixtureId)
      )
        throw Error(
          'This fixture already has a signed sponsored prediction. Resume its original transaction.',
        );
    }
    for (const record of await this.journal.list(identity.scope)) {
      const recovery = await this.recover(record);
      // A rejected/absent node response is not proof that no other node has the
      // signed transaction. Resolve its exact hash instead of authorizing a replacement.
      if (recovery.status === 'confirmed' || recovery.status === 'resolved') continue;
      pending.push(recovery.record);
      if (
        (kind === 'deposit' &&
          record.kind === 'deposit' &&
          record.descriptor.type.args === descriptor.type.args) ||
        (kind === 'claim' && claim && record.inputs.some((p) => pointKey(p) === pointKey(claim)))
      )
        throw Error(
          'This position already has a signed transaction awaiting reconciliation. Use its original transaction recovery.',
        );
    }
    return pending;
  }
  private async fund(
    tx: ccc.Transaction,
    owner: ccc.Script,
    protocolCapacity: bigint,
    pending: readonly Pick<JournalRecord, 'inputs'>[],
  ): Promise<void> {
    const reserved = new Set(pending.flatMap((r) => r.inputs.map(pointKey)));
    // Reserve enough excess for an ordinary change cell plus the maximum fee.
    // It stays in the wallet and is not added to the reviewed payment total.
    const changeCapacity =
      BigInt(ccc.CellOutput.from({ lock: owner, capacity: 0 }).occupiedSize) * CKB;
    const target =
      tx.outputs.reduce((sum, output) => sum + output.capacity, 0n) + changeCapacity + MAX_FEE;
    let capacity = protocolCapacity,
      inspected = 0;
    for await (const candidate of this.signer.findCells(
      { scriptLenRange: [0, 1], outputDataLenRange: [0, 1] },
      true,
      'asc',
      32,
    )) {
      if (++inspected > 256 || tx.inputs.length >= 64)
        throw Error(
          'Wallet funding exceeded the bounded cell scan. Consolidate ordinary testnet CKB cells first.',
        );
      if (
        reserved.has(pointKey(candidate.outPoint)) ||
        !candidate.cellOutput.lock.eq(owner) ||
        candidate.cellOutput.type ||
        candidate.outputData !== '0x' ||
        tx.inputs.some((input) => input.previousOutput.eq(candidate.outPoint))
      )
        continue;
      const cell = await this.signer.client.getCellLiveNoCache(candidate.outPoint, true, true);
      if (!cell || !sameCell(cell, candidate)) continue;
      tx.addInput(cell);
      capacity += cell.cellOutput.capacity;
      if (capacity >= target) break;
    }
    if (capacity < target)
      throw Error(
        'Insufficient unreserved plain testnet CKB. Keep a separate fee and change cell; unresolved transactions keep their inputs reserved.',
      );
    await tx.completeFeeBy(this.signer, 1000n, undefined, { shouldAddInputs: false });
  }
  private async inputs(
    tx: ccc.Transaction,
    owner: ccc.Script,
    descriptor: Descriptor,
  ): Promise<ccc.Cell[]> {
    bounded(tx);
    const cells: ccc.Cell[] = [];
    for (let i = 0; i < tx.inputs.length; i++) {
      if (tx.inputs[i].since !== 0n) throw Error('Unexpected transaction time constraint.');
      const cell = await this.signer.client.getCellLiveNoCache(
        tx.inputs[i].previousOutput,
        true,
        true,
      );
      if (!cell) throw Error('A transaction input was already spent. Refresh and review again.');
      if (i === 0) checkCell(cell, descriptor);
      else if (!cell.cellOutput.lock.eq(owner) || cell.cellOutput.type || cell.outputData !== '0x')
        throw Error('Wallet funding must use plain capacity owned by the reviewed wallet.');
      cells.push(cell);
    }
    for (let i = 1; i < tx.outputs.length; i++) {
      if (!tx.outputs[i].lock.eq(owner) || tx.outputs[i].type || tx.outputsData[i] !== '0x')
        throw Error('Change must return to the reviewed wallet.');
    }
    return cells;
  }
  private async entryTime(descriptor: Descriptor): Promise<void> {
    const tip = await this.signer.client.getTipHeader();
    if (!descriptor.entryEnabled)
      throw Error(
        descriptor.entryUnavailableReason ??
          'New entries are paused for this market. Claims remain available.',
      );
    if (
      this.now() + 30_000 >= descriptor.cutoffMs ||
      tip.timestamp + 30_000n >= BigInt(descriptor.cutoffMs)
    )
      throw Error('Betting is closed or too close to kickoff. No payment was submitted.');
  }
  async prepareDeposit(raw: Descriptor, outcome: Outcome, principal: bigint): Promise<Review> {
    const descriptor = await parseDescriptor(raw),
      identity = await this.identity();
    if (![0, 1, 2].includes(outcome) || principal < MIN_PRINCIPAL || principal > U64_MAX - STORAGE)
      throw Error('Choose an outcome and stake at least 100 testnet CKB.');
    const pending = await this.outstanding(identity, 'deposit', descriptor);
    await this.entryTime(descriptor);
    const owner = (await ccc.Address.fromString(identity.address, this.signer.client)).script;
    if (bytes(owner.args).length > maxLockArgs(descriptor.type.codeHash))
      throw Error(
        'This market uses an older or incompatible wallet format. Choose a market on the compatible contract. Your picks are saved.',
      );
    const cells = await loadMarket(this.signer.client, descriptor),
      control = cells.find((c) => c.state.kind === 'market' && c.state.phase === 0);
    if (!control) throw Error('The market is no longer open.');
    for (let offset = 0; offset < 4; offset++) {
      const shard = (this.nextShard + offset) % 4,
        selected = cells.find(
          (c) =>
            c.state.kind === 'shard' &&
            c.state.id === shard &&
            c.state.accepted.length + (c.state.pending ? 1 : 0) < 8,
        );
      if (!selected || selected.state.kind !== 'shard') continue;
      const header = await confirmedHeader(this.signer.client, selected.cell.outPoint.txHash);
      if (!header) continue;
      if (selected.state.pending && header.timestamp >= BigInt(descriptor.cutoffMs)) continue;
      const count = selected.state.accepted.length + (selected.state.pending ? 1 : 0),
        data = new Uint8Array(4 + 41 * (count + 1));
      data.set([1, shard, count, 1]);
      data.set(selected.state.bytes.slice(4), 4);
      data.set(bytes(identity.ownerHash), 4 + 41 * count);
      data[4 + 41 * count + 32] = outcome;
      new DataView(data.buffer).setBigUint64(4 + 41 * count + 33, principal, true);
      const capacity = selected.cell.cellOutput.capacity + principal + STORAGE;
      if (capacity > U64_MAX) throw Error('The market shard cannot hold this stake.');
      let tx = ccc.Transaction.from({
        inputs: [{ previousOutput: selected.cell.outPoint }],
        outputs: [{ ...selected.cell.cellOutput, capacity }],
        outputsData: [ccc.hexFrom(data)],
        cellDeps: [...this.deps(descriptor), { outPoint: control.cell.outPoint, depType: 'code' }],
        headerDeps: [header.hash],
      });
      await this.fund(tx, owner, selected.cell.cellOutput.capacity, pending);
      tx = await this.signer.prepareTransaction(tx);
      const inputCells = await this.inputs(tx, owner, descriptor);
      if (!inputCells[0].outPoint.eq(selected.cell.outPoint))
        throw Error('The wallet changed the selected deposit shard.');
      if (
        tx.outputs[0].capacity !== capacity ||
        !tx.outputs[0].lock.eq(selected.cell.cellOutput.lock) ||
        !tx.outputs[0].type?.eq(descriptor.type) ||
        tx.outputsData[0] !== ccc.hexFrom(data)
      )
        throw Error('The wallet changed the deposit output.');
      return this.review(
        tx,
        descriptor,
        identity,
        owner,
        inputCells,
        'deposit',
        principal,
        STORAGE,
        0n,
        shard,
        outcome,
        point(control.cell.outPoint),
        header.hash,
      );
    }
    throw Error(
      'All four deposit shards are full or awaiting confirmation. Refresh before retrying.',
    );
  }
  async prepareClaim(raw: Descriptor, outPoint: Point): Promise<Review> {
    const descriptor = await parseDescriptor(raw),
      identity = await this.identity();
    const pending = await this.outstanding(identity, 'claim', descriptor, outPoint);
    const cell = await this.signer.client.getCellLiveNoCache(outPoint, true, true);
    if (!cell) throw Error('This claim is spent or unavailable. Check its transaction history.');
    const state = checkCell(cell, descriptor),
      owner = (await ccc.Address.fromString(identity.address, this.signer.client)).script;
    if (state.kind !== 'claim' || state.ticket.owner !== identity.ownerHash)
      throw Error('Connect the wallet that owns this funded claim.');
    if (!(await confirmedHeader(this.signer.client, outPoint.txHash)))
      throw Error('The claim is awaiting canonical chain confirmation.');
    let tx = ccc.Transaction.from({
      inputs: [{ previousOutput: outPoint }],
      outputs: [{ capacity: cell.cellOutput.capacity, lock: owner }],
      outputsData: ['0x'],
      cellDeps: this.deps(descriptor),
    });
    await this.fund(tx, owner, cell.cellOutput.capacity, pending);
    tx = await this.signer.prepareTransaction(tx);
    const inputCells = await this.inputs(tx, owner, descriptor);
    if (!inputCells[0].outPoint.eq(outPoint)) throw Error('The wallet changed the selected claim.');
    if (
      tx.outputs[0].capacity !== cell.cellOutput.capacity ||
      !tx.outputs[0].lock.eq(owner) ||
      tx.outputs[0].type ||
      tx.outputsData[0] !== '0x'
    )
      throw Error(
        'A claim must return its full entitlement to its owner. Network fees need separate capacity.',
      );
    return this.review(
      tx,
      descriptor,
      identity,
      owner,
      inputCells,
      'claim',
      state.ticket.principal,
      STORAGE,
      cell.cellOutput.capacity,
      null,
      state.ticket.outcome,
      null,
      null,
    );
  }
  private review(
    tx: ccc.Transaction,
    descriptor: Descriptor,
    identity: Identity,
    owner: ccc.Script,
    inputs: ccc.Cell[],
    kind: Review['kind'],
    principal: bigint,
    storage: bigint,
    payout: bigint,
    shard: number | null,
    outcome: Outcome,
    control: Point | null,
    inputHeader: string | null,
  ): Review {
    for (const dep of this.deps(descriptor))
      if (!tx.cellDeps.some((actual) => actual.eq(dep)))
        throw Error('Contract code dependencies are missing.');
    if (control && !tx.cellDeps.some((dep) => dep.depType === 'code' && dep.outPoint.eq(control)))
      throw Error('The open market dependency is missing.');
    if (inputHeader && !tx.headerDeps.some((header) => header === inputHeader))
      throw Error('The shard admission header is missing.');
    const fee = exactFee(tx, inputs),
      preparedAt = this.now();
    const review = Object.freeze({
      kind,
      descriptor,
      ownerHash: identity.ownerHash,
      principalShannons: principal.toString(),
      storageShannons: storage.toString(),
      feeShannons: fee.toString(),
      totalShannons: (kind === 'deposit' ? principal + storage + fee : fee).toString(),
      payoutShannons: payout.toString(),
      shard,
      outcome,
      expiresAt: preparedAt + REVIEW_MS,
      hash: tx.hash(),
    });
    intents.set(review, {
      tx: tx.clone(),
      owner,
      inputs: inputs.map((c) => c.clone()),
      control,
      inputHeader,
      identity,
      preparedAt,
    });
    return review;
  }
  async revalidate(review: Review, current: Descriptor): Promise<void> {
    const intent = intents.get(review);
    if (!intent) throw Error('This review is no longer available. Prepare it again.');
    const identity = await this.identity();
    if (
      identity.scope !== intent.identity.scope ||
      identity.ownerHash !== review.ownerHash ||
      this.now() < intent.preparedAt ||
      this.now() >= review.expiresAt
    )
      throw Error('The wallet or review lifetime changed. Review again before signing.');
    assertSameTerms(review.descriptor, await parseDescriptor(current));
    if (review.kind === 'deposit') await this.entryTime(current);
    const inputs = await this.inputs(intent.tx, intent.owner, review.descriptor);
    if (
      inputs.some((cell, i) => !sameCell(cell, intent.inputs[i])) ||
      exactFee(intent.tx, inputs).toString() !== review.feeShannons
    )
      throw Error('The reviewed inputs changed. Review again.');
    const inputHeader = await confirmedHeader(this.signer.client, inputs[0].outPoint.txHash);
    if (!inputHeader || (intent.inputHeader && inputHeader.hash !== intent.inputHeader))
      throw Error('The input confirmation changed. Refresh chain state.');
    if (intent.control) {
      const control = await this.signer.client.getCellLiveNoCache(intent.control, true, true);
      if (!control) throw Error('The market changed while reviewing. Review again.');
      const state = checkCell(control, review.descriptor);
      if (state.kind !== 'market' || state.phase !== 0)
        throw Error('The market is no longer open.');
    }
  }
  async signAndPersist(review: Review, current: Descriptor): Promise<JournalRecord> {
    const identity = await this.identity();
    return this.exclusive!(`streak-direct:${identity.ownerHash}`, async () => {
      const pending = await this.outstanding(
        identity,
        review.kind,
        review.descriptor,
        review.kind === 'claim'
          ? point(
              intents.get(review)?.tx.inputs[0].previousOutput ?? { txHash: review.hash, index: 0 },
            )
          : undefined,
      );
      await this.revalidate(review, current);
      const intent = intents.get(review);
      if (!intent) throw Error('Review expired.');
      const reserved = new Set(pending.flatMap((record) => record.inputs.map(pointKey)));
      if (intent.tx.inputs.some((input) => reserved.has(pointKey(input.previousOutput))))
        throw Error(
          'Another saved transaction reserved an input. Review using separate funding cells.',
        );
      const signed = await this.signer.signTransaction(intent.tx.clone());
      assertSignedIntent(intent.tx, signed);
      if (signed.estimateFee(1000n) > BigInt(review.feeShannons))
        throw Error('The signed witness needs a larger fee. Nothing was broadcast; review again.');
      await this.revalidate(review, current);
      // A conflict proof can reorganize while the wallet prompt is open.
      await this.outstanding(
        identity,
        review.kind,
        review.descriptor,
        review.kind === 'claim' ? point(intent.tx.inputs[0].previousOutput) : undefined,
      );
      const record: JournalRecord = Object.freeze({
        version: VERSION,
        scope: identity.scope,
        ownerHash: identity.ownerHash,
        kind: review.kind,
        descriptor: review.descriptor,
        hash: signed.hash(),
        signedBytes: ccc.hexFrom(signed.toBytes()),
        inputs: Object.freeze(signed.inputs.map((input) => point(input.previousOutput))),
        createdAt: this.now(),
        status: 'signed',
        principalShannons: review.principalShannons,
        storageShannons: review.storageShannons,
        feeShannons: review.feeShannons,
        payoutShannons: review.payoutShannons,
        shard: review.shard,
        outcome: review.outcome,
      });
      await this.journal.put(record);
      intents.delete(review);
      if (review.shard !== null) this.nextShard = (review.shard + 1) % 4;
      return record;
    });
  }
  async broadcast(raw: JournalRecord): Promise<Recovery> {
    const record = await parseRecord(raw),
      identity = await this.identity();
    if (record.scope !== identity.scope || record.ownerHash !== identity.ownerHash)
      throw Error('Connect the wallet that signed this transaction.');
    const saved = (await this.journal.list(identity.scope)).find((r) => r.hash === record.hash);
    if (!saved || saved.signedBytes !== record.signedBytes)
      throw Error('Signed transaction recovery must be saved before broadcast.');
    const before = await this.recover(saved);
    if (['committed', 'confirmed', 'submitted', 'conflict', 'resolved'].includes(before.status))
      return before;
    if (before.inputsLive !== true) return before;
    for (const previous of await this.journal.list(identity.scope)) {
      if (previous.hash === saved.hash || !previous.conflictProof) continue;
      const related =
        previous.kind === saved.kind &&
        (saved.kind === 'deposit'
          ? previous.descriptor.type.args === saved.descriptor.type.args
          : pointKey(previous.inputs[0]) === pointKey(saved.inputs[0]));
      if (related && (await this.recover(previous)).status !== 'resolved')
        throw Error(
          'The earlier conflict proof changed. Keep both saved transactions and reconcile before broadcasting again.',
        );
    }
    // This can only resend the original bytes. It never rebuilds or asks for
    // another signature after an uncertain broadcast.
    let status: JournalRecord['status'] = 'submitted';
    try {
      const hash = await this.signer.client.sendTransaction(
        ccc.Transaction.fromBytes(saved.signedBytes),
      );
      if (hash !== saved.hash) throw Error('RPC returned an unexpected transaction hash.');
    } catch {
      status = 'unknown';
    }
    await this.journal.put({ ...saved, status });
    return this.recover({ ...saved, status });
  }
  async recover(raw: JournalRecord): Promise<Recovery> {
    let record = await parseRecord(raw);
    const identity = await this.identity();
    if (record.scope !== identity.scope || record.ownerHash !== identity.ownerHash)
      throw Error('This recovery record belongs to another wallet or account.');
    const latest = (await this.journal.list(identity.scope)).find(
      (saved) => saved.hash === record.hash,
    );
    if (latest) {
      if (latest.signedBytes !== record.signedBytes)
        throw Error('Saved signed transaction bytes changed. Preserve your recovery backup.');
      record = latest;
    }
    const response = await this.signer.client.getTransactionNoCache(record.hash);
    if (response && response.transaction.hash() !== record.hash)
      throw Error('RPC transaction identity mismatch.');
    if (
      response &&
      ['committed', 'pending', 'proposed', 'sent'].includes(response.status) &&
      response.transaction.toHex() !== record.signedBytes
    )
      throw Error('RPC transaction witnesses differ from the saved signed transaction.');
    const originalHeader =
      response?.status === 'committed' && response.blockNumber !== undefined && response.blockHash
        ? await this.signer.client.getHeaderByNumberNoCache(response.blockNumber)
        : undefined;
    const canonicalOriginal = !!originalHeader && originalHeader.hash === response?.blockHash;
    if (record.conflictProof && !canonicalOriginal) {
      const proof = await this.conflictProof(record, record.conflictProof.hash);
      if (
        proof &&
        proof.blockHash === record.conflictProof.blockHash &&
        proof.blockNumber === record.conflictProof.blockNumber
      ) {
        const resolved: JournalRecord = Object.freeze({ ...record, status: 'resolved' });
        await this.journal.put(resolved);
        return Object.freeze({
          record: resolved,
          status: 'resolved',
          confirmations: 0,
          inputsLive: false,
          message:
            'A canonical conflicting spend proves this signed transaction cannot commit on the current chain. You may prepare a fresh review using available inputs.',
        });
      }
      const changed: JournalRecord = Object.freeze({ ...record, status: 'unknown' });
      await this.journal.put(changed);
      return Object.freeze({
        record: changed,
        status: 'reorg',
        confirmations: 0,
        inputsLive: null,
        message:
          'The conflict proof is no longer sufficiently confirmed on the canonical chain. The original inputs are reserved again.',
      });
    }
    let status: Recovery['status'] = 'unknown',
      confirmations = 0,
      inputsLive: boolean | null = null;
    let message =
      'Broadcast outcome is unknown. Keep this hash and reconcile or resend these exact signed bytes.';
    let updated: JournalRecord = record;
    if (
      response?.status === 'committed' &&
      response.blockNumber !== undefined &&
      response.blockHash
    ) {
      const header = await this.signer.client.getHeaderByNumberNoCache(response.blockNumber),
        tip = await this.signer.client.getTipHeader();
      if (!header || header.hash !== response.blockHash || tip.number < response.blockNumber) {
        status = 'reorg';
        inputsLive = (
          await Promise.all(
            record.inputs.map((p) => this.signer.client.getCellLiveNoCache(p, true, true)),
          )
        ).every(Boolean);
        message =
          'The confirmation is no longer on the canonical chain. New spends remain paused; retry can only resend the original bytes when every input is live.';
        updated = { ...record, status: 'unknown' };
      } else {
        confirmations = Number(tip.number - response.blockNumber + 1n);
        status = confirmations >= 3 ? 'confirmed' : 'committed';
        message =
          confirmations >= 3
            ? 'Confirmed on CKB. Admission and settlement are separate chain transitions.'
            : 'Committed on CKB. Waiting for three confirmations.';
        updated = {
          ...record,
          status: 'committed',
          blockHash: response.blockHash,
          blockNumber: response.blockNumber.toString(),
        };
      }
    } else if (response && ['pending', 'proposed', 'sent'].includes(response.status)) {
      status = 'submitted';
      message = 'The original transaction is awaiting chain commitment.';
      updated = { ...record, status: 'submitted' };
    } else {
      inputsLive = (
        await Promise.all(
          record.inputs.map((p) => this.signer.client.getCellLiveNoCache(p, true, true)),
        )
      ).every(Boolean);
      if (record.blockHash) {
        status = 'reorg';
        message =
          'A previously confirmed transaction is absent. Treat this as a possible reorg and reconcile its original hash.';
      } else if (!inputsLive) {
        status = 'conflict';
        message =
          'At least one input is spent but this transaction is not confirmed. Do not create a replacement payment.';
      } else if (response?.status === 'rejected') {
        status = 'rejected';
        message =
          'This node rejected the signed transaction. Its original hash remains reserved until its outcome is resolved.';
      }
      updated = {
        ...record,
        status: status === 'conflict' ? 'conflict' : status === 'rejected' ? 'rejected' : 'unknown',
      };
    }
    await this.journal.put(updated);
    return Object.freeze({
      record: Object.freeze(updated),
      status,
      confirmations,
      inputsLive,
      message,
    });
  }
  private async conflictProof(
    record: JournalRecord,
    spendingHash: string,
  ): Promise<NonNullable<JournalRecord['conflictProof']> | undefined> {
    if (spendingHash === record.hash) return;
    const response = await this.signer.client.getTransactionNoCache(spendingHash);
    if (
      !response ||
      response.transaction.hash() !== spendingHash ||
      response.status !== 'committed' ||
      !response.blockHash ||
      response.blockNumber === undefined
    )
      return;
    if (
      !response.transaction.inputs.some((input) =>
        record.inputs.some((p) => input.previousOutput.eq(p)),
      )
    )
      return;
    const header = await this.signer.client.getHeaderByNumberNoCache(response.blockNumber),
      tip = await this.signer.client.getTipHeader();
    if (!header || header.hash !== response.blockHash || tip.number < response.blockNumber + 2n)
      return;
    return Object.freeze({
      hash: spendingHash,
      blockHash: response.blockHash,
      blockNumber: response.blockNumber.toString(),
    });
  }
  async resolveConflict(raw: JournalRecord, spendingHash: string): Promise<Recovery> {
    const record = await parseRecord(raw),
      identity = await this.identity();
    if (record.scope !== identity.scope || record.ownerHash !== identity.ownerHash)
      throw Error('Connect the wallet that owns this saved transaction.');
    const original = await this.signer.client.getTransactionNoCache(record.hash);
    if (
      original?.status === 'committed' &&
      (await confirmedHeader(this.signer.client, record.hash, original))
    )
      throw Error('The original transaction is committed. Follow its existing position instead.');
    const proof = await this.conflictProof(record, hex(spendingHash.toLowerCase(), 32));
    if (!proof)
      throw Error(
        'That transaction does not prove a conflicting spend with three canonical confirmations. The original reservation remains.',
      );
    const saved = (await this.journal.list(identity.scope)).find((r) => r.hash === record.hash);
    if (!saved || saved.signedBytes !== record.signedBytes)
      throw Error('Restore the original saved transaction before resolving its conflict.');
    const updated: JournalRecord = Object.freeze({
      ...saved,
      status: 'resolved',
      conflictProof: proof,
    });
    await this.journal.put(updated);
    return this.recover(updated);
  }
}

/** Local VM integration seam. Never accepts public/remote replacement deployments. */
export async function createDevnetDirectClient(
  signer: ccc.Signer,
  codeDeps: readonly ccc.CellDepLike[],
  scopeId: string,
  journal: Journal,
  options: Options = {},
  manifest: Manifest = MANIFEST,
): Promise<DirectClient> {
  if (signer.client.url !== 'http://127.0.0.1:8218')
    throw Error('Devnet client requires the isolated loopback node.');
  const response = await fetch('http://127.0.0.1:8218', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'get_blockchain_info', params: [] }),
    signal: AbortSignal.timeout(5000),
  });
  const body: unknown = await response.json();
  if (
    !body ||
    typeof body !== 'object' ||
    !('result' in body) ||
    !body.result ||
    typeof body.result !== 'object' ||
    !('chain' in body.result) ||
    body.result.chain !== 'ckb_dev'
  )
    throw Error('The loopback node is not an isolated CKB dev chain.');
  if (codeDeps.length !== 2)
    throw Error('The devnet needs exactly the protocol and guard code cells.');
  for (let i = 0; i < 2; i++) {
    const cell = await signer.client.getCellLiveNoCache(codeDeps[i].outPoint, true, true);
    if (
      !cell ||
      codeDeps[i].depType !== 'code' ||
      ccc.hashCkb(bytes(cell.outputData)) !== [parseManifest(manifest).protocolHash, GUARD_HASH][i]
    )
      throw Error('Devnet binary hashes differ from the pinned testnet code.');
  }
  const client = new DirectClient(signer, manifest, scopeId, journal, options);
  devnetDependencies.set(
    client,
    codeDeps.map((dep) => ccc.CellDep.from(dep)),
  );
  return client;
}

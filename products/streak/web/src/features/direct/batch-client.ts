import { ccc } from '@ckb-ccc/core';
import {
  BATCH_MANIFEST,
  BATCH_PROTOCOL_HASH,
  MANIFEST,
  GUARD_HASH,
  CKB,
  MIN_PRINCIPAL,
  STORAGE,
  SHARD_RESERVE,
  U64_MAX,
  bytes,
  hex,
  point,
  pointKey,
  checkCell,
  assertSameTerms,
} from './protocol.ts';
import type { Outcome, Point, Descriptor } from './protocol.ts';
import { DirectClient, createDevnetDirectClient } from './client.ts';
import type { Identity } from './client.ts';
import { IndexedJournal } from './journal.ts';
import type { Journal } from './journal.ts';
import { loadMarket, confirmedHeader } from './discovery.ts';
import { canonicalConflict, parseReservation, reservationReleased } from './reservations.ts';
import type { Reservation } from './reservations.ts';
import { assertOwnerSigned, assertSponsorSigned } from './sponsored-journal.ts';
import { inputPoints, sameFixture, SPONSOR_MAX_FEE } from './sponsored-protocol.ts';
import { parseBatchFixture, parseBatchOffer, parseBatchStatus } from './batch-protocol.ts';
import type { BatchFixture, BatchOffer, BatchTransport } from './batch-protocol.ts';
import { IndexedBatchJournal, parseBatchRecord, parseBatchSourcePicks } from './batch-journal.ts';
import type { BatchRecord, BatchJournal } from './batch-journal.ts';
import type { Pick } from '../predictions/draft.ts';
import type { SponsoredOptions } from './sponsored-client.ts';

export type BatchPick = Readonly<{ fixture: BatchFixture; outcome: Outcome; principal: bigint }>;
export type BatchReview = Readonly<{
  kind: 'batch-deposit';
  offer: BatchOffer;
  ownerHash: string;
  hash: string;
  principalShannons: string;
  storageShannons: string;
  feeShannons: string;
  totalShannons: string;
  sponsorReserveShannons: string;
  expiresAt: number;
}>;
export type BatchRecovery = Readonly<{
  record: BatchRecord;
  status:
    | 'awaiting-sponsor'
    | 'unknown'
    | 'submitted'
    | 'committed'
    | 'confirmed'
    | 'conflict'
    | 'reorg'
    | 'resolved'
    | 'discarded';
  confirmations: number;
  inputsLive: boolean | null;
  message: string;
}>;
export type BatchOptions = SponsoredOptions;
type Intent = { tx: ccc.Transaction; identity: Identity; preparedAt: number };
const intents = new WeakMap<BatchReview, Intent>();
const devnet = new WeakMap<BatchClient, { identity: DirectClient; deps: ccc.CellDep[] }>();
const minChange = (lock: ccc.Script) =>
  BigInt(ccc.CellOutput.from({ capacity: 0n, lock }).occupiedSize) * CKB;
async function exclusive<T>(name: string, action: () => Promise<T>): Promise<T> {
  if (!globalThis.navigator?.locks)
    throw Error(
      'This browser cannot safely coordinate wallet submissions. Use a browser with Web Locks support.',
    );
  // Recovery also writes the journal. Queue it with submissions, including across tabs.
  return navigator.locks.request(name, { mode: 'exclusive' }, action);
}
async function walletMode(client: ccc.Client, lock: ccc.Script) {
  const native = await ccc.Script.fromKnownScript(
    client,
    ccc.KnownScript.Secp256k1Blake160,
    lock.args,
  );
  if (native.eq(lock) && bytes(lock.args).length === 20)
    return { length: 65, known: ccc.KnownScript.Secp256k1Blake160 };
  const omni = await ccc.Script.fromKnownScript(client, ccc.KnownScript.OmniLock, lock.args);
  if (omni.eq(lock) && /^0x12[0-9a-f]{40}00$/.test(lock.args))
    return { length: 85, known: ccc.KnownScript.OmniLock };
  throw Error('Combined predictions support native CKB and modern OmniLock EVM wallets.');
}
function appendTicket(
  previous: Uint8Array,
  ownerHash: string,
  outcome: Outcome,
  principal: bigint,
  shard: number,
): string {
  const count = previous.length ? (previous.length - 4) / 41 : 0,
    data = new Uint8Array(4 + 41 * (count + 1));
  data.set([1, shard, count, 1]);
  if (previous.length) data.set(previous.slice(4), 4);
  data.set(bytes(ownerHash), 4 + count * 41);
  data[4 + count * 41 + 32] = outcome;
  new DataView(data.buffer).setBigUint64(4 + count * 41 + 33, principal, true);
  return ccc.hexFrom(data);
}

export class BatchClient {
  readonly signer: ccc.Signer;
  readonly transport: BatchTransport;
  readonly journal: BatchJournal;
  readonly options: BatchOptions;
  private readonly base: DirectClient;
  private readonly now: () => number;
  private readonly lock: NonNullable<BatchOptions['exclusive']>;
  constructor(
    signer: ccc.Signer,
    transport: BatchTransport,
    journal: BatchJournal = new IndexedBatchJournal(),
    options: BatchOptions = {},
  ) {
    this.signer = signer;
    this.transport = transport;
    this.journal = journal;
    this.options = options;
    this.base = new DirectClient(signer, MANIFEST, options.scopeId ?? 'wallet');
    this.now = options.now ?? Date.now;
    this.lock = options.exclusive ?? exclusive;
  }
  identity(): Promise<Identity> {
    return (devnet.get(this)?.identity ?? this.base).identity();
  }
  async history(): Promise<BatchRecord[]> {
    return this.journal.list((await this.identity()).scope);
  }
  private dependencies(): ccc.CellDep[] {
    const deps =
      devnet.get(this)?.deps ?? BATCH_MANIFEST.codeDeps.map((dep) => ccc.CellDep.from(dep));
    if (deps.length !== 2)
      throw Error('Combined predictions are awaiting contract activation. Your slip is saved.');
    return deps;
  }
  private async pending(
    identity: Identity,
    fixtureIds: readonly string[] = [],
    ignoreHash?: string,
  ): Promise<Reservation[]> {
    const records = [
        ...(await this.journal.list(identity.scope)).map(parseReservation),
        ...((await this.journal.otherReservations?.(identity.scope)) ?? []),
      ],
      pending: Reservation[] = [];
    for (const record of records) {
      if (record.hash === ignoreHash || (await reservationReleased(this.signer.client, record)))
        continue;
      pending.push(record);
      if ((record.fixtureIds ?? [record.fixtureId]).some((id) => fixtureIds.includes(id)))
        throw Error(
          'A prediction in this slip already has a signed payment. Resume that original transaction before paying again.',
        );
    }
    return pending;
  }
  private async time(fixtures: readonly BatchFixture[], expiresAt?: number): Promise<void> {
    const tip = await this.signer.client.getTipHeader();
    if (
      fixtures.some(
        (fixture) =>
          this.now() + 120_000 >= fixture.cutoffMs ||
          tip.timestamp + 120_000n >= BigInt(fixture.cutoffMs),
      ) ||
      (expiresAt !== undefined && this.now() >= expiresAt)
    )
      throw Error(
        'This review expired or a match is too close to kickoff. No new payment was submitted.',
      );
  }
  async prepare(raw: readonly BatchPick[]): Promise<BatchReview> {
    if (
      raw.length < 1 ||
      raw.length > 8 ||
      new Set(raw.map((pick) => pick.fixture.fixtureId)).size !== raw.length
    )
      throw Error('Choose one to eight independent predictions without duplicate fixtures.');
    const picks = await Promise.all(
        raw.map(async (pick) => ({ ...pick, fixture: await parseBatchFixture(pick.fixture) })),
      ),
      identity = await this.identity();
    for (const pick of picks) {
      if (
        !['available', 'funded'].includes(pick.fixture.state) ||
        ![0, 1, 2].includes(pick.outcome) ||
        pick.principal < MIN_PRINCIPAL ||
        pick.principal > 1_000_000n * CKB
      )
        throw Error(
          'Every prediction must be available and stake between 100 and 1,000,000 testnet CKB.',
        );
    }
    this.dependencies();
    await this.time(picks.map((pick) => pick.fixture));
    const owner = (await ccc.Address.fromString(identity.address, this.signer.client)).script;
    await walletMode(this.signer.client, owner);
    const pending = await this.pending(
        identity,
        picks.map((pick) => pick.fixture.fixtureId),
      ),
      reserved = new Set(pending.flatMap((row) => row.inputs.map(pointKey)));
    const target =
      picks.reduce((sum, pick) => sum + pick.principal + STORAGE, 0n) + minChange(owner) + CKB;
    const selected: Point[] = [];
    let capacity = 0n,
      inspected = 0;
    for await (const candidate of this.signer.findCells(
      { scriptLenRange: [0, 1], outputDataLenRange: [0, 1] },
      true,
      'asc',
      32,
    )) {
      if (++inspected > 256 || selected.length >= 16) break;
      if (reserved.has(pointKey(candidate.outPoint))) continue;
      const live = await this.signer.client.getCellLiveNoCache(candidate.outPoint, true, true);
      if (
        !live ||
        live.cellOutput.type ||
        live.outputData !== '0x' ||
        !live.cellOutput.lock.eq(owner)
      )
        continue;
      selected.push(point(live.outPoint));
      capacity += live.cellOutput.capacity;
      if (capacity >= target) break;
    }
    if (capacity < target)
      throw Error(
        'Insufficient unreserved CKB for this slip, 321 CKB storage per prediction, fee and wallet change.',
      );
    const offer = await parseBatchOffer(
      await this.transport.offer({
        requestId: crypto.randomUUID(),
        ownerAddress: identity.address,
        userInputs: selected,
        picks: picks.map((pick) => ({
          fixtureId: pick.fixture.fixtureId,
          termsHash: pick.fixture.termsHash,
          outcome: pick.outcome,
          principalShannons: pick.principal.toString(),
        })),
      }),
    );
    if (
      offer.lines.length !== picks.length ||
      !owner.eq(offer.ownerLock) ||
      JSON.stringify(offer.inputs.slice(1, 1 + selected.length).map((input) => input.outPoint)) !==
        JSON.stringify(selected) ||
      offer.userInputIndexes.length !== selected.length
    )
      throw Error('The offer changed the complete slip or its funding inputs.');
    for (const [index, pick] of picks.entries()) {
      const line = offer.lines[index];
      sameFixture(pick.fixture, line.fixture);
      if (line.outcome !== pick.outcome || line.principalShannons !== pick.principal.toString())
        throw Error('A prediction changed while preparing payment.');
      if (pick.fixture.descriptor) assertSameTerms(pick.fixture.descriptor, line.descriptor);
    }
    const tx = await this.verify(offer),
      prepared = await this.signer.prepareTransaction(tx.clone());
    if (prepared.toHex() !== tx.toHex())
      throw Error('This wallet needs a different transaction format. Nothing was signed.');
    await this.time(
      picks.map((pick) => pick.fixture),
      offer.expiresAt,
    );
    const review: BatchReview = Object.freeze({
      kind: 'batch-deposit',
      offer,
      ownerHash: identity.ownerHash,
      hash: offer.rawHash,
      principalShannons: offer.principalShannons,
      storageShannons: offer.storageShannons,
      feeShannons: offer.feeShannons,
      totalShannons: (
        BigInt(offer.principalShannons) +
        BigInt(offer.storageShannons) +
        BigInt(offer.feeShannons)
      ).toString(),
      sponsorReserveShannons: offer.reserveShannons,
      expiresAt: Math.min(offer.expiresAt, this.now() + 60_000),
    });
    intents.set(review, { tx: tx.clone(), identity, preparedAt: this.now() });
    return review;
  }
  private async verify(offer: BatchOffer): Promise<ccc.Transaction> {
    const tx = ccc.Transaction.fromBytes(offer.unsignedBytes),
      owner = ccc.Script.from(offer.ownerLock),
      sponsor = ccc.Script.from(offer.sponsorLock);
    const ownerMode = await walletMode(this.signer.client, owner),
      sponsorMode = await walletMode(this.signer.client, sponsor);
    const deposits = offer.lines.filter((line) => line.mode === 'deposit'),
      owners = offer.userInputIndexes.length;
    if (
      tx.inputs.length !== 1 + owners + deposits.length ||
      tx.inputs.some((input) => input.since !== 0n) ||
      new Set(tx.inputs.map((input) => pointKey(input.previousOutput))).size !== tx.inputs.length ||
      tx.witnesses.length !== tx.inputs.length ||
      tx.outputsData.length !== tx.outputs.length ||
      tx.toBytes().length > 100_000 ||
      tx.cellDeps.length > 20
    )
      throw Error('Unexpected combined payment layout.');
    for (const [index, length] of [
      [0, sponsorMode.length],
      [1, ownerMode.length],
    ]) {
      const witness = tx.getWitnessArgs(index);
      if (witness?.lock !== `0x${'00'.repeat(length)}` || witness.inputType || witness.outputType)
        throw Error('Both contributors must begin with unsigned witness placeholders.');
    }
    if (tx.witnesses.slice(2).some((value) => value !== '0x'))
      throw Error('Unexpected additional signing group.');
    const live: ccc.Cell[] = [];
    for (const [index, input] of tx.inputs.entries()) {
      const cell = await this.signer.client.getCellLiveNoCache(input.previousOutput, true, true),
        snapshot = offer.inputs[index];
      if (
        !cell ||
        cell.cellOutput.toHex() !==
          ccc.CellOutput.from({
            capacity: BigInt(snapshot.capacityShannons),
            lock: snapshot.lock,
            type: snapshot.type,
          }).toHex() ||
        cell.outputData !== snapshot.data
      )
        throw Error('A reviewed transaction input changed or was spent.');
      if (
        index <= owners &&
        (cell.cellOutput.type ||
          cell.outputData !== '0x' ||
          !cell.cellOutput.lock.eq(index === 0 ? sponsor : owner))
      )
        throw Error('Funding inputs must be plain CKB controlled by their exact contributor.');
      live.push(cell);
    }
    const expectedDeps = ccc.Transaction.from({ cellDeps: this.dependencies() }),
      headers: string[] = [];
    let depositIndex = 1 + owners;
    const assertOutput = (
      index: number,
      capacity: bigint,
      lock: ccc.ScriptLike,
      type: ccc.ScriptLike | undefined,
      data: string,
    ) => {
      if (
        capacity < 0n ||
        capacity > U64_MAX ||
        tx.outputs[index]?.toHex() !== ccc.CellOutput.from({ capacity, lock, type }).toHex() ||
        tx.outputsData[index] !== data
      )
        throw Error('A prediction output changed its amount, position, recipient or contract.');
    };
    for (const line of offer.lines) {
      const type = ccc.Script.from(line.descriptor.type),
        guard = ccc.Script.from({ codeHash: GUARD_HASH, hashType: 'data2', args: type.hash() });
      const args = bytes(type.args),
        principal = BigInt(line.principalShannons),
        base = line.outputIndex;
      if (
        type.codeHash !== BATCH_PROTOCOL_HASH ||
        [36, 108, 140].some(
          (offset) => ccc.hexFrom(args.slice(offset, offset + 32)) !== sponsor.hash(),
        )
      )
        throw Error('The market oracle or fee recipients differ from the pinned sponsor.');
      if (line.mode === 'create') {
        if (
          ccc.hexFrom(args.slice(0, 32)) !== ccc.hashCkb(tx.inputs[0].previousOutput.toBytes()) ||
          new DataView(args.buffer, args.byteOffset, args.byteLength).getUint32(32, true) !== base
        )
          throw Error('A new market has the wrong origin or output group.');
        assertOutput(base, SHARD_RESERVE, guard, type, '0x0000ff');
        for (let shard = 0; shard < 4; shard++)
          assertOutput(
            base + 1 + shard,
            SHARD_RESERVE + (shard === 0 ? principal + STORAGE : 0n),
            guard,
            type,
            shard === 0
              ? appendTicket(new Uint8Array(), owner.hash(), line.outcome, principal, 0)
              : ccc.hexFrom(new Uint8Array([1, shard, 0, 0])),
          );
      } else {
        if (line.shardInputIndex !== depositIndex++ || !line.controlDep || !line.headerHash)
          throw Error('Existing market input order changed.');
        const selected = live[line.shardInputIndex],
          state = checkCell(selected, line.descriptor as Descriptor);
        const market = await loadMarket(this.signer.client, line.descriptor as Descriptor),
          control = market.find((row) => row.state.kind === 'market' && row.state.phase === 0);
        if (
          !control ||
          !control.cell.outPoint.eq(line.controlDep) ||
          !market.some((row) => row.cell.outPoint.eq(selected.outPoint)) ||
          state.kind !== 'shard' ||
          state.id !== line.shard ||
          state.accepted.length + (state.pending ? 1 : 0) >= 8
        )
          throw Error(
            'The selected market or prediction slot changed. Review the whole slip again.',
          );
        const header = await confirmedHeader(this.signer.client, selected.outPoint.txHash);
        if (
          !header ||
          header.hash !== line.headerHash ||
          (state.pending && header.timestamp >= BigInt(line.fixture.cutoffMs))
        )
          throw Error('The previous pending prediction is not eligible for admission.');
        expectedDeps.cellDeps.push(
          ccc.CellDep.from({ outPoint: line.controlDep, depType: 'code' }),
        );
        if (!headers.includes(header.hash)) headers.push(header.hash);
        assertOutput(
          base,
          selected.cellOutput.capacity + principal + STORAGE,
          guard,
          type,
          appendTicket(state.bytes, owner.hash(), line.outcome, principal, state.id),
        );
      }
    }
    await expectedDeps.addCellDepsOfKnownScripts(
      this.signer.client,
      sponsorMode.known,
      ownerMode.known,
    );
    if (
      tx.cellDeps.length !== expectedDeps.cellDeps.length ||
      tx.cellDeps.some((dep, index) => !dep.eq(expectedDeps.cellDeps[index])) ||
      JSON.stringify(tx.headerDeps) !== JSON.stringify(headers)
    )
      throw Error('Combined payment dependencies or admission headers changed.');
    const fee = BigInt(offer.feeShannons),
      ownerCapacity = live
        .slice(1, 1 + owners)
        .reduce((sum, cell) => sum + cell.cellOutput.capacity, 0n);
    const sponsorChange = live[0].cellOutput.capacity - BigInt(offer.reserveShannons),
      ownerChange =
        ownerCapacity - BigInt(offer.principalShannons) - BigInt(offer.storageShannons) - fee;
    assertOutput(offer.sponsorChangeOutputIndex, sponsorChange, sponsor, undefined, '0x');
    assertOutput(offer.ownerChangeOutputIndex, ownerChange, owner, undefined, '0x');
    if (
      sponsorChange < minChange(sponsor) ||
      ownerChange < minChange(owner) ||
      fee > SPONSOR_MAX_FEE ||
      tx.estimateFee(1000n) > fee ||
      live.reduce((sum, cell) => sum + cell.cellOutput.capacity, 0n) -
        tx.outputs.reduce((sum, out) => sum + out.capacity, 0n) !==
        fee
    )
      throw Error(
        'The combined payment changes your exact total, sponsor contribution or network fee.',
      );
    return tx;
  }
  async signAndPersist(
    review: BatchReview,
    currentFixtures: readonly BatchFixture[],
    sourcePicks?: readonly Pick[],
    onStage?: (stage: 'wallet' | 'saving') => void,
  ): Promise<BatchRecord> {
    const identity = await this.identity();
    return this.lock(`streak-direct:${identity.ownerHash}`, async () => {
      const intent = intents.get(review);
      if (
        !intent ||
        intent.identity.scope !== identity.scope ||
        review.ownerHash !== identity.ownerHash ||
        this.now() < intent.preparedAt ||
        this.now() >= review.expiresAt
      )
        throw Error(
          'Your wallet or combined payment review changed. Prepare the whole slip again.',
        );
      const savedPicks = parseBatchSourcePicks(sourcePicks, review.offer);
      if (
        new Set(currentFixtures.map((fixture) => fixture.fixtureId)).size !== currentFixtures.length
      )
        throw Error('Duplicate current fixture identities.');
      for (const line of review.offer.lines) {
        const raw = currentFixtures.find((fixture) => fixture.fixtureId === line.fixture.fixtureId);
        if (!raw) throw Error('A fixture is no longer available. Your slip remains saved.');
        const current = await parseBatchFixture(raw);
        sameFixture(line.fixture, current);
        if (current.state === 'unavailable' || (line.mode === 'create' && current.descriptor))
          throw Error('Fixture availability changed. Review the whole slip again.');
        if (line.mode === 'deposit') {
          if (!current.descriptor) throw Error('Existing market terms changed.');
          assertSameTerms(line.descriptor, current.descriptor);
        }
      }
      const fixtureIds = review.offer.lines.map((line) => line.fixture.fixtureId);
      const assertReservations = async () => {
        const reserved = new Set(
          (await this.pending(identity, fixtureIds)).flatMap((row) => row.inputs.map(pointKey)),
        );
        if (intent.tx.inputs.some((input) => reserved.has(pointKey(input.previousOutput))))
          throw Error('Another signed payment reserves an input in this slip.');
      };
      await assertReservations();
      await this.time(
        review.offer.lines.map((line) => line.fixture),
        review.expiresAt,
      );
      await this.verify(review.offer);
      onStage?.('wallet');
      const signed = await this.signer.signTransaction(intent.tx.clone());
      onStage?.('saving');
      assertOwnerSigned(intent.tx, signed);
      if (signed.estimateFee(1000n) > BigInt(review.feeShannons))
        throw Error('The signature exceeds the reviewed fee. Nothing was submitted.');
      const latestIdentity = await this.identity();
      if (
        latestIdentity.scope !== identity.scope ||
        latestIdentity.ownerHash !== identity.ownerHash
      )
        throw Error('Wallet changed while signing. Nothing was submitted.');
      await assertReservations();
      const record: BatchRecord = Object.freeze({
        version: 'atomic-predictions-v1',
        scope: identity.scope,
        ownerHash: identity.ownerHash,
        descriptor: review.offer.descriptor,
        descriptors: Object.freeze(review.offer.lines.map((line) => line.descriptor)),
        ...(savedPicks ? { sourcePicks: savedPicks } : {}),
        offer: review.offer,
        hash: signed.hash(),
        ownerSignedBytes: signed.toHex(),
        inputs: inputPoints(signed),
        createdAt: this.now(),
        status: 'owner-signed',
      });
      await this.journal.put(record);
      intents.delete(review);
      return record;
    });
  }
  private async saved(raw: BatchRecord): Promise<BatchRecord> {
    const record = await parseBatchRecord(raw),
      identity = await this.identity();
    if (record.scope !== identity.scope || record.ownerHash !== identity.ownerHash)
      throw Error('Connect the wallet that signed this prediction.');
    const stored = (await this.journal.list(identity.scope)).find(
      (row) => row.hash === record.hash,
    );
    if (!stored || stored.ownerSignedBytes !== record.ownerSignedBytes)
      throw Error('Restore the saved owner signature before continuing.');
    return stored;
  }
  async submit(raw: BatchRecord): Promise<BatchRecovery> {
    const identity = await this.identity();
    return this.lock(`streak-direct:${identity.ownerHash}`, async () => {
      let record = await this.saved(raw);
      const previous = await this.recoverUnlocked(record);
      record = previous.record;
      if (
        ['submitted', 'committed', 'confirmed', 'conflict', 'resolved', 'discarded'].includes(
          previous.status,
        ) ||
        previous.inputsLive === false
      )
        return previous;
      if (
        !record.submissionAttemptedAt &&
        !record.finalSignedBytes &&
        this.now() >= record.offer.expiresAt
      )
        throw Error(
          'This signature was never shared and its offer expired. Discard the unshared signature before preparing a fresh review.',
        );
      const pending = await this.pending(identity, [], record.hash),
        reserved = new Set(pending.flatMap((r) => r.inputs.map(pointKey)));
      if (record.inputs.some((input) => reserved.has(pointKey(input))))
        throw Error('Another unresolved signed transaction reserves an input.');
      record = {
        ...record,
        status: 'submitting',
        submissionAttemptedAt: record.submissionAttemptedAt ?? this.now(),
      };
      await this.journal.put(record);
      try {
        if (record.finalSignedBytes) {
          if (previous.inputsLive !== true) return previous;
          const hash = await this.signer.client.sendTransaction(
            ccc.Transaction.fromBytes(record.finalSignedBytes),
          );
          if (hash !== record.hash) throw Error('RPC returned a different transaction identity.');
        } else {
          const status = await parseBatchStatus(
            await this.transport.submit({
              offerId: record.offer.offerId,
              rawHash: record.hash,
              userSignedBytes: record.ownerSignedBytes,
            }),
          );
          record = await this.acceptStatus(record, status);
        }
      } catch {
        await this.journal.put({ ...record, status: 'unknown' });
      }
      return this.recoverUnlocked(record);
    });
  }
  private async acceptStatus(
    record: BatchRecord,
    status: Awaited<ReturnType<BatchTransport['status']>>,
  ): Promise<BatchRecord> {
    if (
      JSON.stringify(status.offer) !== JSON.stringify(record.offer) ||
      status.transactionHash !== record.hash
    )
      throw Error('The sponsor returned a different offer. Keep your original transaction.');
    if (status.signedBytes) {
      assertSponsorSigned(
        ccc.Transaction.fromBytes(record.ownerSignedBytes),
        ccc.Transaction.fromBytes(status.signedBytes),
      );
      if (record.finalSignedBytes && record.finalSignedBytes !== status.signedBytes)
        throw Error('Final transaction witnesses changed.');
      record = Object.freeze({
        ...record,
        finalSignedBytes: status.signedBytes,
        status: 'submitted',
      });
      await this.journal.put(record);
    }
    return record;
  }
  async recover(raw: BatchRecord): Promise<BatchRecovery> {
    const identity = await this.identity();
    return this.lock(`streak-direct:${identity.ownerHash}`, () => this.recoverUnlocked(raw));
  }
  private async recoverUnlocked(raw: BatchRecord): Promise<BatchRecovery> {
    let record = await this.saved(raw);
    if (record.status === 'discarded')
      return {
        record,
        status: 'discarded',
        confirmations: 0,
        inputsLive: null,
        message:
          'This expired signature was never shared and was explicitly discarded. Its audit record remains saved.',
      };
    const client = this.signer.client,
      response = await client.getTransactionNoCache(record.hash);
    if (response && response.transaction.hash() !== record.hash)
      throw Error('RPC transaction identity mismatch.');
    let status: BatchRecovery['status'] = record.finalSignedBytes ? 'unknown' : 'awaiting-sponsor';
    let confirmations = 0,
      inputsLive: boolean | null = null;
    let message =
      'Your signed prediction is saved. Resume this exact transaction; do not start another payment.';
    const originalHeader =
      response?.status === 'committed' && response.blockNumber !== undefined && response.blockHash
        ? await client.getHeaderByNumberNoCache(response.blockNumber)
        : undefined;
    const canonicalOriginal = !!originalHeader && originalHeader.hash === response?.blockHash;
    if (record.conflictProof && !canonicalOriginal) {
      const proof = await canonicalConflict(client, record, record.conflictProof.hash);
      if (
        proof &&
        proof.blockHash === record.conflictProof.blockHash &&
        proof.blockNumber === record.conflictProof.blockNumber
      ) {
        record = { ...record, status: 'resolved' };
        await this.journal.put(record);
        return {
          record,
          status: 'resolved',
          confirmations: 0,
          inputsLive: false,
          message:
            'A confirmed conflicting spend invalidates this transaction. A fresh review may use available inputs.',
        };
      }
      record = { ...record, status: 'unknown' };
      await this.journal.put(record);
      return {
        record,
        status: 'reorg',
        confirmations: 0,
        inputsLive: null,
        message: 'The conflict proof changed. Original input reservations apply again.',
      };
    }
    if (response && ['pending', 'proposed', 'sent', 'committed'].includes(response.status)) {
      const finalSignedBytes = ccc.hexFrom(response.transaction.toBytes());
      assertSponsorSigned(ccc.Transaction.fromBytes(record.ownerSignedBytes), response.transaction);
      if (record.finalSignedBytes && record.finalSignedBytes !== finalSignedBytes)
        throw Error('On-chain witnesses differ from the saved signed transaction.');
      record = { ...record, finalSignedBytes };
      status = 'submitted';
      message = 'The original transaction is waiting for chain confirmation.';
      if (
        response.status === 'committed' &&
        response.blockHash &&
        response.blockNumber !== undefined
      ) {
        const header = await client.getHeaderByNumberNoCache(response.blockNumber),
          tip = await client.getTipHeader();
        if (header?.hash === response.blockHash && tip.number >= response.blockNumber) {
          confirmations = Number(tip.number - response.blockNumber + 1n);
          status = confirmations >= 3 ? 'confirmed' : 'committed';
          record = {
            ...record,
            status: 'committed',
            blockHash: response.blockHash,
            blockNumber: response.blockNumber.toString(),
          };
          message =
            confirmations >= 3
              ? 'All predictions confirmed in one transaction. Admission is verified from the creation block before settlement.'
              : 'All predictions committed in one transaction. Waiting for three confirmations.';
        } else {
          status = 'reorg';
          message = 'This confirmation is no longer canonical. Recover the same transaction.';
        }
      }
    } else {
      try {
        record = await this.acceptStatus(
          record,
          await parseBatchStatus(
            await this.transport.status({ offerId: record.offer.offerId, rawHash: record.hash }),
          ),
        );
      } catch {
        message =
          'Sponsorship status is unavailable. Your exact signed prediction remains saved and its inputs stay reserved.';
      }
      if (record.blockHash) {
        status = 'reorg';
        message =
          'The previously committed transaction is absent. Reconcile or resend its exact signed bytes.';
      } else if (record.finalSignedBytes) status = 'unknown';
    }
    if (!['submitted', 'committed', 'confirmed'].includes(status)) {
      inputsLive = (
        await Promise.all(
          record.inputs.map((input) => client.getCellLiveNoCache(input, true, true)),
        )
      ).every(Boolean);
      if (!inputsLive && status !== 'reorg') {
        status = 'conflict';
        message =
          'An input is spent but this transaction is unconfirmed. Keep the original record and verify the conflicting transaction.';
      }
    }
    record = {
      ...record,
      status:
        status === 'committed' || status === 'confirmed'
          ? 'committed'
          : status === 'submitted'
            ? 'submitted'
            : !record.submissionAttemptedAt && !record.finalSignedBytes
              ? 'owner-signed'
              : 'unknown',
    };
    await this.journal.put(record);
    return Object.freeze({
      record: Object.freeze(record),
      status,
      confirmations,
      inputsLive,
      message,
    });
  }
  async resolveConflict(raw: BatchRecord, spendingHash: string): Promise<BatchRecovery> {
    const identity = await this.identity();
    return this.lock(`streak-direct:${identity.ownerHash}`, async () => {
      const record = await this.saved(raw),
        original = await this.signer.client.getTransactionNoCache(record.hash);
      if (
        original?.status === 'committed' &&
        original.blockNumber !== undefined &&
        original.blockHash &&
        (await this.signer.client.getHeaderByNumberNoCache(original.blockNumber))?.hash ===
          original.blockHash
      )
        throw Error('The original transaction is committed. Follow its existing position instead.');
      const proof = await canonicalConflict(
        this.signer.client,
        record,
        hex(spendingHash.toLowerCase(), 32),
      );
      if (!proof)
        throw Error(
          'The supplied hash does not prove a conflicting spend with three canonical confirmations.',
        );
      if (this.transport.resolve) {
        if ((await this.signer.client.getTipHeader()).number < BigInt(proof.blockNumber) + 3n)
          throw Error(
            'Wait for four canonical confirmations before releasing the sponsorship reservation.',
          );
        const status = await parseBatchStatus(
          await this.transport.resolve({
            offerId: record.offer.offerId,
            rawHash: record.hash,
            conflictingTxHash: proof.hash,
          }),
        );
        if (
          JSON.stringify(status.offer) !== JSON.stringify(record.offer) ||
          status.transactionHash !== record.hash
        )
          throw Error(
            'The operator returned a different recovery identity. Keep the original input reservations.',
          );
      }
      await this.journal.put({ ...record, status: 'resolved', conflictProof: proof });
      return this.recoverUnlocked(record);
    });
  }
  async discardUnsubmitted(raw: BatchRecord): Promise<BatchRecovery> {
    const identity = await this.identity();
    return this.lock(`streak-direct:${identity.ownerHash}`, async () => {
      const record = await this.saved(raw);
      if (
        record.submissionAttemptedAt ||
        record.finalSignedBytes ||
        record.status === 'discarded' ||
        this.now() < record.offer.expiresAt
      )
        throw Error('Only an expired signature that was never submitted can be discarded.');
      const status = await parseBatchStatus(
        await this.transport.status({ offerId: record.offer.offerId, rawHash: record.hash }),
      );
      if (
        JSON.stringify(status.offer) !== JSON.stringify(record.offer) ||
        status.signedBytes ||
        !['offered', 'expired', 'cancelled'].includes(status.state)
      )
        throw Error(
          'The operator may have received a signature. Keep the original transaction and reconcile it.',
        );
      const discarded: BatchRecord = {
        ...record,
        status: 'discarded',
        discardedAt: this.now(),
      };
      await this.journal.put(discarded);
      return this.recoverUnlocked(discarded);
    });
  }
}

/** Isolated local-node seam with hash-verified v4 dependencies. */
export async function createDevnetBatchClient(
  signer: ccc.Signer,
  codeDeps: readonly ccc.CellDepLike[],
  transport: BatchTransport,
  journal: BatchJournal,
  options: BatchOptions = {},
  legacyJournal: Journal = new IndexedJournal(),
): Promise<BatchClient> {
  const identity = await createDevnetDirectClient(
    signer,
    codeDeps,
    options.scopeId ?? 'wallet',
    legacyJournal,
    options,
    BATCH_MANIFEST,
  );
  const client = new BatchClient(signer, transport, journal, options);
  devnet.set(client, { identity, deps: codeDeps.map((dep) => ccc.CellDep.from(dep)) });
  return client;
}

import { ccc } from '@ckb-ccc/core';
import {
  bytes,
  checkCell,
  CKB,
  hex,
  MANIFEST,
  MIN_PRINCIPAL,
  point,
  pointKey,
  SHARD_RESERVE,
  SPONSORED_MANIFEST,
  STORAGE,
} from './protocol.ts';
import type { Outcome, Point } from './protocol.ts';
import { DirectClient, createDevnetDirectClient } from './client.ts';
import type { Identity } from './client.ts';
import { IndexedJournal } from './journal.ts';
import type { Journal } from './journal.ts';
import { canonicalConflict, parseReservation, reservationReleased } from './reservations.ts';
import type { Reservation } from './reservations.ts';
import {
  IndexedSponsoredJournal,
  assertOwnerSigned,
  assertSponsorSigned,
  parseSponsoredRecord,
} from './sponsored-journal.ts';
import type { SponsoredJournal, SponsoredRecord } from './sponsored-journal.ts';
import {
  inputPoints,
  parseDemandFixture,
  parseSponsorOffer,
  parseSponsorStatus,
  sameFixture,
  SPONSOR_MAX_FEE,
  SPONSOR_RESERVE,
} from './sponsored-protocol.ts';
import type { DemandFixture, SponsorOffer, SponsorTransport } from './sponsored-protocol.ts';

export type SponsoredReview = Readonly<{
  kind: 'create-deposit';
  offer: SponsorOffer;
  ownerHash: string;
  hash: string;
  principalShannons: string;
  storageShannons: string;
  feeShannons: string;
  totalShannons: string;
  sponsorReserveShannons: string;
  outcome: Outcome;
  expiresAt: number;
}>;
export type SponsoredRecovery = Readonly<{
  record: SponsoredRecord;
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
export type SponsoredOptions = {
  now?: () => number;
  scopeId?: string;
  exclusive?: <T>(name: string, action: () => Promise<T>) => Promise<T>;
};
type Intent = { tx: ccc.Transaction; identity: Identity; preparedAt: number };
const intents = new WeakMap<SponsoredReview, Intent>();
const devnet = new WeakMap<SponsoredClient, { identity: DirectClient; deps: ccc.CellDep[] }>();
async function exclusive<T>(name: string, action: () => Promise<T>): Promise<T> {
  if (!globalThis.navigator?.locks)
    throw Error(
      'This browser cannot safely coordinate wallet submissions. Use a browser with Web Locks support.',
    );
  return navigator.locks.request(name, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
    if (!lock)
      throw Error('Another Streak tab is using this wallet. Finish that submission first.');
    return action();
  });
}
const minChange = (lock: ccc.Script) =>
  BigInt(ccc.CellOutput.from({ capacity: 0n, lock }).occupiedSize) * CKB;
async function walletMode(
  client: ccc.Client,
  lock: ccc.Script,
): Promise<{ length: number; known: ccc.KnownScript }> {
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
  throw Error('Opening a market currently supports native CKB or modern OmniLock EVM wallets.');
}

export class SponsoredClient {
  readonly signer: ccc.Signer;
  readonly transport: SponsorTransport;
  readonly journal: SponsoredJournal;
  readonly options: SponsoredOptions;
  private readonly base: DirectClient;
  private readonly now: () => number;
  private readonly lock: NonNullable<SponsoredOptions['exclusive']>;
  constructor(
    signer: ccc.Signer,
    transport: SponsorTransport,
    journal: SponsoredJournal = new IndexedSponsoredJournal(),
    options: SponsoredOptions = {},
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
  async history(): Promise<SponsoredRecord[]> {
    return this.journal.list((await this.identity()).scope);
  }
  private dependencies(): ccc.CellDep[] {
    const deps =
      devnet.get(this)?.deps ?? SPONSORED_MANIFEST.codeDeps.map((dep) => ccc.CellDep.from(dep));
    if (deps.length !== 2)
      throw Error('Sponsored contract deployment is awaiting confirmation. Your picks are saved.');
    return deps;
  }
  private async pending(
    identity: Identity,
    fixtureId?: string,
    ignoreHash?: string,
  ): Promise<Reservation[]> {
    const own = (await this.journal.list(identity.scope)).map(parseReservation);
    const others = (await this.journal.otherReservations?.(identity.scope)) ?? [];
    const pending: Reservation[] = [];
    for (const record of [...own, ...others]) {
      if (record.hash === ignoreHash || (await reservationReleased(this.signer.client, record)))
        continue;
      pending.push(record);
      if (fixtureId && (record.fixtureIds ?? [record.fixtureId]).includes(fixtureId))
        throw Error(
          'This fixture already has a signed prediction. Resume its original transaction before paying again.',
        );
    }
    return pending;
  }
  private async time(fixture: DemandFixture, expiresAt?: number): Promise<void> {
    const tip = await this.signer.client.getTipHeader();
    if (
      this.now() + 120_000 >= fixture.cutoffMs ||
      tip.timestamp + 120_000n >= BigInt(fixture.cutoffMs) ||
      (expiresAt !== undefined && this.now() >= expiresAt)
    )
      throw Error('This offer expired or kickoff is too close. No new payment was submitted.');
  }
  async prepare(raw: DemandFixture, outcome: Outcome, principal: bigint): Promise<SponsoredReview> {
    const fixture = await parseDemandFixture(raw),
      identity = await this.identity();
    if (fixture.state !== 'available' || fixture.descriptor)
      throw Error(
        'This fixture is already being prepared or funded. Refresh its payment availability.',
      );
    if (![0, 1, 2].includes(outcome) || principal < MIN_PRINCIPAL || principal > 1_000_000n * CKB)
      throw Error('Choose an outcome and a stake between 100 and 1,000,000 testnet CKB.');
    this.dependencies();
    await this.time(fixture);
    const owner = (await ccc.Address.fromString(identity.address, this.signer.client)).script;
    await walletMode(this.signer.client, owner);
    const pending = await this.pending(identity, fixture.fixtureId),
      reserved = new Set(pending.flatMap((r) => r.inputs.map(pointKey)));
    const target = principal + STORAGE + minChange(owner) + CKB;
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
        !live.cellOutput.lock.eq(owner) ||
        live.cellOutput.type ||
        live.outputData !== '0x'
      )
        continue;
      selected.push(point(live.outPoint));
      capacity += live.cellOutput.capacity;
      if (capacity >= target) break;
    }
    if (capacity < target)
      throw Error(
        'Insufficient unreserved plain CKB for the stake, 321 CKB storage, fee and a valid change cell.',
      );
    const offer = await parseSponsorOffer(
      await this.transport.offer({
        fixtureId: fixture.fixtureId,
        termsHash: fixture.termsHash,
        ownerAddress: identity.address,
        userInputs: selected,
        outcome,
        principalShannons: principal.toString(),
        requestId: crypto.randomUUID(),
      }),
    );
    sameFixture(fixture, offer.fixture);
    if (
      offer.outcome !== outcome ||
      offer.principalShannons !== principal.toString() ||
      !owner.eq(offer.ownerLock) ||
      JSON.stringify(inputPoints(ccc.Transaction.fromBytes(offer.unsignedBytes)).slice(1)) !==
        JSON.stringify(selected)
    )
      throw Error('The sponsorship offer changed your prediction or funding inputs.');
    const tx = await this.verify(offer);
    const prepared = await this.signer.prepareTransaction(tx.clone());
    if (
      prepared.hash() !== tx.hash() ||
      JSON.stringify(prepared.witnesses) !== JSON.stringify(tx.witnesses)
    )
      throw Error('This wallet needs a different transaction format. Nothing was signed.');
    await this.time(fixture, offer.expiresAt);
    const review: SponsoredReview = Object.freeze({
      kind: 'create-deposit',
      offer,
      ownerHash: identity.ownerHash,
      hash: offer.rawHash,
      principalShannons: offer.principalShannons,
      storageShannons: STORAGE.toString(),
      feeShannons: offer.feeShannons,
      totalShannons: (principal + STORAGE + BigInt(offer.feeShannons)).toString(),
      sponsorReserveShannons: SPONSOR_RESERVE.toString(),
      outcome,
      expiresAt: Math.min(offer.expiresAt, this.now() + 60_000),
    });
    intents.set(review, { tx: tx.clone(), identity, preparedAt: this.now() });
    return review;
  }
  /** Verifies each contributor separately, never attributing a mixed transaction by one input. */
  private async verify(offer: SponsorOffer): Promise<ccc.Transaction> {
    const tx = ccc.Transaction.fromBytes(offer.unsignedBytes),
      owner = ccc.Script.from(offer.ownerLock),
      sponsor = ccc.Script.from(offer.sponsorLock);
    const ownerMode = await walletMode(this.signer.client, owner),
      sponsorMode = await walletMode(this.signer.client, sponsor);
    if (
      tx.inputs.length < 2 ||
      tx.inputs.length > 17 ||
      tx.outputs.length !== 7 ||
      tx.outputsData.length !== 7 ||
      tx.headerDeps.length ||
      tx.inputs.some((input) => input.since !== 0n) ||
      new Set(tx.inputs.map((input) => pointKey(input.previousOutput))).size !== tx.inputs.length ||
      tx.witnesses.length !== tx.inputs.length ||
      tx.toBytes().length > 100_000 ||
      tx.cellDeps.length > 16
    )
      throw Error('The sponsored transaction exceeds the reviewed first-prediction layout.');
    const dependencyTemplate = ccc.Transaction.from({ cellDeps: this.dependencies() });
    await dependencyTemplate.addCellDepsOfKnownScripts(
      this.signer.client,
      sponsorMode.known,
      ownerMode.known,
    );
    if (
      tx.cellDeps.length !== dependencyTemplate.cellDeps.length ||
      tx.cellDeps.some((dep, i) => !dep.eq(dependencyTemplate.cellDeps[i]))
    )
      throw Error('Sponsored transaction code dependencies changed.');
    for (const [index, length] of [
      [0, sponsorMode.length],
      [1, ownerMode.length],
    ]) {
      const witness = tx.getWitnessArgs(index);
      if (
        !witness?.lock ||
        witness.lock !== `0x${'00'.repeat(length)}` ||
        witness.inputType ||
        witness.outputType
      )
        throw Error('A sponsorship offer must contain only unsigned witness placeholders.');
    }
    if (tx.witnesses.slice(2).some((witness) => witness !== '0x'))
      throw Error('Unexpected extra signing witness.');
    const args = bytes(offer.descriptor.type.args),
      sponsorHash = sponsor.hash();
    if (
      ccc.hexFrom(args.slice(0, 36)) !== ccc.hexFrom(tx.inputs[0].previousOutput.toBytes()) ||
      [36, 108, 140].some((offset) => ccc.hexFrom(args.slice(offset, offset + 32)) !== sponsorHash)
    )
      throw Error('Market origin, oracle or fee recipient changed.');
    const expectedData = ['0x0000ff', '', '0x01010000', '0x01020000', '0x01030000'];
    for (let index = 0; index < 5; index++) {
      const cell = ccc.Cell.from({
        outPoint: { txHash: offer.rawHash, index },
        cellOutput: tx.outputs[index],
        outputData: tx.outputsData[index],
      });
      const state = checkCell(cell, offer.descriptor);
      if (index === 1) {
        if (
          state.kind !== 'shard' ||
          state.id !== 0 ||
          state.accepted.length ||
          !state.pending ||
          state.pending.owner !== owner.hash() ||
          state.pending.principal.toString() !== offer.principalShannons ||
          state.pending.outcome !== offer.outcome
        )
          throw Error('The first position does not match your prediction.');
      } else if (
        tx.outputsData[index] !== expectedData[index] ||
        tx.outputs[index].capacity !== SHARD_RESERVE
      )
        throw Error('Initial market reserves or shard layout changed.');
    }
    for (const [index, lock] of [
      [5, sponsor],
      [6, owner],
    ] as const)
      if (
        !tx.outputs[index].lock.eq(lock) ||
        tx.outputs[index].type ||
        tx.outputsData[index] !== '0x' ||
        tx.outputs[index].capacity < minChange(lock)
      )
        throw Error('Contributor change must return to its exact owner in a valid plain cell.');
    let sponsorCapacity = 0n,
      ownerCapacity = 0n;
    for (let index = 0; index < tx.inputs.length; index++) {
      const cell = await this.signer.client.getCellLiveNoCache(
        tx.inputs[index].previousOutput,
        true,
        true,
      );
      if (
        !cell ||
        cell.cellOutput.type ||
        cell.outputData !== '0x' ||
        !cell.cellOutput.lock.eq(index === 0 ? sponsor : owner)
      )
        throw Error('A sponsored input is spent or does not belong to its expected contributor.');
      if (index === 0) sponsorCapacity = cell.cellOutput.capacity;
      else ownerCapacity += cell.cellOutput.capacity;
    }
    const fee = BigInt(offer.feeShannons),
      total = BigInt(offer.principalShannons) + STORAGE + fee;
    if (
      sponsorCapacity - tx.outputs[5].capacity !== SPONSOR_RESERVE ||
      ownerCapacity - tx.outputs[6].capacity !== total ||
      sponsorCapacity +
        ownerCapacity -
        tx.outputs.reduce((sum, output) => sum + output.capacity, 0n) !==
        fee ||
      fee > SPONSOR_MAX_FEE ||
      tx.estimateFee(1000n) > fee
    )
      throw Error('The transaction changes the exact stake, sponsor contribution or network fee.');
    return tx;
  }
  async signAndPersist(review: SponsoredReview, current: DemandFixture): Promise<SponsoredRecord> {
    const identity = await this.identity();
    return this.lock(`streak-direct:${identity.ownerHash}`, async () => {
      const intent = intents.get(review);
      if (
        !intent ||
        intent.identity.scope !== identity.scope ||
        identity.ownerHash !== review.ownerHash ||
        this.now() < intent.preparedAt ||
        this.now() >= review.expiresAt
      )
        throw Error('The wallet or sponsorship review changed. Prepare a fresh review.');
      sameFixture(review.offer.fixture, await parseDemandFixture(current));
      if (current.state === 'funded' || current.state === 'unavailable')
        throw Error('Fixture availability changed before signing.');
      const pending = await this.pending(identity, current.fixtureId);
      const reserved = new Set(pending.flatMap((record) => record.inputs.map(pointKey)));
      if (intent.tx.inputs.some((input) => reserved.has(pointKey(input.previousOutput))))
        throw Error('A reviewed input is reserved by another transaction.');
      await this.time(current, review.expiresAt);
      await this.verify(review.offer);
      const signed = await this.signer.signTransaction(intent.tx.clone());
      assertOwnerSigned(intent.tx, signed);
      if (signed.estimateFee(1000n) > BigInt(review.feeShannons))
        throw Error('The signature exceeds the reviewed network fee. Nothing was submitted.');
      const currentIdentity = await this.identity();
      if (
        currentIdentity.scope !== identity.scope ||
        currentIdentity.ownerHash !== identity.ownerHash
      )
        throw Error('The connected wallet changed while signing. Nothing was submitted.');
      const latestReservations = await this.pending(identity, current.fixtureId);
      const latestInputs = new Set(latestReservations.flatMap((row) => row.inputs.map(pointKey)));
      if (intent.tx.inputs.some((input) => latestInputs.has(pointKey(input.previousOutput))))
        throw Error('A reviewed input became reserved while signing. Nothing was submitted.');
      const record: SponsoredRecord = Object.freeze({
        version: 'sponsored-create-v1',
        scope: identity.scope,
        ownerHash: identity.ownerHash,
        descriptor: review.offer.descriptor,
        offer: review.offer,
        hash: signed.hash(),
        ownerSignedBytes: ccc.hexFrom(signed.toBytes()),
        inputs: inputPoints(signed),
        createdAt: this.now(),
        status: 'owner-signed',
      });
      // Preserve the signature even if the wallet prompt outlasted the offer. Expiry is not chain proof.
      await this.journal.put(record);
      intents.delete(review);
      return record;
    });
  }
  private async saved(raw: SponsoredRecord): Promise<SponsoredRecord> {
    const record = await parseSponsoredRecord(raw),
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
  async submit(raw: SponsoredRecord): Promise<SponsoredRecovery> {
    const identity = await this.identity();
    return this.lock(`streak-direct:${identity.ownerHash}`, async () => {
      let record = await this.saved(raw);
      const previous = await this.recover(record);
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
      const pending = await this.pending(identity, undefined, record.hash),
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
          const status = await parseSponsorStatus(
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
      return this.recover(record);
    });
  }
  private async acceptStatus(
    record: SponsoredRecord,
    status: Awaited<ReturnType<SponsorTransport['status']>>,
  ): Promise<SponsoredRecord> {
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
  async recover(raw: SponsoredRecord): Promise<SponsoredRecovery> {
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
    let status: SponsoredRecovery['status'] = record.finalSignedBytes
      ? 'unknown'
      : 'awaiting-sponsor';
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
              ? 'Market and prediction confirmed together. Admission is verified from the creation block before settlement.'
              : 'Market and prediction committed. Waiting for three confirmations.';
        } else {
          status = 'reorg';
          message = 'This confirmation is no longer canonical. Recover the same transaction.';
        }
      }
    } else {
      try {
        record = await this.acceptStatus(
          record,
          await parseSponsorStatus(await this.transport.status(record.offer.offerId, record.hash)),
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
  async resolveConflict(raw: SponsoredRecord, spendingHash: string): Promise<SponsoredRecovery> {
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
        await this.transport.resolve({
          offerId: record.offer.offerId,
          rawHash: record.hash,
          conflictingTxHash: proof.hash,
        });
      }
      await this.journal.put({ ...record, status: 'resolved', conflictProof: proof });
      return this.recover(record);
    });
  }
  async discardUnsubmitted(raw: SponsoredRecord): Promise<SponsoredRecovery> {
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
      const status = await parseSponsorStatus(
        await this.transport.status(record.offer.offerId, record.hash),
      );
      if (
        JSON.stringify(status.offer) !== JSON.stringify(record.offer) ||
        status.signedBytes ||
        !['offered', 'expired', 'cancelled'].includes(status.state)
      )
        throw Error(
          'The operator may have received a signature. Keep the original transaction and reconcile it.',
        );
      const discarded: SponsoredRecord = {
        ...record,
        status: 'discarded',
        discardedAt: this.now(),
      };
      await this.journal.put(discarded);
      return this.recover(discarded);
    });
  }
}

/** Isolated local-node integration seam. Public dependency overrides are never accepted. */
export async function createDevnetSponsoredClient(
  signer: ccc.Signer,
  codeDeps: readonly ccc.CellDepLike[],
  transport: SponsorTransport,
  journal: SponsoredJournal,
  options: SponsoredOptions = {},
  legacyJournal: Journal = new IndexedJournal(),
): Promise<SponsoredClient> {
  const identity = await createDevnetDirectClient(
    signer,
    codeDeps,
    options.scopeId ?? 'wallet',
    legacyJournal,
    options,
    SPONSORED_MANIFEST,
  );
  const client = new SponsoredClient(signer, transport, journal, options);
  devnet.set(client, { identity, deps: codeDeps.map((dep) => ccc.CellDep.from(dep)) });
  return client;
}

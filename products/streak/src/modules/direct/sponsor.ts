import * as ccc from '@ckb-ccc/core';
import { createHash, randomUUID } from 'node:crypto';
import type { Match } from '../../types';
import { sponsoredOriginDescendant } from './sponsor-lineage';
import {
  createRecord,
  DirectRegistry,
  type DirectMarketDescriptor,
  type DirectProtocolConfig,
  type DirectTerms,
  PROVIDER_ORIGIN,
  RESULT_WINDOW_MS,
  termsDigest,
  hash32,
  object,
  LEGACY_DIRECT_CONFIG,
} from './registry';
import { OperatorJournal, broadcastOperation, reconcileOperation, operationKey } from './journal';
import { operatorFundingBarrier, assertFreshOperatorInputs } from './cli';
import {
  SponsorJournal,
  sponsorId,
  canonicalSponsorConflicts,
  type SponsorEntry,
} from './sponsor-journal';

const CKB = 100_000_000n,
  RESERVE = 3050n * CKB,
  SHARD = 610n * CKB,
  STORAGE = 321n * CKB;
type ScriptDTO = { codeHash: string; hashType: ccc.HashType; args: string };
type OutPointDTO = { txHash: string; index: number };
export type SponsorState =
  | 'offered'
  | 'owner-signed'
  | 'signed'
  | 'confirming'
  | 'funded'
  | 'expired'
  | 'cancelled'
  | 'blocked';
export interface DemandFixture {
  fixtureId: string;
  label: string;
  cutoffMs: number;
  terms: DirectTerms;
  termsHash: string;
  state: 'available' | 'reserved' | 'confirming' | 'funded' | 'unavailable';
  sponsorLock: ScriptDTO;
  descriptor?: DirectMarketDescriptor;
}
export interface SponsorOffer {
  version: 'sponsored-create-v1';
  offerId: string;
  expiresAt: number;
  fixture: DemandFixture;
  descriptor: DirectMarketDescriptor;
  rawHash: string;
  unsignedBytes: string;
  sponsorLock: ScriptDTO;
  sponsorInput: OutPointDTO;
  ownerLock: ScriptDTO;
  userInputIndexes: number[];
  reserveShannons: '305000000000';
  feeShannons: string;
  outcome: 0 | 1 | 2;
  principalShannons: string;
}
export interface SponsorStatus {
  offer: SponsorOffer;
  state: SponsorState;
  signedBytes?: string;
  transactionHash: string;
  message?: string;
}
export interface SponsorOfferRequest {
  fixtureId: string;
  termsHash: string;
  ownerAddress: string;
  userInputs: OutPointDTO[];
  outcome: 0 | 1 | 2;
  principalShannons: string;
  requestId: string;
}
export interface SponsorSubmitRequest {
  offerId: string;
  rawHash: string;
  userSignedBytes: string;
}
export interface SponsorOptions {
  client: ccc.Client;
  signer: ccc.Signer;
  journal: OperatorJournal;
  registry: DirectRegistry;
  config: DirectProtocolConfig;
  fixture: (fixtureId: string) => Promise<Match>;
  now?: () => number;
  existingRegistry?: DirectRegistry[];
}
const scriptDTO = (script: ccc.Script): ScriptDTO => ({
  codeHash: script.codeHash,
  hashType: script.hashType,
  args: script.args,
});
const hex = (data: Uint8Array): string => ccc.hexFrom(data);
const le = (value: bigint): Buffer => {
  const data = Buffer.alloc(8);
  data.writeBigUInt64LE(value);
  return data;
};
const raw = (value: string): Buffer => Buffer.from(value.slice(2), 'hex');
const unsigned = (value: unknown, label: string): bigint => {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,19})$/.test(value))
    throw Error(`Invalid ${label}`);
  return BigInt(value);
};
const minChange = (lock: ccc.Script): bigint =>
  BigInt(ccc.CellOutput.from({ capacity: 0n, lock }).occupiedSize) * CKB;

export function parseSponsorRequest(value: unknown): SponsorOfferRequest {
  const row = object(value, 'sponsor request');
  if (
    typeof row.fixtureId !== 'string' ||
    !/^api-football-[1-9][0-9]{0,14}$/.test(row.fixtureId) ||
    typeof row.ownerAddress !== 'string' ||
    row.ownerAddress.length > 300 ||
    ![0, 1, 2].includes(Number(row.outcome)) ||
    typeof row.outcome !== 'number' ||
    !Array.isArray(row.userInputs) ||
    !row.userInputs.length ||
    row.userInputs.length > 16
  )
    throw Error('Invalid sponsored prediction');
  const principal = unsigned(row.principalShannons, 'principal');
  if (principal < 100n * CKB || principal > 1_000_000n * CKB)
    throw Error('Sponsored principal is outside pilot limits');
  const inputs = row.userInputs.map((value) => {
    const point = object(value, 'user input');
    if (
      typeof point.index !== 'number' ||
      !Number.isSafeInteger(point.index) ||
      point.index < 0 ||
      point.index > 0xffff_ffff
    )
      throw Error('Invalid input index');
    return { txHash: hash32(point.txHash, 'user input hash'), index: point.index };
  });
  if (new Set(inputs.map((point) => `${point.txHash}:${point.index}`)).size !== inputs.length)
    throw Error('Duplicate owner input');
  return {
    fixtureId: row.fixtureId,
    termsHash: hash32(row.termsHash, 'terms hash'),
    ownerAddress: row.ownerAddress,
    userInputs: inputs,
    outcome: row.outcome as 0 | 1 | 2,
    principalShannons: principal.toString(),
    requestId: sponsorId(row.requestId),
  };
}

export async function sponsoredWalletMode(
  client: ccc.Client,
  lock: ccc.Script,
): Promise<'native' | 'evm'> {
  const native = await ccc.Script.fromKnownScript(
    client,
    ccc.KnownScript.Secp256k1Blake160,
    lock.args,
  );
  if (native.eq(lock) && ccc.bytesFrom(lock.args).length === 20) return 'native';
  const omni = await ccc.Script.fromKnownScript(client, ccc.KnownScript.OmniLock, lock.args);
  if (omni.eq(lock) && /^0x12[0-9a-f]{40}00$/.test(lock.args)) return 'evm';
  throw Error('Sponsored creation supports native secp or modern OmniLock EVM wallets');
}

/** Verify locally before the operator signs or exposes any co-signature to an RPC. */
export async function verifySponsorOwnerWitness(
  client: ccc.Client,
  offer: SponsorOffer,
  userSignedBytes: string,
): Promise<ccc.Transaction> {
  if (!/^0x(?:[0-9a-f]{2})+$/.test(userSignedBytes) || userSignedBytes.length > 200_002)
    throw Error('Invalid owner signed bytes');
  const template = ccc.Transaction.fromBytes(offer.unsignedBytes),
    tx = ccc.Transaction.fromBytes(userSignedBytes);
  if (
    tx.hash() !== offer.rawHash ||
    template.hash() !== offer.rawHash ||
    tx.witnesses.length !== template.witnesses.length ||
    tx.witnesses.length !== tx.inputs.length
  )
    throw Error('Owner changed the frozen transaction or witness count');
  for (let i = 0; i < tx.witnesses.length; i++)
    if (i !== 1 && tx.witnesses[i] !== template.witnesses[i])
      throw Error('Owner changed another witness group');
  const owner = ccc.Script.from(offer.ownerLock),
    mode = await sponsoredWalletMode(client, owner);
  const original = ccc.WitnessArgs.fromBytes(template.witnesses[1]);
  const witness = ccc.WitnessArgs.fromBytes(tx.witnesses[1]);
  if (
    witness.inputType !== original.inputType ||
    witness.outputType !== original.outputType ||
    !witness.lock
  )
    throw Error('Owner changed witness metadata');
  const lock = Buffer.from(ccc.bytesFrom(witness.lock));
  const info = await template.getSignHashInfo(owner, client);
  if (!info || info.position !== 1) throw Error('Owner input group changed');
  let valid = false;
  try {
    if (mode === 'native' && lock.length === 65)
      valid = ccc.hashCkbShort(ccc.recoverMessageSecp256k1(info.message, hex(lock))) === owner.args;
    if (
      mode === 'evm' &&
      lock.length === 85 &&
      lock.readUInt32LE(0) === 85 &&
      lock.readUInt32LE(4) === 16 &&
      lock.readUInt32LE(8) === 85 &&
      lock.readUInt32LE(12) === 85 &&
      lock.readUInt32LE(16) === 65 &&
      lock[84] <= 1
    )
      valid = ccc.verifyMessageEvmPersonal(
        `CKB transaction: ${info.message}`,
        hex(lock.subarray(20)),
        `0x${owner.args.slice(4, 44)}`,
      );
  } catch {
    valid = false;
  }
  if (!valid) throw Error('Invalid owner transaction signature');
  return tx;
}

export class SponsorService {
  readonly store: SponsorJournal;
  readonly now: () => number;
  private recoveryCursor = 0;
  constructor(readonly options: SponsorOptions) {
    this.store = new SponsorJournal(options.journal.directory);
    this.now = options.now ?? Date.now;
  }
  private async fixture(id: string): Promise<Match> {
    const fixture = await this.options.fixture(id);
    if (
      fixture.id !== id ||
      fixture.status !== 'scheduled' ||
      fixture.sport !== 'football' ||
      fixture.oracle?.provider !== 'api-football' ||
      fixture.oracle.source !== PROVIDER_ORIGIN ||
      id !== `api-football-${fixture.oracle.fixtureId}` ||
      !Number.isSafeInteger(Date.parse(fixture.kickoff)) ||
      Date.parse(fixture.kickoff) <= this.now() + 120_000
    )
      throw Error('A fresh real scheduled fixture at least two minutes before kickoff is required');
    return fixture;
  }
  private existing(id: string) {
    return [this.options.registry, ...(this.options.existingRegistry ?? [])]
      .map((registry) => registry.get(id))
      .find((record) => record && record.type.codeHash !== LEGACY_DIRECT_CONFIG.protocolHash);
  }
  async describe(id: string): Promise<DemandFixture> {
    return this.describeMatch(await this.fixture(id));
  }
  async configuration(): Promise<{
    sponsorLock: ScriptDTO;
    reservations: { fixtureId: string; state: 'reserved' | 'confirming' }[];
  }> {
    const lock = (await this.options.signer.getRecommendedAddressObj()).script;
    return {
      sponsorLock: scriptDTO(lock),
      reservations: this.store
        .active(this.now())
        .filter((entry) => !['funded', 'cancelled'].includes(entry.state))
        .map((entry) => ({
          fixtureId: entry.offer.fixture.fixtureId,
          state: entry.signedBytes ? 'confirming' : 'reserved',
        })),
    };
  }
  private async describeMatch(match: Match): Promise<DemandFixture> {
    const id = match.id,
      cutoffMs = Date.parse(match.kickoff),
      lock = (await this.options.signer.getRecommendedAddressObj()).script;
    const terms: DirectTerms = {
      provider: 'football',
      providerFixtureId: match.oracle!.fixtureId,
      source: 'api-football',
      rules: 'regulation-time-1x2-v1',
      deadlineMs: cutoffMs + RESULT_WINDOW_MS,
    };
    const existing = this.existing(id);
    const entry = this.store
      .active(this.now())
      .find((entry) => entry.offer.fixture.fixtureId === id && entry.state !== 'cancelled');
    const base = {
      fixtureId: id,
      label: `${match.home.name} vs ${match.away.name}`,
      cutoffMs,
      terms,
    };
    return {
      ...base,
      termsHash: termsDigest({
        ...base,
        id: '',
        creationTxHash: '',
        type: { codeHash: '', hashType: 'data2', args: '' },
      }),
      sponsorLock: scriptDTO(lock),
      state: existing
        ? 'funded'
        : entry
          ? entry.state === 'cancelled'
            ? 'unavailable'
            : entry.signedBytes
              ? 'confirming'
              : 'reserved'
          : this.options.config.codeDeps.length === 2
            ? 'available'
            : 'unavailable',
      ...(existing
        ? {
            descriptor: {
              ...existing,
              entryEnabled: existing.cutoffMs === cutoffMs && this.now() < cutoffMs,
            },
          }
        : {}),
    };
  }
  async prepareOffer(value: unknown): Promise<SponsorOffer> {
    const request = parseSponsorRequest(value),
      digest = `0x${createHash('sha256').update(JSON.stringify(request)).digest('hex')}`;
    return this.options.journal.exclusive(async () => {
      const prior = this.store.all().find((entry) => entry.requestId === request.requestId);
      if (prior) {
        if (prior.requestDigest !== digest)
          throw Error('Request identity already belongs to another prediction');
        return prior.offer;
      }
      if (this.options.config.codeDeps.length !== 2)
        throw Error('Sponsored contract deployment is not ready');
      if (this.existing(request.fixtureId))
        throw Error(
          'This fixture already has a funded market. Refresh and use its regular stake path.',
        );
      await this.refreshConflicts();
      for (const entry of this.store.active(this.now())) {
        if (
          entry.state === 'offered' &&
          !entry.userSignedBytes &&
          entry.ownerAddress === request.ownerAddress &&
          entry.offer.fixture.fixtureId === request.fixtureId
        ) {
          entry.state = 'cancelled';
          this.store.save(entry);
        }
      }
      if (
        this.store
          .active(this.now())
          .some((entry) => !entry.signedBytes && entry.state !== 'cancelled')
      )
        throw Error(
          'Sponsor is completing another prediction. Retry after its reservation expires.',
        );
      const barrier = await operatorFundingBarrier(
        this.options.client,
        this.options.journal,
        this.options.registry,
      );
      if (!barrier.clear)
        throw Error('Sponsor funding is awaiting canonical confirmation or recovery');
      const priorAttempts = this.store
        .all()
        .filter(
          (entry) => entry.signedBytes && entry.offer.fixture.fixtureId === request.fixtureId,
        );
      if (priorAttempts.filter((entry) => entry.createdAtMs > this.now() - 60_000).length >= 3)
        throw Error('This fixture has reached its sponsored retry window. Retry after one minute.');
      const conflicts = await canonicalSponsorConflicts(
        this.options.client,
        this.options.journal.directory,
      );
      if (
        conflicts.uncertain ||
        priorAttempts.some((entry) => !conflicts.resolved.has(entry.offer.rawHash))
      )
        throw Error('A previous market creation still needs canonical recovery');
      const match = await this.fixture(request.fixtureId),
        fixture = await this.describeMatch(match);
      if (fixture.termsHash !== request.termsHash)
        throw Error('Fixture terms changed. Review the prediction again.');
      const owner = (await ccc.Address.fromString(request.ownerAddress, this.options.client))
        .script;
      const sponsor = (await this.options.signer.getRecommendedAddressObj()).script;
      if (owner.eq(sponsor)) throw Error('Sponsor and owner must be different wallets');
      if (ccc.bytesFrom(sponsor.args).length > 59)
        throw Error('Sponsor lock exceeds the protocol limit');
      const mode = await sponsoredWalletMode(this.options.client, owner);
      const userCells: ccc.Cell[] = [];
      for (const point of request.userInputs) {
        const cell = await this.options.client.getCellLiveNoCache(point, true, true);
        if (
          !cell ||
          !cell.cellOutput.lock.eq(owner) ||
          cell.cellOutput.type ||
          cell.outputData !== '0x'
        )
          throw Error('Owner input must be live plain capacity controlled by the connected wallet');
        userCells.push(cell);
      }
      const page = await this.options.client.findCellsPagedNoCache(
        {
          script: sponsor,
          scriptType: 'lock',
          scriptSearchMode: 'exact',
          withData: true,
          filter: { scriptLenRange: [0, 1], outputDataLenRange: [0, 1] },
        },
        'desc',
        64,
      );
      const candidates = page.cells
        .filter(
          (cell) =>
            !cell.cellOutput.type &&
            cell.outputData === '0x' &&
            cell.cellOutput.capacity >= RESERVE + minChange(sponsor),
        )
        .sort((a, b) => (a.cellOutput.capacity > b.cellOutput.capacity ? -1 : 1));
      let fund: ccc.Cell | undefined;
      const origins = [
        ...new Map(
          priorAttempts.map((entry) => {
            const point = ccc.OutPoint.from(entry.offer.sponsorInput);
            return [point.toHex(), point] as const;
          }),
        ).values(),
      ];
      if (origins.length > 64)
        throw Error('Sponsor funding lineage exceeds its bounded recovery window');
      // Prefer the original still-live input. Otherwise prove that the new input
      // descends from it, so competing creation attempts can never both commit.
      for (const origin of origins.slice(-1)) {
        const live = await this.options.client.getCellLiveNoCache(origin, true, true);
        if (
          live &&
          !live.cellOutput.type &&
          live.outputData === '0x' &&
          live.cellOutput.lock.eq(sponsor) &&
          live.cellOutput.capacity >= RESERVE + minChange(sponsor) &&
          (await sponsoredOriginDescendant(this.options.client, live.outPoint, origins))
        )
          fund = live;
      }
      for (const candidate of candidates.slice(0, 4)) {
        if (fund) break;
        const live = await this.options.client.getCellLiveNoCache(candidate.outPoint, true, true);
        if (
          live &&
          !live.cellOutput.type &&
          live.outputData === '0x' &&
          live.cellOutput.lock.eq(sponsor) &&
          live.cellOutput.capacity >= RESERVE + minChange(sponsor) &&
          (await sponsoredOriginDescendant(this.options.client, live.outPoint, origins))
        ) {
          fund = live;
          break;
        }
      }
      if (!fund) throw Error('Streak needs additional testnet capacity to sponsor this market');
      const principal = BigInt(request.principalShannons),
        ownerCapacity = userCells.reduce((sum, cell) => sum + cell.cellOutput.capacity, 0n);
      const args = hex(
        Buffer.concat([
          Buffer.from(fund.outPoint.toBytes()),
          raw(sponsor.hash()),
          le(BigInt(fixture.cutoffMs)),
          raw(this.options.config.guardHash),
          raw(sponsor.hash()),
          raw(sponsor.hash()),
        ]),
      );
      const type = ccc.Script.from({
        codeHash: this.options.config.protocolHash,
        hashType: 'data2',
        args,
      });
      const guard = {
        codeHash: this.options.config.guardHash,
        hashType: 'data2' as const,
        args: type.hash(),
      };
      const tx = ccc.Transaction.from({
        inputs: [fund, ...userCells].map((cell) => ({ previousOutput: cell.outPoint, since: 0n })),
        outputs: [
          ...Array.from({ length: 5 }, (_, i) => ({
            capacity: SHARD + (i === 1 ? principal + STORAGE : 0n),
            type,
            lock: guard,
          })),
          { capacity: fund.cellOutput.capacity - RESERVE, lock: sponsor },
          { capacity: ownerCapacity - principal - STORAGE, lock: owner },
        ],
        outputsData: [
          '0x0000ff',
          hex(
            Buffer.concat([
              Buffer.from([1, 0, 0, 1]),
              raw(owner.hash()),
              Buffer.from([request.outcome]),
              le(principal),
            ]),
          ),
          '0x01010000',
          '0x01020000',
          '0x01030000',
          '0x',
          '0x',
        ],
        cellDeps: this.options.config.codeDeps,
      });
      if (tx.outputs[6].capacity < minChange(owner) + CKB)
        throw Error('Owner needs principal, 321 CKB claim storage, fee and valid change capacity');
      const prepared = await this.options.signer.prepareTransaction(tx);
      await prepared.addCellDepsOfKnownScripts(
        this.options.client,
        mode === 'native' ? ccc.KnownScript.Secp256k1Blake160 : ccc.KnownScript.OmniLock,
      );
      await prepared.prepareSighashAllWitness(
        owner,
        mode === 'native' ? 65 : 85,
        this.options.client,
      );
      while (prepared.witnesses.length < prepared.inputs.length) prepared.witnesses.push('0x');
      const fee = prepared.estimateFee(1000n);
      if (fee > 10_000_000n || prepared.toBytes().length > 100_000)
        throw Error('Sponsored fee or transaction size exceeds its bound');
      prepared.outputs[6].capacity -= fee;
      assertFreshOperatorInputs(this.options.journal, prepared);
      const record = createRecord(
        match,
        { codeHash: type.codeHash, hashType: 'data2', args: type.args },
        prepared.hash(),
        this.options.config,
      );
      const offer: SponsorOffer = {
        version: 'sponsored-create-v1',
        offerId: randomUUID(),
        expiresAt: Math.min(this.now() + 90_000, fixture.cutoffMs - 120_000),
        fixture,
        descriptor: { ...record, entryEnabled: true },
        rawHash: prepared.hash(),
        unsignedBytes: hex(prepared.toBytes()),
        sponsorLock: scriptDTO(sponsor),
        ownerLock: scriptDTO(owner),
        sponsorInput: { txHash: fund.outPoint.txHash, index: Number(fund.outPoint.index) },
        userInputIndexes: userCells.map((_, index) => index + 1),
        reserveShannons: '305000000000',
        feeShannons: fee.toString(),
        outcome: request.outcome,
        principalShannons: request.principalShannons,
      };
      await this.validateFrozen(offer);
      this.store.save({
        version: 1,
        requestId: request.requestId,
        requestDigest: digest,
        ownerAddress: request.ownerAddress,
        createdAtMs: this.now(),
        lineageOrigins: origins.map((point) => point.toHex()),
        offer,
        state: 'offered',
      });
      return offer;
    });
  }
  private load(value: { offerId: string; rawHash: string }): SponsorEntry {
    const entry = this.store.load(sponsorId(value.offerId));
    if (!entry || entry.offer.rawHash !== hash32(value.rawHash, 'sponsor transaction hash'))
      throw Error('Unknown sponsor offer');
    const operation = this.options.journal.load(
      operationKey(
        'create',
        entry.offer.fixture.fixtureId,
        this.options.config.protocolHash,
        entry.offer.rawHash,
      ),
    );
    if (operation && !entry.signedBytes) {
      entry.signedBytes = operation.signedTransaction;
      if (entry.state !== 'cancelled') entry.state = 'signed';
      this.store.save(entry);
    }
    return entry;
  }
  private async refreshConflicts(): Promise<void> {
    const state = await canonicalSponsorConflicts(
      this.options.client,
      this.options.journal.directory,
    );
    for (const entry of this.store.all()) {
      const proof = state.proofs.get(entry.offer.rawHash);
      if (proof && (entry.state !== 'cancelled' || entry.conflictHash !== proof)) {
        entry.conflictHash = proof;
        entry.state = 'cancelled';
        this.store.save(entry);
      } else if (state.originals.has(entry.offer.rawHash) && entry.conflictHash) {
        delete entry.conflictHash;
        entry.state = 'signed';
        this.store.save(entry);
      } else if (entry.conflictHash && !proof && entry.state === 'cancelled') {
        entry.state = 'blocked';
        this.store.save(entry);
      }
    }
  }
  private async validateFrozen(offer: SponsorOffer): Promise<void> {
    const tx = ccc.Transaction.fromBytes(offer.unsignedBytes),
      sponsor = ccc.Script.from(offer.sponsorLock),
      owner = ccc.Script.from(offer.ownerLock);
    if (
      tx.hash() !== offer.rawHash ||
      tx.inputs.length < 2 ||
      tx.inputs.length > 17 ||
      tx.outputs.length !== 7 ||
      tx.outputsData.length !== 7 ||
      tx.headerDeps.length ||
      tx.inputs.some((input) => input.since !== 0n) ||
      tx.witnesses.length !== tx.inputs.length ||
      !tx.inputs[0].previousOutput.eq(offer.sponsorInput) ||
      owner.eq(sponsor) ||
      !tx.outputs[5].lock.eq(sponsor) ||
      tx.outputs[5].type ||
      tx.outputsData[5] !== '0x' ||
      !tx.outputs[6].lock.eq(owner) ||
      tx.outputs[6].type ||
      tx.outputsData[6] !== '0x'
    )
      throw Error('Invalid frozen sponsored layout');
    let sponsorCapacity = 0n,
      ownerCapacity = 0n;
    for (const [index, input] of tx.inputs.entries()) {
      const cell = await this.options.client.getCellLiveNoCache(input.previousOutput, true, true);
      if (
        !cell ||
        cell.cellOutput.type ||
        cell.outputData !== '0x' ||
        !cell.cellOutput.lock.eq(index === 0 ? sponsor : owner)
      )
        throw Error('A sponsored input changed or is not plain capacity');
      if (index === 0) sponsorCapacity = cell.cellOutput.capacity;
      else ownerCapacity += cell.cellOutput.capacity;
    }
    if (
      sponsorCapacity - tx.outputs[5].capacity !== RESERVE ||
      ownerCapacity - tx.outputs[6].capacity !==
        BigInt(offer.principalShannons) + STORAGE + BigInt(offer.feeShannons)
    )
      throw Error('Sponsored transaction violates separate net contributions');
    if (tx.outputs[5].capacity < minChange(sponsor) || tx.outputs[6].capacity < minChange(owner))
      throw Error('Sponsored change cannot occupy its cell');
  }
  async submit(value: SponsorSubmitRequest): Promise<SponsorStatus> {
    return this.options.journal.exclusive(async () => {
      const entry = this.load(value);
      if (entry.userSignedBytes && entry.userSignedBytes !== value.userSignedBytes)
        throw Error('Another owner signature is already recorded for this offer');
      if (entry.signedBytes) return this.reconcile(entry);
      if (entry.state === 'cancelled')
        throw Error('This proposal was invalidated by a canonical conflicting spend');
      if (
        !entry.userSignedBytes &&
        (entry.state !== 'offered' || this.now() >= entry.offer.expiresAt)
      )
        throw Error('Unsigned sponsor offer expired. Its signature was not accepted.');
      if (!entry.userSignedBytes) {
        const fixture = await this.describe(entry.offer.fixture.fixtureId);
        if (fixture.termsHash !== entry.offer.fixture.termsHash)
          throw Error('Pinned football fixture changed before sponsorship');
      }
      await this.validateFrozen(entry.offer);
      await verifySponsorOwnerWitness(this.options.client, entry.offer, value.userSignedBytes);
      if (!entry.userSignedBytes) {
        entry.userSignedBytes = value.userSignedBytes;
        entry.state = 'owner-signed';
        this.store.save(entry);
      }
      return this.finish(entry);
    });
  }
  private async finish(entry: SponsorEntry): Promise<SponsorStatus> {
    if (!entry.userSignedBytes) throw Error('Owner signature is required');
    const operation = this.options.journal.load(
      operationKey(
        'create',
        entry.offer.fixture.fixtureId,
        this.options.config.protocolHash,
        entry.offer.rawHash,
      ),
    );
    if (operation) {
      if (operation.transactionHash !== entry.offer.rawHash)
        throw Error('Fixture already belongs to a different signed creation');
      entry.signedBytes = operation.signedTransaction;
    } else {
      const partial = await verifySponsorOwnerWitness(
        this.options.client,
        entry.offer,
        entry.userSignedBytes,
      );
      await this.validateFrozen(entry.offer);
      assertFreshOperatorInputs(this.options.journal, partial);
      const signed = await this.options.signer.signOnlyTransaction(partial);
      if (
        signed.hash() !== entry.offer.rawHash ||
        signed.witnesses.length !== partial.witnesses.length ||
        signed.witnesses
          .slice(1)
          .some(
            (witness, index) =>
              witness !== ccc.Transaction.fromBytes(entry.userSignedBytes!).witnesses[index + 1],
          )
      )
        throw Error('Sponsor signer changed the owner transaction');
      this.options.journal.persist('create', entry.offer.descriptor, signed, this.now());
      entry.signedBytes = hex(signed.toBytes());
    }
    entry.state = 'signed';
    this.store.save(entry);
    return this.reconcile(entry, true);
  }
  private async reconcile(entry: SponsorEntry, broadcast = false): Promise<SponsorStatus> {
    if (!entry.signedBytes) return this.public(entry);
    const operation = this.options.journal.load(
      operationKey(
        'create',
        entry.offer.fixture.fixtureId,
        this.options.config.protocolHash,
        entry.offer.rawHash,
      ),
    );
    if (!operation || operation.signedTransaction !== entry.signedBytes)
      throw Error('Signed sponsor operation is missing from the funding journal');
    let state = await reconcileOperation(this.options.client, operation);
    if (broadcast && state.status === 'ready-to-rebroadcast') {
      // The owner already authorized this exact pending ticket. A late inclusion is
      // refunded by the v3 protocol; restart cannot change its immutable cutoff.
      try {
        const hash = await this.options.client.sendTransactionNoCache(
          ccc.Transaction.fromBytes(operation.signedTransaction),
          'passthrough',
        );
        if (hash !== operation.transactionHash)
          throw Error('RPC returned another transaction hash');
        state = { transactionHash: hash, status: 'pending' };
      } catch {
        entry.state = 'blocked';
        this.store.save(entry);
        return this.public(
          entry,
          'Broadcast response is unknown. Keep this exact transaction for recovery.',
        );
      }
    }
    this.options.journal.record(operation.operationId, state);
    entry.state =
      state.status === 'committed'
        ? (state.confirmations ?? 0) >= 4
          ? 'funded'
          : 'confirming'
        : state.status === 'pending'
          ? 'confirming'
          : 'blocked';
    if (entry.state === 'funded')
      await this.options.registry.publishCanonical(entry.offer.descriptor, this.options.client);
    this.store.save(entry);
    return this.public(entry);
  }
  private public(entry: SponsorEntry, message?: string): SponsorStatus {
    return {
      offer: entry.offer,
      state: entry.state,
      transactionHash: entry.offer.rawHash,
      ...(entry.signedBytes ? { signedBytes: entry.signedBytes } : {}),
      ...(message ? { message } : {}),
    };
  }
  async status(
    value: { offerId: string; rawHash: string },
    resume = false,
  ): Promise<SponsorStatus> {
    return this.options.journal.exclusive(async () => {
      await this.refreshConflicts();
      const entry = this.load(value);
      if (entry.state === 'cancelled') return this.public(entry);
      if (entry.signedBytes) return this.reconcile(entry, resume);
      if (entry.userSignedBytes) {
        if (!resume) return this.public(entry);
        try {
          return await this.finish(entry);
        } catch {
          entry.state = 'blocked';
          this.store.save(entry);
          return this.public(
            entry,
            'Submitted signature remains reserved. Reconcile before making another payment.',
          );
        }
      }
      if (entry.state === 'offered' && this.now() >= entry.offer.expiresAt) {
        entry.state = 'expired';
        this.store.save(entry);
      }
      return this.public(entry);
    });
  }
  async resolveConflict(value: {
    offerId: string;
    rawHash: string;
    conflictingTxHash: string;
  }): Promise<SponsorStatus> {
    return this.options.journal.exclusive(async () => {
      const entry = this.load(value),
        hash = hash32(value.conflictingTxHash, 'conflicting transaction hash');
      if (hash === entry.offer.rawHash) throw Error('The original transaction is not a conflict');
      const conflict = await this.options.client.getTransactionNoCache(hash);
      const original = ccc.Transaction.fromBytes(entry.offer.unsignedBytes);
      if (
        !conflict ||
        conflict.status !== 'committed' ||
        conflict.transaction.hash() !== hash ||
        !conflict.blockHash ||
        conflict.blockNumber === undefined ||
        !conflict.transaction.inputs.some(
          (input) =>
            original.inputs.some((source) => source.previousOutput.eq(input.previousOutput)) ||
            entry.lineageOrigins.includes(input.previousOutput.toHex()),
        )
      )
        throw Error('Conflict proof must spend an original input in a committed transaction');
      const header = await this.options.client.getHeaderByNumberNoCache(conflict.blockNumber),
        tip = await this.options.client.getTipHeader();
      if (header?.hash !== conflict.blockHash || tip.number < conflict.blockNumber + 3n)
        throw Error('Conflict proof needs four canonical confirmations');
      entry.conflictHash = hash;
      entry.state = 'cancelled';
      this.store.save(entry);
      return this.public(
        entry,
        'Original bytes retained. A canonical conflicting spend prevents this proposal from committing.',
      );
    });
  }
  /** Operator-owned background recovery, independent of an app session or browser. */
  async recoverPending(
    limit = 4,
  ): Promise<{ offerId: string; state: SponsorState; needsReview: boolean }[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 4)
      throw Error('Sponsor recovery batch exceeds its bound');
    const pending = this.store
      .all()
      .filter((entry) => entry.userSignedBytes && entry.state !== 'funded');
    if (!pending.length) return [];
    const output: { offerId: string; state: SponsorState; needsReview: boolean }[] = [];
    for (let offset = 0; offset < Math.min(limit, pending.length); offset++) {
      const entry = pending[(this.recoveryCursor + offset) % pending.length];
      let status: SponsorStatus;
      try {
        status = await this.status(
          { offerId: entry.offer.offerId, rawHash: entry.offer.rawHash },
          true,
        );
      } catch {
        output.push({ offerId: entry.offer.offerId, state: 'blocked', needsReview: true });
        continue;
      }
      if (status.state === 'blocked') {
        const original = ccc.Transaction.fromBytes(entry.offer.unsignedBytes);
        let missing = false;
        for (const input of original.inputs)
          if (!(await this.options.client.getCellLiveNoCache(input.previousOutput, false, true))) {
            missing = true;
            break;
          }
        if (missing) {
          try {
            const hash = await this.findConflict(entry);
            if (hash)
              status = await this.resolveConflict({
                offerId: entry.offer.offerId,
                rawHash: entry.offer.rawHash,
                conflictingTxHash: hash,
              });
          } catch {
            /* Bounded history or unavailable RPC requires explicit operator review. */
          }
        }
      }
      output.push({
        offerId: entry.offer.offerId,
        state: status.state,
        needsReview: status.state === 'blocked',
      });
    }
    this.recoveryCursor = (this.recoveryCursor + Math.min(limit, pending.length)) % pending.length;
    return output;
  }
  private async findConflict(entry: SponsorEntry): Promise<string | undefined> {
    const original = ccc.Transaction.fromBytes(entry.offer.unsignedBytes),
      targets = new Set([
        ...original.inputs.map((input) => input.previousOutput.toHex()),
        ...entry.lineageOrigins,
      ]);
    const checked = new Set<string>();
    // At most 64 indexer rows and 64 complete transaction reads over two lock groups.
    // A deeper history is surfaced for explicit recovery, never assumed conflict-free.
    for (const lock of [entry.offer.ownerLock, entry.offer.sponsorLock]) {
      const page = await this.options.client.findTransactionsPaged(
        { script: lock, scriptType: 'lock', scriptSearchMode: 'exact', groupByTransaction: false },
        'desc',
        32,
      );
      if (page.transactions.length > 32)
        throw Error('Conflict indexer page exceeds its requested bound');
      for (const row of page.transactions) {
        if (!row.isInput || row.txHash === entry.offer.rawHash || checked.has(row.txHash)) continue;
        checked.add(row.txHash);
        const candidate = await this.options.client.getTransactionNoCache(row.txHash);
        if (
          !candidate ||
          candidate.status !== 'committed' ||
          candidate.transaction.hash() !== row.txHash ||
          !candidate.blockHash ||
          candidate.blockNumber === undefined ||
          candidate.transaction.inputs.length > 64 ||
          !candidate.transaction.inputs.some((input) => targets.has(input.previousOutput.toHex()))
        )
          continue;
        const canonical = await this.options.client.getHeaderByNumberNoCache(candidate.blockNumber),
          tip = await this.options.client.getTipHeader();
        if (canonical?.hash === candidate.blockHash && tip.number >= candidate.blockNumber + 3n)
          return row.txHash;
      }
    }
    return undefined;
  }
}

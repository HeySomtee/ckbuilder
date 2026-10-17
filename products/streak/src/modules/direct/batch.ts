import * as ccc from '@ckb-ccc/core';
import { createHash, randomUUID } from 'node:crypto';
import type { Match } from '../../types';
import type {
  BatchOffer,
  BatchOfferRequest,
  BatchLine,
  BatchInput,
} from '../../../shared/batch-wire';
import {
  SponsorService,
  parseSponsorRequest,
  sponsoredWalletMode,
  type SponsorOffer,
  type SponsorOptions,
  type DemandFixture,
} from './sponsor';
import { sponsorStores, canonicalSponsorConflicts } from './sponsor-journal';
import { operationKey } from './journal';
import { operatorFundingBarrier, assertFreshOperatorInputs } from './cli';
import { loadOperatorMarket } from './operator';
import {
  createRecord,
  object,
  hash32,
  V4_DIRECT_CONFIG,
  type DirectMarketRecord,
} from './registry';
import { sponsoredOriginDescendant } from './sponsor-lineage';

const CKB = 100_000_000n,
  RESERVE = 3050n * CKB,
  SHARD = 610n * CKB,
  STORAGE = 321n * CKB;
const hex = (bytes: Uint8Array) => ccc.hexFrom(bytes);
const raw = (value: string) => Buffer.from(value.slice(2), 'hex');
const le = (value: bigint) => {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(value);
  return bytes;
};
const script = (value: ccc.Script) => ({
  codeHash: value.codeHash,
  hashType: value.hashType,
  args: value.args,
});
const point = (value: ccc.OutPoint) => ({ txHash: value.txHash, index: Number(value.index) });
const minChange = (lock: ccc.Script) =>
  BigInt(ccc.CellOutput.from({ capacity: 0n, lock }).occupiedSize) * CKB;
const snapshot = (cell: ccc.Cell): BatchInput => ({
  outPoint: point(cell.outPoint),
  capacityShannons: cell.cellOutput.capacity.toString(),
  lock: script(cell.cellOutput.lock),
  ...(cell.cellOutput.type ? { type: script(cell.cellOutput.type) } : {}),
  data: cell.outputData,
});
const ticket = (owner: ccc.Script, outcome: number, principal: bigint) =>
  Buffer.concat([raw(owner.hash()), Buffer.from([outcome]), le(principal)]);

export function parseBatchRequest(value: unknown): BatchOfferRequest {
  const row = object(value, 'atomic prediction request');
  if (!Array.isArray(row.picks) || row.picks.length < 1 || row.picks.length > 8)
    throw Error('Atomic payment requires one to eight independent predictions');
  const parsed = row.picks.map((pick) =>
    parseSponsorRequest({
      ...object(pick, 'prediction'),
      requestId: row.requestId,
      ownerAddress: row.ownerAddress,
      userInputs: row.userInputs,
    }),
  );
  if (new Set(parsed.map((pick) => pick.fixtureId)).size !== parsed.length)
    throw Error('An atomic slip cannot repeat a fixture');
  return {
    requestId: parsed[0].requestId,
    ownerAddress: parsed[0].ownerAddress,
    userInputs: parsed[0].userInputs,
    picks: parsed.map(({ fixtureId, termsHash, outcome, principalShannons }) => ({
      fixtureId,
      termsHash,
      outcome,
      principalShannons,
    })),
  };
}
export function atomicOffer(value: SponsorOffer): BatchOffer {
  const offer = value as BatchOffer;
  if (
    offer.version !== 'atomic-predictions-v1' ||
    !Array.isArray(offer.lines) ||
    offer.lines.length < 1 ||
    offer.lines.length > 8 ||
    !Array.isArray(offer.inputs) ||
    offer.inputs.length < 2 ||
    offer.inputs.length > 25
  )
    throw Error('Invalid atomic offer');
  return offer;
}

/** Reuses the same reviewed co-signing, durable recovery and conflict engine as v3. */
export class BatchService extends SponsorService {
  constructor(options: SponsorOptions) {
    super(options, 'atomic-v4');
    options.registry.publicationTargets = options.existingRegistry ?? [];
  }
  protected operationFor(offer: SponsorOffer) {
    return this.options.journal.load(
      operationKey(
        'batch',
        offer.fixture.fixtureId,
        this.options.config.protocolHash,
        offer.rawHash,
      ),
    );
  }
  protected persistSigned(value: SponsorOffer, signed: ccc.Transaction): void {
    const offer = atomicOffer(value);
    this.options.journal.persist(
      'batch',
      offer.descriptor,
      signed,
      this.now(),
      offer.lines.filter((line) => line.mode === 'create').map((line) => line.descriptor),
    );
  }
  protected async publish(value: SponsorOffer): Promise<void> {
    for (const line of atomicOffer(value).lines)
      if (line.mode === 'create')
        await this.options.registry.publishCanonical(line.descriptor, this.options.client);
  }
  protected async validateInitial(value: SponsorOffer): Promise<void> {
    const lines = atomicOffer(value).lines;
    const fixtures = await this.readFixtures(lines.map((line) => line.fixture.fixtureId));
    for (const [index, line] of lines.entries()) {
      const match = fixtures[index];
      const current = await this.describeMatch(match);
      if (current.termsHash !== line.fixture.termsHash)
        throw Error('Fixture terms changed. Review the complete slip again.');
      if (line.mode === 'create' && (await this.oldPoolHasPositions(line.fixture.fixtureId)))
        throw Error(
          'This fixture has positions in an earlier pool. Its original claims remain available.',
        );
    }
  }
  private async readFixtures(ids: string[]): Promise<Match[]> {
    if (this.options.fixtures) {
      const matches = await this.options.fixtures(ids);
      if (matches.length !== ids.length) throw Error('Incomplete fresh fixture batch');
      return matches.map((match, index) => this.validateFixture(ids[index], match));
    }
    const matches: Match[] = [];
    for (let offset = 0; offset < ids.length; offset += 4) {
      const results = await Promise.allSettled(
        ids.slice(offset, offset + 4).map((id) => this.fixture(id)),
      );
      const failed = results.find((result) => result.status === 'rejected');
      if (failed?.status === 'rejected') throw failed.reason;
      for (const result of results) if (result.status === 'fulfilled') matches.push(result.value);
    }
    return matches;
  }
  async configuration() {
    const base = await super.configuration();
    const conflicts = await canonicalSponsorConflicts(
      this.options.client,
      this.options.journal.directory,
    );
    const retiredCreations = this.options.registry
      .all()
      .filter((record) => conflicts.resolved.has(record.creationTxHash))
      .map((record) => ({ fixtureId: record.fixtureId, creationTxHash: record.creationTxHash }));
    return {
      ...base,
      ...(retiredCreations.length ? { retiredCreations } : {}),
      reservations: this.store
        .active(this.now())
        .filter(
          (entry) =>
            !['funded', 'cancelled'].includes(entry.state) &&
            !conflicts.resolved.has(entry.offer.rawHash),
        )
        .flatMap((entry) =>
          atomicOffer(entry.offer).lines.map((line) => ({
            fixtureId: line.fixture.fixtureId,
            state: entry.signedBytes ? ('confirming' as const) : ('reserved' as const),
          })),
        ),
    };
  }
  protected async describeMatch(match: Match): Promise<DemandFixture> {
    const fixture = await super.describeMatch(match);
    const selected = this.options.registry.get(match.id);
    const conflicts = selected
      ? await canonicalSponsorConflicts(this.options.client, this.options.journal.directory)
      : undefined;
    const current =
      selected && !conflicts?.resolved.has(selected.creationTxHash) ? selected : undefined;
    delete fixture.descriptor;
    // Earlier instances are retained separately. They are inspected on-chain before new creation.
    return {
      ...fixture,
      state: current
        ? 'funded'
        : this.options.config.codeDeps.length === 2
          ? 'available'
          : 'unavailable',
      ...(current
        ? {
            descriptor: {
              ...current,
              entryEnabled:
                current.cutoffMs === Date.parse(match.kickoff) && this.now() < current.cutoffMs,
            },
          }
        : {}),
    };
  }
  private async oldPoolHasPositions(id: string): Promise<boolean> {
    for (const registry of this.options.existingRegistry ?? []) {
      const old = registry.get(id);
      if (!old || old.type.codeHash === this.options.config.protocolHash) continue;
      const state = await loadOperatorMarket(this.options.client, old);
      if (state.closed) continue;
      if (!state.market || state.shards.filter(Boolean).length !== 4)
        throw Error('Earlier market state is unavailable; preserve its existing positions');
      if (
        state.shards.some(({ cell }) => {
          const data = raw(cell.outputData);
          return data[2] > 0 || data[3] > 0;
        })
      )
        return true;
    }
    return false;
  }
  async prepareOffer(value: unknown): Promise<BatchOffer> {
    const request = parseBatchRequest(value),
      digest = `0x${createHash('sha256').update(JSON.stringify(request)).digest('hex')}`;
    return this.options.journal.exclusive(async () => {
      const prior = this.store.all().find((entry) => entry.requestId === request.requestId);
      if (prior) {
        if (prior.requestDigest !== digest) throw Error('Request identity belongs to another slip');
        return atomicOffer(prior.offer);
      }
      this.options.journal.assertAvailableSlot();
      if (
        this.options.config.protocolHash !== V4_DIRECT_CONFIG.protocolHash ||
        this.options.config.codeDeps.length !== 2
      )
        throw Error('Sponsored contract deployment is not ready');
      await this.refreshConflicts();
      for (const store of sponsorStores(this.options.journal.directory))
        for (const entry of store.active(this.now()))
          if (
            entry.state === 'offered' &&
            !entry.userSignedBytes &&
            entry.ownerAddress === request.ownerAddress
          ) {
            entry.state = 'cancelled';
            store.save(entry);
          }
      const barrier = await operatorFundingBarrier(
        this.options.client,
        this.options.journal,
        this.options.registry,
      );
      if (!barrier.clear)
        throw Error('Sponsor funding is awaiting canonical confirmation or recovery');
      const conflicts = await canonicalSponsorConflicts(
        this.options.client,
        this.options.journal.directory,
      );
      if (conflicts.uncertain)
        throw Error('Sponsor funding is awaiting canonical confirmation or recovery');
      const matching = this.store
        .all()
        .filter(
          (entry) =>
            entry.signedBytes &&
            atomicOffer(entry.offer).lines.some(
              (line) =>
                request.picks.some((pick) => pick.fixtureId === line.fixture.fixtureId) &&
                line.mode === 'create',
            ),
        );
      const attempts = matching.filter((entry) => conflicts.resolved.has(entry.offer.rawHash));
      if (attempts.filter((entry) => entry.createdAtMs > this.now() - 60_000).length >= 3)
        throw Error('This fixture has reached its sponsored retry window. Retry after one minute.');
      const origins = [
        ...new Map(
          attempts.map((entry) => {
            const p = ccc.OutPoint.from(entry.offer.sponsorInput);
            return [p.toHex(), p] as const;
          }),
        ).values(),
      ];
      if (origins.length > 64) throw Error('Atomic funding lineage needs bounded manual recovery');
      const owner = (await ccc.Address.fromString(request.ownerAddress, this.options.client))
          .script,
        sponsor = (await this.options.signer.getRecommendedAddressObj()).script;
      if (owner.eq(sponsor) || ccc.bytesFrom(sponsor.args).length > 59)
        throw Error('Invalid separate sponsor and owner wallet groups');
      const mode = await sponsoredWalletMode(this.options.client, owner);
      const userCells: ccc.Cell[] = [];
      for (const input of request.userInputs) {
        const cell = await this.options.client.getCellLiveNoCache(input, true, true);
        if (
          !cell ||
          cell.cellOutput.type ||
          cell.outputData !== '0x' ||
          !cell.cellOutput.lock.eq(owner)
        )
          throw Error('Owner input must be live plain capacity controlled by the connected wallet');
        userCells.push(cell);
      }
      const preparedLines: {
        match: Match;
        fixture: DemandFixture;
        record?: DirectMarketRecord;
        cell?: ccc.Cell;
        header?: ccc.ClientBlockHeader;
        control?: ccc.Cell;
      }[] = [];
      const fixtures = await this.readFixtures(request.picks.map((pick) => pick.fixtureId));
      for (const [index, pick] of request.picks.entries()) {
        const match = fixtures[index],
          fixture = await this.describeMatch(match),
          selected = this.options.registry.get(pick.fixtureId);
        const record =
          selected && !conflicts.resolved.has(selected.creationTxHash) ? selected : undefined;
        if (fixture.termsHash !== pick.termsHash)
          throw Error('Fixture terms changed. Review the complete slip again.');
        if (record) {
          if (
            record.type.codeHash !== this.options.config.protocolHash ||
            record.termsHash !== pick.termsHash
          )
            throw Error('This fixture belongs to another funded pool');
          const market = await loadOperatorMarket(this.options.client, record, this.options.config);
          if (!market.market || market.market.cell.outputData !== '0x0000ff' || market.closed)
            throw Error('This fixture is closed to new predictions');
          const shard = market.shards.find((entry) => {
            if (!entry) return false;
            const data = raw(entry.cell.outputData);
            return (
              data[2] + data[3] < 8 &&
              (!data[3] || entry.header.timestamp < BigInt(record.cutoffMs))
            );
          });
          if (!shard) throw Error('This fixture has no available prediction slot');
          preparedLines.push({
            match,
            fixture,
            record,
            cell: shard.cell,
            header: shard.header,
            control: market.market.cell,
          });
        } else {
          if (
            matching.some(
              (entry) =>
                !conflicts.resolved.has(entry.offer.rawHash) &&
                atomicOffer(entry.offer).lines.some(
                  (line) => line.fixture.fixtureId === pick.fixtureId && line.mode === 'create',
                ),
            )
          )
            throw Error('A previous atomic creation still requires recovery');
          if (await this.oldPoolHasPositions(pick.fixtureId))
            throw Error(
              'This fixture has positions in an earlier pool. Its original claims remain available.',
            );
          preparedLines.push({ match, fixture });
        }
      }
      const creations = preparedLines.filter((line) => !line.record).length;
      const newFiles = preparedLines.filter(
        (line) => !line.record && !this.options.registry.get(line.fixture.fixtureId),
      ).length;
      if (this.options.registry.all().length + newFiles > 256)
        throw Error(
          'Streak is at its current testnet market limit. Existing claims remain available.',
        );
      const reserve = BigInt(creations) * RESERVE;
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
      if (page.cells.length > 64) throw Error('Sponsor funding page exceeded its bound');
      const candidates = [
        ...origins.slice(-1),
        ...page.cells
          .filter(
            (cell) =>
              !cell.cellOutput.type &&
              cell.outputData === '0x' &&
              cell.cellOutput.capacity >= reserve + minChange(sponsor),
          )
          .sort((a, b) => (a.cellOutput.capacity > b.cellOutput.capacity ? -1 : 1))
          .slice(0, 4)
          .map((cell) => cell.outPoint),
      ];
      let fund: ccc.Cell | undefined;
      for (const candidate of candidates) {
        const live = await this.options.client.getCellLiveNoCache(candidate, true, true);
        if (
          live &&
          !live.cellOutput.type &&
          live.outputData === '0x' &&
          live.cellOutput.lock.eq(sponsor) &&
          live.cellOutput.capacity >= reserve + minChange(sponsor) &&
          (await sponsoredOriginDescendant(this.options.client, live.outPoint, origins))
        ) {
          fund = live;
          break;
        }
      }
      if (!fund)
        throw Error('Streak needs additional testnet capacity to sponsor the complete slip');
      const cells = [fund, ...userCells],
        tx = ccc.Transaction.from({
          inputs: cells.map((cell) => ({ previousOutput: cell.outPoint, since: 0n })),
          cellDeps: this.options.config.codeDeps,
        }),
        lines: BatchLine[] = [];
      const principal = request.picks.reduce(
          (sum, pick) => sum + BigInt(pick.principalShannons),
          0n,
        ),
        storage = BigInt(request.picks.length) * STORAGE;
      for (const [index, source] of preparedLines.entries()) {
        const pick = request.picks[index],
          amount = BigInt(pick.principalShannons),
          base = tx.outputs.length;
        if (!source.record) {
          const outputBase = Buffer.alloc(4);
          outputBase.writeUInt32LE(base);
          const args = hex(
            Buffer.concat([
              raw(ccc.hashCkb(fund.outPoint.toBytes())),
              outputBase,
              raw(sponsor.hash()),
              le(BigInt(source.fixture.cutoffMs)),
              raw(this.options.config.guardHash),
              raw(sponsor.hash()),
              raw(sponsor.hash()),
            ]),
          );
          const type = ccc.Script.from({
              codeHash: this.options.config.protocolHash,
              hashType: 'data2',
              args,
            }),
            guard = {
              codeHash: this.options.config.guardHash,
              hashType: 'data2' as const,
              args: type.hash(),
            };
          for (let shard = -1; shard < 4; shard++) {
            tx.outputs.push(
              ccc.CellOutput.from({
                capacity: SHARD + (shard === 0 ? amount + STORAGE : 0n),
                type,
                lock: guard,
              }),
            );
            tx.outputsData.push(
              shard < 0
                ? '0x0000ff'
                : shard === 0
                  ? hex(
                      Buffer.concat([
                        Buffer.from([1, 0, 0, 1]),
                        ticket(owner, pick.outcome, amount),
                      ]),
                    )
                  : hex(Buffer.from([1, shard, 0, 0])),
            );
          }
          lines.push({
            fixture: source.fixture,
            descriptor: {
              ...createRecord(
                source.match,
                { codeHash: type.codeHash, hashType: 'data2', args },
                `0x${'00'.repeat(32)}`,
                this.options.config,
              ),
              entryEnabled: true,
            },
            mode: 'create',
            outcome: pick.outcome,
            principalShannons: pick.principalShannons,
            shard: 0,
            outputIndex: base,
            outputCount: 5,
          });
        } else {
          const cell = source.cell!,
            data = raw(cell.outputData),
            inputIndex = cells.length;
          cells.push(cell);
          tx.inputs.push(ccc.CellInput.from({ previousOutput: cell.outPoint, since: 0n }));
          tx.outputs.push(
            ccc.CellOutput.from({
              capacity: cell.cellOutput.capacity + amount + STORAGE,
              type: cell.cellOutput.type!,
              lock: cell.cellOutput.lock,
            }),
          );
          tx.outputsData.push(
            hex(
              Buffer.concat([
                Buffer.from([1, data[1], data[2] + data[3], 1]),
                data.subarray(4),
                ticket(owner, pick.outcome, amount),
              ]),
            ),
          );
          tx.cellDeps.push(
            ccc.CellDep.from({ outPoint: source.control!.outPoint, depType: 'code' }),
          );
          if (!tx.headerDeps.includes(source.header!.hash)) tx.headerDeps.push(source.header!.hash);
          lines.push({
            fixture: source.fixture,
            descriptor: { ...source.record, entryEnabled: true },
            mode: 'deposit',
            outcome: pick.outcome,
            principalShannons: pick.principalShannons,
            shard: data[1],
            outputIndex: base,
            outputCount: 1,
            shardInputIndex: inputIndex,
            controlDep: point(source.control!.outPoint),
            headerHash: source.header!.hash,
          });
        }
      }
      const sponsorChangeOutputIndex = tx.outputs.length,
        ownerChangeOutputIndex = sponsorChangeOutputIndex + 1;
      const ownerCapacity = userCells.reduce((sum, cell) => sum + cell.cellOutput.capacity, 0n);
      if (ownerCapacity < principal + storage + minChange(owner) + CKB)
        throw Error('Owner needs principal, 321 CKB per prediction, fee and valid change capacity');
      tx.outputs.push(
        ccc.CellOutput.from({ capacity: fund.cellOutput.capacity - reserve, lock: sponsor }),
        ccc.CellOutput.from({ capacity: ownerCapacity - principal - storage, lock: owner }),
      );
      tx.outputsData.push('0x', '0x');
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
        throw Error('Atomic payment fee or size exceeds its reviewed bound');
      prepared.outputs[ownerChangeOutputIndex].capacity -= fee;
      for (const line of lines)
        if (line.mode === 'create') line.descriptor.creationTxHash = prepared.hash();
      const offer: BatchOffer = {
        version: 'atomic-predictions-v1',
        offerId: randomUUID(),
        expiresAt: Math.min(
          this.now() + 90_000,
          ...lines.map((line) => line.fixture.cutoffMs - 120_000),
        ),
        rawHash: prepared.hash(),
        unsignedBytes: hex(prepared.toBytes()),
        sponsorLock: script(sponsor),
        ownerLock: script(owner),
        sponsorInput: point(fund.outPoint),
        userInputIndexes: userCells.map((_, index) => index + 1),
        inputs: cells.map(snapshot),
        lines,
        reserveShannons: reserve.toString(),
        principalShannons: principal.toString(),
        storageShannons: storage.toString(),
        feeShannons: fee.toString(),
        sponsorChangeOutputIndex,
        ownerChangeOutputIndex,
        fixture: lines[0].fixture,
        descriptor: lines[0].descriptor,
        outcome: lines[0].outcome,
      };
      assertFreshOperatorInputs(this.options.journal, prepared);
      await this.validateFrozen(offer);
      this.store.save({
        version: 1,
        requestId: request.requestId,
        requestDigest: digest,
        ownerAddress: request.ownerAddress,
        createdAtMs: this.now(),
        lineageOrigins: origins.map((origin) => origin.toHex()),
        offer,
        state: 'offered',
      });
      return offer;
    });
  }
  protected async validateFrozen(value: SponsorOffer): Promise<void> {
    const offer = atomicOffer(value),
      tx = ccc.Transaction.fromBytes(offer.unsignedBytes),
      owner = ccc.Script.from(offer.ownerLock),
      sponsor = ccc.Script.from(offer.sponsorLock);
    if (
      tx.hash() !== offer.rawHash ||
      tx.inputs.length !== offer.inputs.length ||
      tx.inputs.length !==
        1 +
          offer.userInputIndexes.length +
          offer.lines.filter((line) => line.mode === 'deposit').length ||
      tx.witnesses.length !== tx.inputs.length ||
      tx.inputs.some((input) => input.since !== 0n) ||
      owner.eq(sponsor) ||
      !tx.inputs[0].previousOutput.eq(offer.sponsorInput) ||
      offer.userInputIndexes.some((index, i) => index !== i + 1) ||
      new Set(tx.inputs.map((input) => input.previousOutput.toHex())).size !== tx.inputs.length
    )
      throw Error('Invalid frozen atomic input layout');
    const live: ccc.Cell[] = [];
    for (const [index, input] of tx.inputs.entries()) {
      const cell = await this.options.client.getCellLiveNoCache(input.previousOutput, true, true);
      if (!cell || JSON.stringify(snapshot(cell)) !== JSON.stringify(offer.inputs[index]))
        throw Error('Atomic input changed from its reviewed output');
      live.push(cell);
      if (
        index <= offer.userInputIndexes.length &&
        (cell.cellOutput.type ||
          cell.outputData !== '0x' ||
          !cell.cellOutput.lock.eq(index === 0 ? sponsor : owner))
      )
        throw Error('Atomic funding input is not the required plain wallet capacity');
    }
    let next = 0,
      principal = 0n,
      reserve = 0n;
    const headers: string[] = [];
    const assertOutput = (
      index: number,
      capacity: bigint,
      lock: ccc.ScriptLike,
      type: ccc.ScriptLike | undefined,
      data: string,
    ) => {
      if (
        tx.outputs[index]?.toHex() !== ccc.CellOutput.from({ capacity, lock, type }).toHex() ||
        tx.outputsData[index] !== data
      )
        throw Error('Atomic output differs from the independent prediction rules');
    };
    for (const line of offer.lines) {
      if (
        line.outputIndex !== next ||
        line.fixture.termsHash !== line.descriptor.termsHash ||
        line.fixture.fixtureId !== line.descriptor.fixtureId ||
        line.fixture.cutoffMs !== line.descriptor.cutoffMs ||
        line.descriptor.type.codeHash !== this.options.config.protocolHash ||
        ![0, 1, 2].includes(line.outcome)
      )
        throw Error('Atomic line identity or ordering differs');
      const amount = BigInt(line.principalShannons);
      if (amount < 100n * CKB || amount > 1_000_000n * CKB)
        throw Error('Atomic principal exceeds its bound');
      principal += amount;
      const type = ccc.Script.from(line.descriptor.type),
        guard = ccc.Script.from({
          codeHash: this.options.config.guardHash,
          hashType: 'data2',
          args: type.hash(),
        });
      if (line.mode === 'create') {
        const args = raw(type.args),
          base = Buffer.alloc(4);
        base.writeUInt32LE(next);
        if (
          line.outputCount !== 5 ||
          line.shard !== 0 ||
          line.descriptor.creationTxHash !== tx.hash() ||
          hex(args) !==
            hex(
              Buffer.concat([
                raw(ccc.hashCkb(tx.inputs[0].previousOutput.toBytes())),
                base,
                raw(sponsor.hash()),
                le(BigInt(line.fixture.cutoffMs)),
                raw(this.options.config.guardHash),
                raw(sponsor.hash()),
                raw(sponsor.hash()),
              ]),
            )
        )
          throw Error('Atomic genesis authorization differs');
        assertOutput(next, SHARD, guard, type, '0x0000ff');
        for (let shard = 0; shard < 4; shard++)
          assertOutput(
            next + 1 + shard,
            SHARD + (shard === 0 ? amount + STORAGE : 0n),
            guard,
            type,
            shard === 0
              ? hex(Buffer.concat([Buffer.from([1, 0, 0, 1]), ticket(owner, line.outcome, amount)]))
              : hex(Buffer.from([1, shard, 0, 0])),
          );
        reserve += RESERVE;
        next += 5;
      } else {
        if (
          line.outputCount !== 1 ||
          line.shardInputIndex === undefined ||
          line.shardInputIndex <= offer.userInputIndexes.length ||
          !line.controlDep ||
          !line.headerHash
        )
          throw Error('Atomic deposit references are missing');
        const input = live[line.shardInputIndex],
          data = raw(input.outputData),
          control = await this.options.client.getCellLiveNoCache(line.controlDep, true, true);
        if (
          !input.cellOutput.type?.eq(type) ||
          !input.cellOutput.lock.eq(guard) ||
          data.length !== 4 + 41 * (data[2] + data[3]) ||
          data[0] !== 1 ||
          data[1] !== line.shard ||
          data[2] + data[3] >= 8 ||
          data[3] > 1 ||
          !control?.cellOutput.type?.eq(type) ||
          !control.cellOutput.lock.eq(guard) ||
          control.outputData !== '0x0000ff' ||
          !tx.cellDeps.some((dep) => dep.depType === 'code' && dep.outPoint.eq(line.controlDep!))
        )
          throw Error('Atomic deposit market is not open or has changed');
        const creation = await this.options.client.getTransactionNoCache(input.outPoint.txHash),
          header =
            creation?.blockNumber !== undefined
              ? await this.options.client.getHeaderByNumberNoCache(creation.blockNumber)
              : undefined;
        if (
          creation?.status !== 'committed' ||
          creation.transaction.hash() !== input.outPoint.txHash ||
          header?.hash !== line.headerHash ||
          header.hash !== creation.blockHash ||
          (data[3] && header.timestamp >= BigInt(line.fixture.cutoffMs))
        )
          throw Error('Atomic deposit header is not eligible and canonical');
        if (!headers.includes(line.headerHash)) headers.push(line.headerHash);
        assertOutput(
          next,
          input.cellOutput.capacity + amount + STORAGE,
          guard,
          type,
          hex(
            Buffer.concat([
              Buffer.from([1, data[1], data[2] + data[3], 1]),
              data.subarray(4),
              ticket(owner, line.outcome, amount),
            ]),
          ),
        );
        next++;
      }
    }
    if (
      new Set(offer.lines.map((line) => line.fixture.fixtureId)).size !== offer.lines.length ||
      JSON.stringify(tx.headerDeps) !== JSON.stringify(headers) ||
      offer.sponsorChangeOutputIndex !== next ||
      offer.ownerChangeOutputIndex !== next + 1 ||
      tx.outputs.length !== next + 2 ||
      tx.outputsData.length !== next + 2
    )
      throw Error('Atomic output or header count differs');
    const storage = BigInt(offer.lines.length) * STORAGE,
      fee = BigInt(offer.feeShannons),
      ownerCapacity = live
        .slice(1, 1 + offer.userInputIndexes.length)
        .reduce((sum, cell) => sum + cell.cellOutput.capacity, 0n);
    if (
      fee < 0n ||
      fee > 10_000_000n ||
      reserve.toString() !== offer.reserveShannons ||
      principal.toString() !== offer.principalShannons ||
      storage.toString() !== offer.storageShannons
    )
      throw Error('Atomic aggregate amounts differ');
    assertOutput(next, live[0].cellOutput.capacity - reserve, sponsor, undefined, '0x');
    assertOutput(next + 1, ownerCapacity - principal - storage - fee, owner, undefined, '0x');
    if (
      tx.outputs[next].capacity < minChange(sponsor) ||
      tx.outputs[next + 1].capacity < minChange(owner) ||
      live.reduce((sum, cell) => sum + cell.cellOutput.capacity, 0n) -
        tx.outputs.reduce((sum, output) => sum + output.capacity, 0n) !==
        fee
    )
      throw Error('Atomic separate net contributions differ');
    for (const dep of this.options.config.codeDeps)
      if (!tx.cellDeps.some((actual) => actual.eq(dep)))
        throw Error('Atomic protocol dependencies are missing');
  }
}

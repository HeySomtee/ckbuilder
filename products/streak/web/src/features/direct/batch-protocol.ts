import { ccc } from '@ckb-ccc/core';
import {
  BATCH_PROTOCOL_HASH,
  CKB,
  MIN_PRINCIPAL,
  STORAGE,
  assertSameTerms,
  hex,
  integer,
  object,
  parseDescriptor,
  text,
} from './protocol.ts';
import {
  offerId,
  parseDemandFixture,
  sameFixture,
  script,
  shannons,
  transactionBytes,
  SPONSOR_MAX_FEE,
  SPONSOR_RESERVE,
} from './sponsored-protocol.ts';
import type {
  BatchFixture,
  BatchOffer,
  BatchLine,
  BatchInput,
  BatchStatus,
} from '../../../../shared/batch-wire';
export type {
  BatchFixture,
  BatchOffer,
  BatchLine,
  BatchInput,
  BatchStatus,
  BatchTransport,
} from '../../../../shared/batch-wire';
function parsePoint(value: unknown) {
  const p = object(value);
  return { txHash: hex(p.txHash, 32), index: integer(p.index, 0, 0xffffffff) };
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
export async function parseBatchFixture(value: unknown): Promise<BatchFixture> {
  const fixture = await parseDemandFixture(value);
  if (fixture.descriptor && fixture.descriptor.type.codeHash !== BATCH_PROTOCOL_HASH)
    throw Error(
      'This market uses a separate payment version. Keep it separate from the combined slip.',
    );
  return fixture;
}
export async function parseBatchOffer(value: unknown): Promise<BatchOffer> {
  const row = object(value),
    tx = ccc.Transaction.fromBytes(transactionBytes(row.unsignedBytes));
  if (
    row.version !== 'atomic-predictions-v1' ||
    !Array.isArray(row.lines) ||
    row.lines.length < 1 ||
    row.lines.length > 8 ||
    !Array.isArray(row.userInputIndexes) ||
    row.userInputIndexes.length < 1 ||
    row.userInputIndexes.length > 16 ||
    row.userInputIndexes.some((index, at) => index !== at + 1) ||
    !Array.isArray(row.inputs) ||
    row.inputs.length !== tx.inputs.length ||
    tx.inputs.length > 25
  )
    throw Error('Invalid combined prediction layout.');
  const rawHash = hex(row.rawHash, 32),
    sponsorLock = script(row.sponsorLock),
    ownerLock = script(row.ownerLock);
  if (rawHash !== tx.hash() || ccc.Script.from(sponsorLock).eq(ownerLock))
    throw Error('Invalid combined payment identity.');
  const sponsorInput = parsePoint(row.sponsorInput);
  if (!tx.inputs[0]?.previousOutput.eq(sponsorInput))
    throw Error('The sponsor funding input changed.');
  let nextOutput = 0;
  const lines: BatchLine[] = [];
  for (const value of row.lines) {
    const line = object(value),
      fixture = await parseBatchFixture(line.fixture),
      descriptor = await parseDescriptor(line.descriptor);
    const mode = line.mode;
    if (
      (mode !== 'create' && mode !== 'deposit') ||
      descriptor.type.codeHash !== BATCH_PROTOCOL_HASH ||
      descriptor.fixtureId !== fixture.fixtureId ||
      descriptor.termsHash !== fixture.termsHash ||
      descriptor.cutoffMs !== fixture.cutoffMs ||
      !ccc.Script.from(fixture.sponsorLock).eq(sponsorLock) ||
      line.outputIndex !== nextOutput ||
      line.outputCount !== (mode === 'create' ? 5 : 1) ||
      !descriptor.entryEnabled
    )
      throw Error('Combined prediction terms or output groups changed.');
    const principalShannons = shannons(line.principalShannons),
      principal = BigInt(principalShannons);
    if (principal < MIN_PRINCIPAL || principal > 1_000_000n * CKB)
      throw Error('Each prediction must stake between 100 and 1,000,000 testnet CKB.');
    const shard = integer(line.shard, 0, 3);
    if (mode === 'create') {
      if (
        descriptor.creationTxHash !== rawHash ||
        shard !== 0 ||
        fixture.descriptor ||
        line.shardInputIndex !== undefined ||
        line.controlDep !== undefined ||
        line.headerHash !== undefined
      )
        throw Error('New market creation must match its exact first prediction.');
    } else {
      if (!fixture.descriptor) throw Error('Existing market terms are missing.');
      assertSameTerms(descriptor, fixture.descriptor);
    }
    lines.push({
      fixture,
      descriptor,
      mode,
      outcome: integer(line.outcome, 0, 2) as 0 | 1 | 2,
      principalShannons,
      shard,
      outputIndex: nextOutput,
      outputCount: mode === 'create' ? 5 : 1,
      ...(mode === 'deposit'
        ? {
            shardInputIndex: integer(
              line.shardInputIndex,
              1 + row.userInputIndexes.length,
              tx.inputs.length - 1,
            ),
            controlDep: parsePoint(line.controlDep),
            headerHash: hex(line.headerHash, 32),
          }
        : {}),
    });
    nextOutput += mode === 'create' ? 5 : 1;
  }
  if (
    new Set(lines.map((line) => line.fixture.fixtureId)).size !== lines.length ||
    new Set(lines.map((line) => ccc.Script.from(line.descriptor.type).hash())).size !== lines.length
  )
    throw Error('A combined payment cannot contain the same market twice.');
  const inputs: BatchInput[] = row.inputs.map((value, index) => {
    const input = object(value),
      outPoint = parsePoint(input.outPoint);
    if (
      !tx.inputs[index].previousOutput.eq(outPoint) ||
      typeof input.data !== 'string' ||
      !/^0x(?:[0-9a-f]{2}){0,332}$/.test(input.data)
    )
      throw Error('Resolved combined transaction inputs changed.');
    let type: BatchInput['type'];
    if (input.type !== undefined) {
      const rawType = object(input.type);
      if (rawType.codeHash !== BATCH_PROTOCOL_HASH || rawType.hashType !== 'data2')
        throw Error('A combined input uses an unexpected contract.');
      type = { codeHash: BATCH_PROTOCOL_HASH, hashType: 'data2', args: hex(rawType.args, 172) };
      if (
        !lines.some(
          (line) => line.mode === 'deposit' && ccc.Script.from(line.descriptor.type).eq(type!),
        )
      )
        throw Error('A combined input belongs to a different market.');
    }
    return {
      outPoint,
      capacityShannons: shannons(input.capacityShannons),
      lock: script(input.lock),
      data: input.data,
      ...(type ? { type } : {}),
    };
  });
  const principal = lines.reduce((sum, line) => sum + BigInt(line.principalShannons), 0n),
    storage = STORAGE * BigInt(lines.length);
  const reserve = SPONSOR_RESERVE * BigInt(lines.filter((line) => line.mode === 'create').length),
    feeShannons = shannons(row.feeShannons);
  if (
    row.principalShannons !== principal.toString() ||
    row.storageShannons !== storage.toString() ||
    row.reserveShannons !== reserve.toString() ||
    BigInt(feeShannons) > SPONSOR_MAX_FEE ||
    row.sponsorChangeOutputIndex !== nextOutput ||
    row.ownerChangeOutputIndex !== nextOutput + 1 ||
    tx.outputs.length !== nextOutput + 2
  )
    throw Error('Combined prediction totals or contributor change changed.');
  const fixture = await parseBatchFixture(row.fixture),
    descriptor = await parseDescriptor(row.descriptor);
  sameFixture(fixture, lines[0].fixture);
  assertSameTerms(descriptor, lines[0].descriptor);
  if (row.outcome !== lines[0].outcome)
    throw Error('Combined prediction summary differs from its first line.');
  return freeze({
    version: 'atomic-predictions-v1',
    offerId: offerId(row.offerId),
    expiresAt: integer(
      row.expiresAt,
      1,
      Math.min(...lines.map((line) => line.fixture.cutoffMs - 120_000)),
    ),
    rawHash,
    unsignedBytes: row.unsignedBytes as string,
    sponsorLock,
    ownerLock,
    sponsorInput,
    userInputIndexes: row.userInputIndexes.map((value) => integer(value, 1, 16)),
    inputs,
    lines,
    reserveShannons: reserve.toString(),
    principalShannons: principal.toString(),
    storageShannons: storage.toString(),
    feeShannons,
    sponsorChangeOutputIndex: nextOutput,
    ownerChangeOutputIndex: nextOutput + 1,
    fixture,
    descriptor,
    outcome: lines[0].outcome,
  });
}
export async function parseBatchStatus(value: unknown): Promise<BatchStatus> {
  const row = object(value),
    offer = await parseBatchOffer(row.offer);
  if (
    ![
      'offered',
      'owner-signed',
      'signed',
      'confirming',
      'funded',
      'expired',
      'cancelled',
      'blocked',
    ].includes(String(row.state)) ||
    row.transactionHash !== offer.rawHash
  )
    throw Error('Combined payment status could not be verified. Keep the original transaction.');
  return freeze({
    offer,
    state: row.state as BatchStatus['state'],
    transactionHash: offer.rawHash,
    ...(row.signedBytes === undefined ? {} : { signedBytes: transactionBytes(row.signedBytes) }),
    ...(row.message === undefined ? {} : { message: text(row.message, 400) }),
  });
}

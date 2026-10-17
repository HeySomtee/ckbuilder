import { ccc } from '@ckb-ccc/core';
import {
  CKB,
  MIN_PRINCIPAL,
  STORAGE,
  SPONSORED_PROTOCOL_HASH,
  descriptorTermsHash,
  hex,
  integer,
  object,
  parseDescriptor,
  point,
  text,
} from './protocol.ts';
import type { Descriptor, Outcome, Point } from './protocol.ts';

export const SPONSOR_RESERVE = 3050n * CKB;
export const SPONSOR_MAX_FEE = CKB / 10n;
export type WalletScript = Readonly<{
  codeHash: string;
  hashType: ccc.Script['hashType'];
  args: string;
}>;
export type DemandFixture = Readonly<{
  fixtureId: string;
  label: string;
  cutoffMs: number;
  terms: Descriptor['terms'];
  termsHash: string;
  state: 'available' | 'reserved' | 'confirming' | 'funded' | 'unavailable';
  sponsorLock: WalletScript;
  descriptor?: Descriptor;
}>;
export type SponsorRequest = Readonly<{
  fixtureId: string;
  termsHash: string;
  ownerAddress: string;
  userInputs: readonly Point[];
  outcome: Outcome;
  principalShannons: string;
  requestId: string;
}>;
export type SponsorOffer = Readonly<{
  version: 'sponsored-create-v1';
  offerId: string;
  expiresAt: number;
  fixture: DemandFixture;
  descriptor: Descriptor;
  rawHash: string;
  unsignedBytes: string;
  sponsorLock: WalletScript;
  ownerLock: WalletScript;
  sponsorInput: Point;
  userInputIndexes: readonly number[];
  reserveShannons: string;
  feeShannons: string;
  outcome: Outcome;
  principalShannons: string;
}>;
export type SponsorStatus = Readonly<{
  offer: SponsorOffer;
  state:
    | 'offered'
    | 'owner-signed'
    | 'signed'
    | 'confirming'
    | 'funded'
    | 'expired'
    | 'cancelled'
    | 'blocked';
  signedBytes?: string;
  transactionHash: string;
  message?: string;
}>;
export interface SponsorTransport {
  offer(request: SponsorRequest): Promise<SponsorOffer>;
  submit(request: {
    offerId: string;
    rawHash: string;
    userSignedBytes: string;
  }): Promise<SponsorStatus>;
  status(offerId: string, rawHash: string): Promise<SponsorStatus>;
  resolve?(request: { offerId: string; rawHash: string; conflictingTxHash: string }): Promise<void>;
}
export function script(value: unknown): WalletScript {
  const row = object(value);
  if (
    !['data', 'data1', 'data2', 'type'].includes(String(row.hashType)) ||
    typeof row.args !== 'string' ||
    !/^0x(?:[0-9a-f]{2}){0,59}$/.test(row.args)
  )
    throw Error('Unsupported wallet lock format.');
  return Object.freeze({
    codeHash: hex(row.codeHash, 32),
    hashType: row.hashType as ccc.Script['hashType'],
    args: row.args,
  });
}
export function shannons(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^(0|[1-9]\d{0,19})$/.test(value) ||
    BigInt(value) > (1n << 64n) - 1n
  )
    throw Error('Invalid sponsored transaction amount.');
  return value;
}
export function transactionBytes(value: unknown): string {
  if (typeof value !== 'string' || value.length > 200002 || !/^0x(?:[0-9a-f]{2})+$/.test(value))
    throw Error('Invalid sponsored transaction bytes.');
  ccc.Transaction.fromBytes(value);
  return value;
}
export function offerId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
  )
    throw Error('Invalid sponsored offer identity.');
  return value;
}
export async function parseDemandFixture(value: unknown): Promise<DemandFixture> {
  const row = object(value),
    terms = object(row.terms);
  const cutoffMs = integer(row.cutoffMs, 1, Number.MAX_SAFE_INTEGER - 21_600_000);
  if (
    terms.provider !== 'football' ||
    terms.source !== 'api-football' ||
    terms.rules !== 'regulation-time-1x2-v1' ||
    terms.deadlineMs !== cutoffMs + 21_600_000 ||
    typeof terms.providerFixtureId !== 'string' ||
    !/^[1-9]\d{0,14}$/.test(terms.providerFixtureId) ||
    row.fixtureId !== `api-football-${terms.providerFixtureId}` ||
    !['available', 'reserved', 'confirming', 'funded', 'unavailable'].includes(String(row.state))
  )
    throw Error('The fixture sponsorship terms could not be verified.');
  const fixture: DemandFixture = Object.freeze({
    fixtureId: text(row.fixtureId),
    label: text(row.label),
    cutoffMs,
    termsHash: hex(row.termsHash, 32),
    terms: Object.freeze({
      provider: 'football',
      source: 'api-football',
      providerFixtureId: terms.providerFixtureId,
      rules: 'regulation-time-1x2-v1',
      deadlineMs: cutoffMs + 21_600_000,
    }),
    state: row.state as DemandFixture['state'],
    sponsorLock: script(row.sponsorLock),
    ...(row.descriptor === undefined ? {} : { descriptor: await parseDescriptor(row.descriptor) }),
  });
  if ((await descriptorTermsHash(fixture)) !== fixture.termsHash)
    throw Error('Fixture sponsorship terms changed.');
  if (
    fixture.descriptor &&
    (fixture.descriptor.fixtureId !== fixture.fixtureId ||
      fixture.descriptor.termsHash !== fixture.termsHash)
  )
    throw Error('Funded market differs from its fixture.');
  return fixture;
}
export function sameFixture(a: DemandFixture, b: DemandFixture): void {
  if (
    a.fixtureId !== b.fixtureId ||
    a.termsHash !== b.termsHash ||
    a.cutoffMs !== b.cutoffMs ||
    !ccc.Script.from(a.sponsorLock).eq(b.sponsorLock)
  )
    throw Error('Fixture or sponsor terms changed. Review the prediction again.');
}
export async function parseSponsorOffer(value: unknown): Promise<SponsorOffer> {
  const row = object(value),
    fixture = await parseDemandFixture(row.fixture),
    descriptor = await parseDescriptor(row.descriptor);
  const tx = ccc.Transaction.fromBytes(transactionBytes(row.unsignedBytes)),
    rawHash = hex(row.rawHash, 32);
  const input = object(row.sponsorInput);
  const sponsorInput = Object.freeze({
    txHash: hex(input.txHash, 32),
    index: integer(input.index, 0, 0xffffffff),
  });
  const sponsorLock = script(row.sponsorLock),
    ownerLock = script(row.ownerLock);
  if (
    row.version !== 'sponsored-create-v1' ||
    descriptor.type.codeHash !== SPONSORED_PROTOCOL_HASH ||
    descriptor.creationTxHash !== rawHash ||
    tx.hash() !== rawHash ||
    descriptor.fixtureId !== fixture.fixtureId ||
    descriptor.termsHash !== fixture.termsHash ||
    descriptor.cutoffMs !== fixture.cutoffMs ||
    !ccc.Script.from(sponsorLock).eq(fixture.sponsorLock) ||
    ccc.Script.from(sponsorLock).eq(ownerLock) ||
    row.reserveShannons !== SPONSOR_RESERVE.toString() ||
    !Array.isArray(row.userInputIndexes) ||
    row.userInputIndexes.length !== tx.inputs.length - 1 ||
    !tx.inputs[0]?.previousOutput.eq(sponsorInput) ||
    row.userInputIndexes.some((index, at) => index !== at + 1)
  )
    throw Error('The sponsored offer does not match its reviewed fixture and transaction.');
  const principalShannons = shannons(row.principalShannons),
    feeShannons = shannons(row.feeShannons);
  if (
    BigInt(principalShannons) < MIN_PRINCIPAL ||
    BigInt(principalShannons) + STORAGE > (1n << 64n) - 1n ||
    BigInt(feeShannons) > SPONSOR_MAX_FEE
  )
    throw Error('Sponsored payment amounts exceed protocol limits.');
  return Object.freeze({
    version: 'sponsored-create-v1',
    offerId: offerId(row.offerId),
    expiresAt: integer(row.expiresAt, 1, fixture.cutoffMs - 120_000),
    fixture,
    descriptor,
    rawHash,
    unsignedBytes: row.unsignedBytes as string,
    sponsorLock,
    ownerLock,
    sponsorInput,
    userInputIndexes: Object.freeze(row.userInputIndexes.map((index) => integer(index, 1, 63))),
    reserveShannons: SPONSOR_RESERVE.toString(),
    feeShannons,
    principalShannons,
    outcome: integer(row.outcome, 0, 2) as Outcome,
  });
}
export async function parseSponsorStatus(value: unknown): Promise<SponsorStatus> {
  const row = object(value),
    offer = await parseSponsorOffer(row.offer);
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
    throw Error('The sponsorship status could not be verified. Keep the original transaction.');
  return Object.freeze({
    offer,
    state: row.state as SponsorStatus['state'],
    transactionHash: offer.rawHash,
    ...(row.signedBytes === undefined ? {} : { signedBytes: transactionBytes(row.signedBytes) }),
    ...(row.message === undefined ? {} : { message: text(row.message, 400) }),
  });
}
export const inputPoints = (tx: ccc.Transaction): readonly Point[] =>
  Object.freeze(tx.inputs.map((input) => point(input.previousOutput)));

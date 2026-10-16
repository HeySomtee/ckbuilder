import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import type { Match } from '../../types';

export const RESULT_WINDOW_MS = 21_600_000;
export const PROVIDER_ORIGIN = 'https://v3.football.api-sports.io';
export const PUBLIC_DIRECT_CONFIG = Object.freeze({
  version: 'testnet-v1' as const,
  network: 'testnet' as const,
  rpc: 'https://testnet.ckb.dev/',
  protocolHash: '0x5407eb2a5afa2c28b505342e3694e7562e3bed70e38602130087c04d27052d86',
  guardHash: '0x096ebfed6452d654dcfbf43379c2b6c745dba9af1dabcc3463bbd501a6fdeada',
  codeDeps: [0, 1].map((index) => ({
    outPoint: {
      txHash: '0xb05048b11a78fc9697c1235ec4e114f2f762559cb9652b61552bc87e8c3fde11',
      index,
    },
    depType: 'code' as const,
  })),
  limits: {
    minPrincipalShannons: '10000000000',
    claimStorageShannons: '32100000000',
    shards: 4,
    recordsPerShard: 8,
  },
  fixtureBinding: 'trusted-operator-catalogue' as const,
});

export interface DirectTerms {
  provider: 'football';
  providerFixtureId: string;
  source: 'api-football';
  rules: 'regulation-time-1x2-v1';
  deadlineMs: number;
}
export interface DirectMarketRecord {
  id: string;
  fixtureId: string;
  label: string;
  cutoffMs: number;
  creationTxHash: string;
  type: { codeHash: string; hashType: 'data2'; args: string };
  termsHash: string;
  terms: DirectTerms;
}
export interface DirectMarketDescriptor extends DirectMarketRecord {
  entryEnabled: boolean;
  entryUnavailableReason?: string;
}
export interface DirectProtocolConfig {
  protocolHash: string;
  guardHash: string;
  codeDeps: { outPoint: { txHash: string; index: number }; depType: 'code' }[];
}

export function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(`Invalid ${label}`);
  return value as Record<string, unknown>;
}
function string(value: unknown, label: string, max = 180): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > max ||
    /[\u0000-\u001f]/.test(value)
  )
    throw Error(`Invalid ${label}`);
  return value;
}
export function hash32(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/.test(value)) throw Error(`Invalid ${label}`);
  return value;
}
export function exactTimestamp(value: unknown, label: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > 8_640_000_000_000_000
  )
    throw Error(`Invalid ${label}`);
  return value;
}

/** Catalogue digest only. Week 20's 172-byte script args do not commit this digest. */
export function termsDigest(record: Omit<DirectMarketRecord, 'termsHash'>): string {
  const t = record.terms;
  return `0x${createHash('sha256')
    .update(
      JSON.stringify([
        PUBLIC_DIRECT_CONFIG.version,
        record.fixtureId,
        record.label,
        record.cutoffMs,
        t.provider,
        t.providerFixtureId,
        t.source,
        t.rules,
        t.deadlineMs,
      ]),
    )
    .digest('hex')}`;
}

export function validateRecord(
  value: unknown,
  config: DirectProtocolConfig = PUBLIC_DIRECT_CONFIG,
): DirectMarketRecord {
  const row = object(value, 'direct market');
  const type = object(row.type, 'market type');
  const terms = object(row.terms, 'market terms');
  const cutoffMs = exactTimestamp(row.cutoffMs, 'kickoff');
  if (
    type.codeHash !== config.protocolHash ||
    type.hashType !== 'data2' ||
    typeof type.args !== 'string' ||
    !/^0x[0-9a-f]{344}$/.test(type.args)
  )
    throw Error('Unsupported direct market contract');
  const args = Buffer.from(type.args.slice(2), 'hex');
  if (
    args.readBigUInt64LE(68) !== BigInt(cutoffMs) ||
    `0x${args.subarray(76, 108).toString('hex')}` !== config.guardHash
  )
    throw Error('Contract and catalogue terms differ');
  if (
    terms.provider !== 'football' ||
    terms.source !== 'api-football' ||
    terms.rules !== 'regulation-time-1x2-v1' ||
    terms.deadlineMs !== cutoffMs + RESULT_WINDOW_MS ||
    typeof terms.providerFixtureId !== 'string' ||
    !/^[1-9][0-9]{0,14}$/.test(terms.providerFixtureId)
  )
    throw Error('Unsupported football terms');
  const record: DirectMarketRecord = {
    id: string(row.id, 'market ID', 80),
    fixtureId: string(row.fixtureId, 'fixture ID', 80),
    label: string(row.label, 'market label'),
    cutoffMs,
    creationTxHash: hash32(row.creationTxHash, 'creation hash'),
    type: { codeHash: type.codeHash, hashType: 'data2', args: type.args },
    termsHash: hash32(row.termsHash, 'terms digest'),
    terms: {
      provider: 'football',
      providerFixtureId: terms.providerFixtureId,
      source: 'api-football',
      rules: 'regulation-time-1x2-v1',
      deadlineMs: terms.deadlineMs,
    },
  };
  if (
    record.fixtureId !== `api-football-${record.terms.providerFixtureId}` ||
    record.id !== `direct-${record.terms.providerFixtureId}`
  )
    throw Error('Fixture identity does not match the pinned source');
  if (termsDigest(record) !== record.termsHash) throw Error('Invalid catalogue digest');
  return record;
}

export function createRecord(
  match: Match,
  type: DirectMarketRecord['type'],
  creationTxHash: string,
  config: DirectProtocolConfig = PUBLIC_DIRECT_CONFIG,
): DirectMarketRecord {
  const cutoffMs = Date.parse(match.kickoff);
  if (
    match.oracle?.provider !== 'api-football' ||
    match.oracle.source !== PROVIDER_ORIGIN ||
    match.sport !== 'football'
  )
    throw Error('Only the real API-Football catalogue is supported');
  const record = {
    id: `direct-${match.oracle.fixtureId}`,
    fixtureId: match.id,
    label: `${match.home.name} vs ${match.away.name}`,
    cutoffMs,
    creationTxHash,
    type,
    terms: {
      provider: 'football' as const,
      providerFixtureId: match.oracle.fixtureId,
      source: 'api-football' as const,
      rules: 'regulation-time-1x2-v1' as const,
      deadlineMs: cutoffMs + RESULT_WINDOW_MS,
    },
  };
  return validateRecord({ ...record, termsHash: termsDigest(record) }, config);
}

/** Atomic exclusive creation avoids replacing a funded market's immutable mapping. */
export function writeExclusiveJson(file: string, value: unknown): void {
  const temporary = `${file}.${process.pid}.${createHash('sha256').update(String(Math.random())).digest('hex').slice(0, 16)}.tmp`;
  let fd: number | undefined;
  try {
    fd = openSync(temporary, 'wx', 0o600);
    writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    // Linking the fully flushed inode is atomic and fails if another writer won.
    linkSync(temporary, file);
  } finally {
    if (fd !== undefined) closeSync(fd);
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

export class DirectRegistry {
  readonly directory?: string;
  constructor(directory?: string) {
    this.directory = directory ? resolve(directory) : undefined;
  }
  private filename(fixtureId: string): string {
    if (!this.directory) throw Error('Direct market registry is not configured');
    if (!/^api-football-[1-9][0-9]{0,14}$/.test(fixtureId))
      throw Error('Invalid football fixture ID');
    return join(this.directory, `${fixtureId}.json`);
  }
  get(fixtureId: string): DirectMarketRecord | undefined {
    if (!this.directory) return undefined;
    const file = this.filename(fixtureId);
    if (!existsSync(file)) return undefined;
    if (statSync(file).size > 16_384) throw Error('Direct registry record exceeds its size limit');
    const record = validateRecord(JSON.parse(readFileSync(file, 'utf8')));
    if (record.fixtureId !== fixtureId) throw Error('Direct registry filename and identity differ');
    return record;
  }
  all(): DirectMarketRecord[] {
    if (!this.directory || !existsSync(this.directory)) return [];
    const files = readdirSync(this.directory).filter((file) =>
      /^api-football-[1-9][0-9]{0,14}\.json$/.test(file),
    );
    if (files.length > 256)
      throw Error(
        'Direct pilot registry exceeds 256 markets; archive discovery with exit tooling before expansion',
      );
    return files.sort().map((file) => this.get(file.slice(0, -5))!);
  }
  add(value: unknown): DirectMarketRecord {
    const record = validateRecord(value);
    const file = this.filename(record.fixtureId);
    const existing = this.get(record.fixtureId);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(record))
        throw Error('Cannot replace an immutable funded-market mapping');
      return existing;
    }
    mkdirSync(this.directory!, { recursive: true, mode: 0o700 });
    if (this.all().length >= 256) throw Error('Direct pilot registry is full');
    writeExclusiveJson(file, record);
    return record;
  }
  describe(
    fixtures: Match[],
    ownsMatch: (match: Match) => boolean,
    fixtureId?: string,
    now = Date.now(),
  ): DirectMarketDescriptor[] {
    const records = fixtureId
      ? [this.get(fixtureId)].filter((row): row is DirectMarketRecord => !!row)
      : this.all();
    return records.map((record) => {
      const match = fixtures.find((row) => row.id === record.fixtureId);
      let entryUnavailableReason: string | undefined;
      if (
        !match ||
        !ownsMatch(match) ||
        match.oracle?.provider !== 'api-football' ||
        match.oracle.fixtureId !== record.terms.providerFixtureId ||
        match.oracle.source !== PROVIDER_ORIGIN
      )
        entryUnavailableReason =
          'The pinned football source is unavailable. Existing positions remain recoverable on CKB.';
      else if (Date.parse(match.kickoff) !== record.cutoffMs)
        entryUnavailableReason =
          'The provider changed kickoff. New entries are paused; funded terms remain unchanged.';
      else if (now >= record.cutoffMs || match.status !== 'scheduled')
        entryUnavailableReason =
          'Entries have closed. Check the chain for admission, settlement and claims.';
      return {
        ...record,
        entryEnabled: !entryUnavailableReason,
        ...(entryUnavailableReason ? { entryUnavailableReason } : {}),
      };
    });
  }
}

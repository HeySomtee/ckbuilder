import { createHash, randomUUID } from 'node:crypto';
import * as ccc from '@ckb-ccc/core';
import { sponsoredOriginDescendant } from './sponsor-lineage';
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import type { Match } from '../../types';

export const RESULT_WINDOW_MS = 21_600_000;
export const PROVIDER_ORIGIN = 'https://v3.football.api-sports.io';
export const LEGACY_DIRECT_CONFIG = Object.freeze({
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

// The wire layout and journal schema remain v1. This is a separate contract deployment.
export const PUBLIC_DIRECT_CONFIG = Object.freeze({
  ...LEGACY_DIRECT_CONFIG,
  protocolHash: '0xc65bfcf86e34da4bb8f51f93e261236418a639699b5fd7f3dfafb5f987e047e0',
  codeDeps: [
    {
      outPoint: {
        txHash: '0xfb3a8cdb8b79f84785c5847ba53181021bd4f4f2556bf33b0f6883741b50f2fe',
        index: 0,
      },
      depType: 'code' as const,
    },
    LEGACY_DIRECT_CONFIG.codeDeps[1],
  ],
});

/** Separate sponsored-genesis deployment. Earlier market exits keep their own pins. */
export const V3_DIRECT_CONFIG = Object.freeze({
  ...PUBLIC_DIRECT_CONFIG,
  protocolHash: '0x1adbf49e05f294891e33403f399046d6de907ea18c8c256c069538a4f0508888',
  codeDeps: [
    {
      outPoint: {
        txHash: '0x243a71ceeaa06478fa8b74ba807407de55f184bfd125a03f4432babd1a9c1135',
        index: 0,
      },
      depType: 'code' as const,
    },
    LEGACY_DIRECT_CONFIG.codeDeps[1],
  ],
});

/** Atomic entry deployment. Historical generations retain their original dependencies. */
export const V4_DIRECT_CONFIG = Object.freeze({
  ...PUBLIC_DIRECT_CONFIG,
  protocolHash: '0x6c03d7942bd133c713c501df7a6e263699a0ea731339eda993548640e900405c',
  codeDeps: [
    {
      outPoint: {
        txHash: '0x930bba6cce8cd6b1dc254cc3469249d7ba32f09b44bc20ea784f45e172cd606f',
        index: 0,
      },
      depType: 'code' as const,
    },
    LEGACY_DIRECT_CONFIG.codeDeps[1],
  ],
});

export function directGeneration(protocolHash: string): '' | 'v2-' | 'v3-' | 'v4-' {
  return protocolHash === LEGACY_DIRECT_CONFIG.protocolHash
    ? ''
    : protocolHash === V4_DIRECT_CONFIG.protocolHash
      ? 'v4-'
      : protocolHash === V3_DIRECT_CONFIG.protocolHash
        ? 'v3-'
        : 'v2-';
}

export function protocolConfigFor(
  record: Pick<DirectMarketRecord, 'type'>,
  config: DirectProtocolConfig = PUBLIC_DIRECT_CONFIG,
): DirectProtocolConfig {
  if (record.type.codeHash === config.protocolHash) return config;
  if (
    [PUBLIC_DIRECT_CONFIG, LEGACY_DIRECT_CONFIG, V3_DIRECT_CONFIG, V4_DIRECT_CONFIG].includes(
      config as typeof PUBLIC_DIRECT_CONFIG,
    )
  ) {
    const pinned = [
      PUBLIC_DIRECT_CONFIG,
      LEGACY_DIRECT_CONFIG,
      V3_DIRECT_CONFIG,
      V4_DIRECT_CONFIG,
    ].find((value) => value.protocolHash === record.type.codeHash);
    if (pinned) return pinned;
  }
  throw Error('Unsupported direct market contract');
}

export function maxLockArgs(config: DirectProtocolConfig): number {
  return config.protocolHash === LEGACY_DIRECT_CONFIG.protocolHash ? 20 : 59;
}

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
  config = protocolConfigFor(
    { type: { codeHash: String(type.codeHash), hashType: 'data2', args: '' } },
    config,
  );
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
    record.id !== `direct-${directGeneration(config.protocolHash)}${record.terms.providerFixtureId}`
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
    id: `direct-${directGeneration(config.protocolHash)}${match.oracle.fixtureId}`,
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
  /** Separate generation catalogues share funding recovery, never fixture files. */
  publicationTargets: DirectRegistry[] = [];
  readonly directory?: string;
  constructor(
    directory?: string,
    readonly config: DirectProtocolConfig = PUBLIC_DIRECT_CONFIG,
  ) {
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
    const record = validateRecord(JSON.parse(readFileSync(file, 'utf8')), this.config);
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
    const record = validateRecord(value, this.config);
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
  /** Caller holds the shared operator lease. Every instance and selection proof is retained. */
  async publishCanonical(value: unknown, client: ccc.Client): Promise<DirectMarketRecord> {
    const record = validateRecord(value, this.config);
    if (record.type.codeHash !== this.config.protocolHash && this.publicationTargets.length) {
      const target =
        this.publicationTargets.find(
          (candidate) => candidate.config.protocolHash === record.type.codeHash,
        ) ??
        (record.type.codeHash !== V4_DIRECT_CONFIG.protocolHash
          ? this.publicationTargets.find(
              (candidate) => candidate.config.protocolHash !== V4_DIRECT_CONFIG.protocolHash,
            )
          : undefined);
      if (target && target !== this) return target.publishCanonical(record, client);
    }
    if (
      record.type.codeHash !== V3_DIRECT_CONFIG.protocolHash &&
      record.type.codeHash !== V4_DIRECT_CONFIG.protocolHash
    )
      return this.add(record);
    if (!this.directory) throw Error('Direct market registry is not configured');
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const lockFile = join(this.directory, '.canonical-selection.lock'),
      token = randomUUID();
    writeExclusiveJson(lockFile, { pid: process.pid, token, createdAtMs: Date.now() });
    try {
      return await this.selectCanonical(record, client);
    } finally {
      const lock = object(JSON.parse(readFileSync(lockFile, 'utf8')), 'canonical selection lock');
      if (lock.token !== token) throw Error('Canonical selection ownership changed unexpectedly');
      unlinkSync(lockFile);
    }
  }
  private async selectCanonical(
    record: DirectMarketRecord,
    client: ccc.Client,
  ): Promise<DirectMarketRecord> {
    const response = await client.getTransactionNoCache(record.creationTxHash);
    if (
      !response ||
      response.status !== 'committed' ||
      response.transaction.hash() !== record.creationTxHash ||
      !response.blockHash ||
      response.blockNumber === undefined
    )
      throw Error('Canonical market publication needs a committed creation');
    const header = await client.getHeaderByNumberNoCache(response.blockNumber),
      tip = await client.getTipHeader();
    if (header?.hash !== response.blockHash || tip.number < response.blockNumber + 3n)
      throw Error('Canonical market publication needs four confirmations');
    const transaction = response.transaction;
    const atomic = record.type.codeHash === V4_DIRECT_CONFIG.protocolHash;
    const base = atomic ? Buffer.from(record.type.args.slice(2), 'hex').readUInt32LE(32) : 0;
    if (
      transaction.inputs.length < 2 ||
      transaction.outputs[base]?.type?.toHex() !== ccc.Script.from(record.type).toHex() ||
      transaction.outputsData[base] !== '0x0000ff' ||
      (atomic
        ? ccc.hashCkb(transaction.inputs[0].previousOutput.toBytes()) !==
          `0x${record.type.args.slice(2, 66)}`
        : transaction.inputs[0].previousOutput.toHex() !== `0x${record.type.args.slice(2, 74)}`)
    )
      throw Error('Canonical transaction is not this sponsored market genesis');
    const current = this.get(record.fixtureId);
    if (current && current.creationTxHash === record.creationTxHash) {
      if (JSON.stringify(current) !== JSON.stringify(record))
        throw Error('Cannot change immutable funded terms');
      return current;
    }
    let orphaned: { blockHash: string; blockNumber: string; creationTxHash: string } | undefined;
    let checkpointOrigin: ccc.OutPoint | undefined;
    const historyDirectory = join(this.directory!, 'selection-history', record.fixtureId);
    if (current) {
      if (current.type.codeHash !== record.type.codeHash)
        throw Error('Canonical selection cannot replace an earlier contract generation');
      const old = await client.getTransactionNoCache(current.creationTxHash);
      if (
        old?.status === 'committed' &&
        old.blockHash &&
        old.blockNumber !== undefined &&
        (await client.getHeaderByNumberNoCache(old.blockNumber))?.hash === old.blockHash
      )
        throw Error('The currently selected market is still canonical');
      if (!existsSync(historyDirectory))
        throw Error('Prior selection lacks an auditable canonical checkpoint');
      const files = readdirSync(historyDirectory)
        .filter((file) => /^[0-9]+-[0-9a-f-]{36}\.json$/.test(file))
        .sort()
        .reverse();
      if (files.length > 4096)
        throw Error('Canonical selection history exceeds its reviewed bound');
      for (const file of files) {
        const path = join(historyDirectory, file);
        if (statSync(path).size > 4096) throw Error('Selection proof exceeds its byte limit');
        const proof = object(JSON.parse(readFileSync(path, 'utf8')), 'canonical selection proof');
        if (proof.creationTxHash !== current.creationTxHash) continue;
        if (typeof proof.blockNumber !== 'string' || !/^\d{1,20}$/.test(proof.blockNumber))
          throw Error('Invalid selection checkpoint number');
        const blockHash = hash32(proof.blockHash, 'selection checkpoint hash');
        const canonical = await client.getHeaderByNumberNoCache(BigInt(proof.blockNumber));
        if (canonical?.hash === blockHash)
          throw Error('Prior market checkpoint is still canonical');
        if (!canonical && tip.number >= BigInt(proof.blockNumber))
          throw Error('Cannot establish that the prior checkpoint was orphaned');
        orphaned = {
          blockHash,
          blockNumber: proof.blockNumber,
          creationTxHash: current.creationTxHash,
        };
        if (atomic && typeof proof.originPoint === 'string') {
          checkpointOrigin = ccc.OutPoint.fromBytes(proof.originPoint);
          if (ccc.hashCkb(checkpointOrigin.toBytes()) !== `0x${current.type.args.slice(2, 66)}`)
            throw Error('Prior atomic funding checkpoint differs');
        }
        break;
      }
      if (!orphaned) throw Error('Prior selection has no matching canonical proof');
      const previousOrigin = atomic
        ? (old?.transaction.inputs[0]?.previousOutput ?? checkpointOrigin)
        : ccc.OutPoint.fromBytes(`0x${current.type.args.slice(2, 74)}`);
      if (!previousOrigin)
        throw Error('Prior atomic genesis bytes are required to prove its funding origin');
      const nextOrigin = transaction.inputs[0].previousOutput;
      // Either attempt may be the ancestor after a reorg. Their funding lineage
      // must make both creations impossible on the same canonical branch.
      let exclusive = previousOrigin.eq(nextOrigin);
      if (!exclusive) {
        try {
          exclusive = await sponsoredOriginDescendant(client, nextOrigin, [previousOrigin]);
        } catch {
          exclusive = false;
        }
        if (!exclusive)
          try {
            exclusive = await sponsoredOriginDescendant(client, previousOrigin, [nextOrigin]);
          } catch {
            exclusive = false;
          }
      }
      if (!exclusive)
        throw Error('Replacement selection lacks a mutually exclusive funding lineage');
    }
    const instances = join(this.directory!, 'instances', record.fixtureId);
    mkdirSync(instances, { recursive: true, mode: 0o700 });
    mkdirSync(historyDirectory, { recursive: true, mode: 0o700 });
    const instance = join(instances, `${record.creationTxHash.slice(2)}.json`);
    if (!existsSync(instance)) writeExclusiveJson(instance, record);
    else if (
      JSON.stringify(validateRecord(JSON.parse(readFileSync(instance, 'utf8')), this.config)) !==
      JSON.stringify(record)
    )
      throw Error('Immutable market instance differs');
    const proofFile = join(historyDirectory, `${Date.now()}-${randomUUID()}.json`);
    writeExclusiveJson(proofFile, {
      version: 1,
      fixtureId: record.fixtureId,
      creationTxHash: record.creationTxHash,
      blockHash: response.blockHash,
      blockNumber: response.blockNumber.toString(),
      confirmations: Number(tip.number - response.blockNumber + 1n),
      ...(atomic ? { originPoint: transaction.inputs[0].previousOutput.toHex() } : {}),
      ...(orphaned ? { orphaned } : {}),
    });
    if (!current) return this.add(record);
    const temporary = `${this.filename(record.fixtureId)}.${randomUUID()}.selection`;
    writeExclusiveJson(temporary, record);
    renameSync(temporary, this.filename(record.fixtureId));
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
      if (record.type.codeHash === LEGACY_DIRECT_CONFIG.protocolHash)
        entryUnavailableReason =
          'This earlier contract is closed to new entries. Existing positions and claims remain available.';
      else if (
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

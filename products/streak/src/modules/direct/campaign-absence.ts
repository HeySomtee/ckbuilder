import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as ccc from '@ckb-ccc/core';
import { atomicOffer, type BatchService } from './batch';
import { OPERATION_FILE, type SignedOperation } from './journal';
import {
  exactTimestamp,
  hash32,
  object,
  validateRecord,
  V4_DIRECT_CONFIG,
  type DirectMarketRecord,
} from './registry';
import type { SponsorEntry } from './sponsor-journal';

export interface CampaignAbsenceRequest {
  fixtures: Array<{ fixtureId: string; cutoffMs: number; protocolHash: string }>;
}
export interface CampaignAbsenceSnapshot {
  version: 1;
  basis: 'operator-attested-empty';
  network: 'testnet';
  protocolHash: string;
  checkedAt: number;
  checkpoint: { blockHash: string; blockNumber: string; timestamp: number };
  historyDigest: string;
  fixtures: Array<{ fixtureId: string; cutoffMs: number; status: 'absent' | 'unresolved' }>;
}
const FIXTURE = /^api-football-[1-9][0-9]{0,14}$/;
const unavailable = () =>
  Error('Campaign operator history is unavailable for absence verification.');
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function directory(path: string): void {
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw unavailable();
}
function json(path: string, maximum: number): unknown {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maximum) throw unavailable();
  return JSON.parse(readFileSync(path, 'utf8'));
}
export function parseCampaignAbsenceRequest(raw: unknown): CampaignAbsenceRequest {
  const value = object(raw, 'campaign absence request');
  if (!Array.isArray(value.fixtures) || !value.fixtures.length || value.fixtures.length > 64)
    throw Error('Campaign absence reads require one to 64 fixture pins per request.');
  const fixtures = value.fixtures.map((item) => {
    const row = object(item, 'campaign fixture pin');
    if (
      typeof row.fixtureId !== 'string' ||
      !FIXTURE.test(row.fixtureId) ||
      row.protocolHash !== V4_DIRECT_CONFIG.protocolHash
    )
      throw Error('Invalid campaign fixture pin.');
    return {
      fixtureId: row.fixtureId,
      cutoffMs: exactTimestamp(row.cutoffMs, 'campaign cutoff'),
      protocolHash: row.protocolHash,
    };
  });
  if (new Set(fixtures.map((f) => f.fixtureId)).size !== fixtures.length)
    throw Error('Campaign absence requests cannot repeat a fixture.');
  return { fixtures };
}

/** Full retained catalogue, including orphaned instances. Missing history never means empty. */
function retainedMarkets(service: BatchService): DirectMarketRecord[] {
  const root = service.options.registry.directory;
  if (!root) throw unavailable();
  directory(root);
  const instances = join(root, 'instances'),
    selections = join(root, 'selection-history');
  directory(instances);
  directory(selections);
  const folders = readdirSync(instances);
  if (!folders.length || folders.length > 256 || folders.some((name) => !FIXTURE.test(name)))
    throw unavailable();
  if (digest([...readdirSync(selections)].sort()) !== digest([...folders].sort()))
    throw unavailable();
  const records: DirectMarketRecord[] = [];
  for (const fixtureId of folders.sort()) {
    const folder = join(instances, fixtureId),
      proofs = join(selections, fixtureId);
    directory(folder);
    directory(proofs);
    const files = readdirSync(folder),
      proofFiles = readdirSync(proofs);
    if (
      !files.length ||
      files.length > 64 ||
      files.some((name) => !/^[0-9a-f]{64}\.json$/.test(name)) ||
      !proofFiles.length ||
      proofFiles.length > 4096
    )
      throw unavailable();
    const selected = new Set<string>();
    for (const file of proofFiles) {
      if (!/^[0-9]+-[0-9a-f-]{36}\.json$/.test(file)) throw unavailable();
      const proof = object(json(join(proofs, file), 4096), 'canonical selection proof');
      if (
        proof.version !== 1 ||
        proof.fixtureId !== fixtureId ||
        typeof proof.blockNumber !== 'string' ||
        !/^(0|[1-9]\d*)$/.test(proof.blockNumber)
      )
        throw unavailable();
      hash32(proof.blockHash, 'selection checkpoint');
      selected.add(hash32(proof.creationTxHash, 'selection creation'));
    }
    for (const file of files.sort()) {
      const record = validateRecord(json(join(folder, file), 16_384), service.options.config);
      if (
        record.fixtureId !== fixtureId ||
        file !== `${record.creationTxHash.slice(2)}.json` ||
        !selected.has(record.creationTxHash)
      )
        throw unavailable();
      records.push(record);
      selected.delete(record.creationTxHash);
    }
    if (selected.size) throw unavailable();
    if (!service.options.registry.get(fixtureId)) throw unavailable();
  }
  for (const record of service.options.registry.all())
    if (!records.some((r) => digest(r) === digest(record))) throw unavailable();
  for (const registry of service.options.existingRegistry ?? []) {
    if (!registry.directory) throw unavailable();
    directory(registry.directory);
    records.push(
      ...registry.all().filter((r) => r.type.codeHash === V4_DIRECT_CONFIG.protocolHash),
    );
  }
  return records;
}

/**
 * Trusted operator attestation, not cryptographic chain absence. The configured
 * single writer must preserve its durable journals and retained catalogue.
 * Any accepted partial can still be completed after cutoff, so it blocks absence.
 */
function readHistory(service: BatchService) {
  directory(service.options.journal.directory);
  directory(service.store.directory);
  const offerFiles = readdirSync(service.store.directory);
  if (!offerFiles.length || offerFiles.some((name) => !/^[0-9a-f-]{36}\.json$/.test(name)))
    throw unavailable();
  const entries = service.store.all();
  const journalFiles = readdirSync(service.options.journal.directory);
  if (
    journalFiles.some(
      (file) => /^(create|report|close|batch)-.*\.json$/.test(file) && !OPERATION_FILE.test(file),
    )
  )
    throw unavailable();
  const operationFiles = journalFiles.filter((file) => OPERATION_FILE.test(file));
  if (!operationFiles.length || operationFiles.length > 1536) throw unavailable();
  const operations = operationFiles
    .sort()
    .map((file) => service.options.journal.load(file.slice(0, -5))!);
  const records = retainedMarkets(service);
  const creations = operations
    .flatMap((operation) =>
      operation.action === 'batch'
        ? (operation.creations ?? [])
        : operation.action === 'create'
          ? [operation.descriptor]
          : [],
    )
    .filter((r) => r.type.codeHash === V4_DIRECT_CONFIG.protocolHash);
  for (const record of records)
    if (!creations.some((r) => digest(r) === digest(record))) throw unavailable();
  for (const operation of operations.filter(
    (o) => o.action === 'batch' && o.descriptor.type.codeHash === V4_DIRECT_CONFIG.protocolHash,
  )) {
    const entry = entries.find((e) => e.offer.rawHash === operation.transactionHash);
    if (
      !entry?.userSignedBytes ||
      (entry.signedBytes && entry.signedBytes !== operation.signedTransaction)
    )
      throw unavailable();
  }
  for (const entry of entries) {
    const offer = atomicOffer(entry.offer);
    const transaction = ccc.Transaction.fromBytes(offer.unsignedBytes);
    if (
      (['owner-signed', 'signed', 'confirming', 'funded', 'blocked'].includes(entry.state) &&
        !entry.userSignedBytes) ||
      (entry.signedBytes && !entry.userSignedBytes)
    )
      throw unavailable();
    for (const line of offer.lines) {
      const record = validateRecord(line.descriptor, service.options.config);
      if (
        record.type.codeHash !== V4_DIRECT_CONFIG.protocolHash ||
        !['create', 'deposit'].includes(line.mode) ||
        !Number.isSafeInteger(line.outputIndex) ||
        line.outputIndex < 0 ||
        transaction.outputs[line.outputIndex]?.type?.toHex() !==
          ccc.Script.from(record.type).toHex() ||
        (line.mode === 'create' && record.creationTxHash !== offer.rawHash) ||
        line.fixture.termsHash !== record.termsHash
      )
        throw unavailable();
    }
    if (
      offer.lines.some(
        (line) =>
          offer.expiresAt > line.fixture.cutoffMs ||
          line.fixture.cutoffMs !== line.descriptor.cutoffMs ||
          line.fixture.fixtureId !== line.descriptor.fixtureId,
      )
    )
      throw unavailable();
    if (
      entry.signedBytes &&
      !operations.some(
        (o) => o.transactionHash === offer.rawHash && o.signedTransaction === entry.signedBytes,
      )
    )
      throw unavailable();
  }
  return { entries, operations, records, historyDigest: digest([entries, operations, records]) };
}

export async function readCampaignAbsence(
  service: BatchService,
  raw: unknown,
): Promise<CampaignAbsenceSnapshot> {
  const request = parseCampaignAbsenceRequest(raw);
  if (service.options.config.protocolHash !== V4_DIRECT_CONFIG.protocolHash) throw unavailable();
  const history = await service.options.journal.exclusive(async () => readHistory(service));
  // Network reads never hold the payment operator lease. Recheck the immutable
  // snapshot under that lease before issuing an attestation.
  const { entries, operations, records } = history;
  const client = service.options.client,
    tip = await client.getTipHeader();
  if (tip.number < 3n) throw unavailable();
  const checkpoint = await client.getHeaderByNumberNoCache(tip.number - 3n);
  if (!checkpoint || checkpoint.number !== tip.number - 3n) throw unavailable();
  // A mature retained creation anchors this namespace. A new or damaged empty
  // directory cannot manufacture a certificate by merely selecting the same key.
  let anchored = false;
  for (const record of records.slice(0, 4)) {
    const response = await client.getTransactionNoCache(record.creationTxHash);
    if (
      !response ||
      response.status !== 'committed' ||
      response.transaction.hash() !== record.creationTxHash ||
      !response.blockHash ||
      response.blockNumber === undefined ||
      response.blockNumber > checkpoint.number
    )
      continue;
    const header = await client.getHeaderByNumberNoCache(response.blockNumber);
    if (header?.hash !== response.blockHash || header.number !== response.blockNumber) continue;
    const base = Buffer.from(record.type.args.slice(2), 'hex').readUInt32LE(32);
    if (response.transaction.outputs[base]?.type?.toHex() !== ccc.Script.from(record.type).toHex())
      continue;
    anchored = true;
    break;
  }
  if (!anchored) throw unavailable();
  if ((await client.getHeaderByNumberNoCache(checkpoint.number))?.hash !== checkpoint.hash)
    throw unavailable();
  return service.options.journal.exclusive(async () => {
    if (readHistory(service).historyDigest !== history.historyDigest) throw unavailable();
    const now = service.now();
    const fixtureRows = request.fixtures.map((fixture) => ({
      fixtureId: fixture.fixtureId,
      cutoffMs: fixture.cutoffMs,
      status: zeroEligible(fixture, now, Number(checkpoint.timestamp), entries, operations, records)
        ? ('absent' as const)
        : ('unresolved' as const),
    }));
    return {
      version: 1,
      basis: 'operator-attested-empty',
      network: 'testnet',
      protocolHash: V4_DIRECT_CONFIG.protocolHash,
      checkedAt: now,
      checkpoint: {
        blockHash: checkpoint.hash,
        blockNumber: checkpoint.number.toString(),
        timestamp: Number(checkpoint.timestamp),
      },
      historyDigest: history.historyDigest,
      fixtures: fixtureRows,
    };
  });
}
function zeroEligible(
  fixture: CampaignAbsenceRequest['fixtures'][number],
  now: number,
  checkpointTime: number,
  entries: SponsorEntry[],
  operations: SignedOperation[],
  records: DirectMarketRecord[],
): boolean {
  if (now < fixture.cutoffMs + 120_000 || checkpointTime < fixture.cutoffMs + 120_000) return false;
  // Any retained generation-matching fixture intent blocks, even when provider
  // kickoff changed or a cached status says cancelled/rejected. No conflict guess.
  const matches = (r: DirectMarketRecord) =>
    r.fixtureId === fixture.fixtureId && r.type.codeHash === fixture.protocolHash;
  if (
    records.some(matches) ||
    operations.some((o) => (o.creations ?? [o.descriptor]).some(matches))
  )
    return false;
  for (const entry of entries) {
    const offer = atomicOffer(entry.offer);
    if (!offer.lines.some((line) => matches(line.descriptor))) continue;
    if (
      entry.userSignedBytes ||
      entry.signedBytes ||
      offer.expiresAt > now ||
      offer.expiresAt > fixture.cutoffMs
    )
      return false;
  }
  return true;
}

import { ccc } from '@ckb-ccc/core';

export const VERSION = 'testnet-v1' as const;
export const CKB = 100_000_000n;
export const STORAGE = 321n * CKB;
export const MIN_PRINCIPAL = 100n * CKB;
export const SHARD_RESERVE = 610n * CKB;
export const LEGACY_PROTOCOL_HASH =
  '0x5407eb2a5afa2c28b505342e3694e7562e3bed70e38602130087c04d27052d86';
export const PROTOCOL_HASH = '0xc65bfcf86e34da4bb8f51f93e261236418a639699b5fd7f3dfafb5f987e047e0';
export const GUARD_HASH = '0x096ebfed6452d654dcfbf43379c2b6c745dba9af1dabcc3463bbd501a6fdeada';
export const LEGACY_DEPLOYMENT =
  '0xb05048b11a78fc9697c1235ec4e114f2f762559cb9652b61552bc87e8c3fde11';
export const DEPLOYMENT = '0xfb3a8cdb8b79f84785c5847ba53181021bd4f4f2556bf33b0f6883741b50f2fe';
export const RPC = 'https://testnet.ckb.dev/';
export const U64_MAX = (1n << 64n) - 1n;
export type Outcome = 0 | 1 | 2;
export type Point = Readonly<{ txHash: string; index: number }>;
export type Script = Readonly<{ codeHash: string; hashType: 'data2'; args: string }>;
export type Manifest = Readonly<{
  version: typeof VERSION;
  network: 'testnet';
  rpc: typeof RPC;
  protocolHash: string;
  guardHash: typeof GUARD_HASH;
  codeDeps: readonly Readonly<{ outPoint: Point; depType: 'code' }>[];
  limits: Readonly<{
    minPrincipalShannons: string;
    claimStorageShannons: string;
    shards: 4;
    recordsPerShard: 8;
  }>;
  fixtureBinding: 'trusted-operator-catalogue';
}>;
export type Descriptor = Readonly<{
  id: string;
  fixtureId: string;
  label: string;
  cutoffMs: number;
  creationTxHash: string;
  type: Script;
  termsHash: string;
  terms: Readonly<{
    provider: 'football';
    providerFixtureId: string;
    source: 'api-football';
    rules: 'regulation-time-1x2-v1';
    deadlineMs: number;
  }>;
  entryEnabled: boolean;
  entryUnavailableReason?: string;
}>;
export const LEGACY_MANIFEST: Manifest = Object.freeze({
  version: VERSION,
  network: 'testnet',
  rpc: RPC,
  protocolHash: LEGACY_PROTOCOL_HASH,
  guardHash: GUARD_HASH,
  codeDeps: Object.freeze(
    [0, 1].map((index) =>
      Object.freeze({
        outPoint: Object.freeze({ txHash: LEGACY_DEPLOYMENT, index }),
        depType: 'code' as const,
      }),
    ),
  ),
  limits: Object.freeze({
    minPrincipalShannons: MIN_PRINCIPAL.toString(),
    claimStorageShannons: STORAGE.toString(),
    shards: 4,
    recordsPerShard: 8,
  }),
  fixtureBinding: 'trusted-operator-catalogue',
});
// Wire format remains v1; generation is determined by the pinned code hash.
export const MANIFEST: Manifest = Object.freeze({
  ...LEGACY_MANIFEST,
  protocolHash: PROTOCOL_HASH,
  codeDeps: Object.freeze([
    Object.freeze({
      outPoint: Object.freeze({ txHash: DEPLOYMENT, index: 0 }),
      depType: 'code' as const,
    }),
    LEGACY_MANIFEST.codeDeps[1],
  ]),
});
export function protocolManifest(codeHash: string): Manifest {
  if (codeHash === PROTOCOL_HASH) return MANIFEST;
  if (codeHash === LEGACY_PROTOCOL_HASH) return LEGACY_MANIFEST;
  throw Error('This contract deployment is not supported.');
}
export function maxLockArgs(codeHash: string): number {
  protocolManifest(codeHash);
  return codeHash === LEGACY_PROTOCOL_HASH ? 20 : 59;
}

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Invalid direct-market data.');
  return value as Record<string, unknown>;
}
export function text(value: unknown, max = 180): string {
  if (
    typeof value !== 'string' ||
    !value.length ||
    value.length > max ||
    /[\u0000-\u001f]/.test(value)
  )
    throw Error('Invalid direct-market text.');
  return value;
}
export function hex(value: unknown, size: number): string {
  if (typeof value !== 'string' || !new RegExp(`^0x[0-9a-f]{${size * 2}}$`).test(value))
    throw Error('Invalid contract bytes.');
  return value;
}
export function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max)
    throw Error('Invalid contract number.');
  return value;
}
export function bytes(value: string): Uint8Array {
  return ccc.bytesFrom(value);
}
export function read64(data: Uint8Array, offset: number): bigint {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(offset, true);
}
export function point(value: ccc.OutPointLike): Point {
  const p = ccc.OutPoint.from(value);
  return Object.freeze({ txHash: p.txHash, index: Number(p.index) });
}
export function pointKey(value: ccc.OutPointLike): string {
  const p = point(value);
  return `${p.txHash}:${p.index}`;
}
export function parseManifest(value: unknown): Manifest {
  const m = object(value),
    limits = object(m.limits);
  const expected = protocolManifest(String(m.protocolHash));
  if (
    m.version !== VERSION ||
    m.network !== 'testnet' ||
    m.rpc !== RPC ||
    m.guardHash !== GUARD_HASH ||
    m.fixtureBinding !== MANIFEST.fixtureBinding ||
    limits.minPrincipalShannons !== MIN_PRINCIPAL.toString() ||
    limits.claimStorageShannons !== STORAGE.toString() ||
    limits.shards !== 4 ||
    limits.recordsPerShard !== 8 ||
    !Array.isArray(m.codeDeps) ||
    m.codeDeps.length !== expected.codeDeps.length
  )
    throw Error('This contract deployment is not supported.');
  m.codeDeps.forEach((value, index) => {
    const dep = object(value),
      out = object(dep.outPoint);
    if (
      dep.depType !== 'code' ||
      out.txHash !== expected.codeDeps[index].outPoint.txHash ||
      out.index !== expected.codeDeps[index].outPoint.index
    )
      throw Error('Contract deployment dependencies changed.');
  });
  return expected;
}
export async function descriptorTermsHash(
  d: Pick<Descriptor, 'fixtureId' | 'label' | 'cutoffMs' | 'terms'>,
): Promise<string> {
  const t = d.terms;
  const input = JSON.stringify([
    VERSION,
    d.fixtureId,
    d.label,
    d.cutoffMs,
    t.provider,
    t.providerFixtureId,
    t.source,
    t.rules,
    t.deadlineMs,
  ]);
  return ccc.hexFrom(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))),
  );
}
export async function parseDescriptor(value: unknown): Promise<Descriptor> {
  const d = object(value),
    script = object(d.type),
    terms = object(d.terms);
  const args = hex(script.args, 172),
    cutoffMs = integer(d.cutoffMs, 1, Number.MAX_SAFE_INTEGER - 21_600_000);
  const deployment = protocolManifest(String(script.codeHash));
  if (
    script.hashType !== 'data2' ||
    ccc.hexFrom(bytes(args).slice(76, 108)) !== GUARD_HASH ||
    read64(bytes(args), 68) !== BigInt(cutoffMs)
  )
    throw Error('Market cutoff or contract identity changed.');
  if (
    terms.provider !== 'football' ||
    terms.source !== 'api-football' ||
    terms.rules !== 'regulation-time-1x2-v1' ||
    terms.deadlineMs !== cutoffMs + 21_600_000 ||
    typeof d.entryEnabled !== 'boolean'
  )
    throw Error('Unsupported football settlement terms.');
  const parsed: Descriptor = Object.freeze({
    id: text(d.id),
    fixtureId: text(d.fixtureId),
    label: text(d.label),
    cutoffMs,
    creationTxHash: hex(d.creationTxHash, 32),
    type: Object.freeze({ codeHash: deployment.protocolHash, hashType: 'data2', args }),
    termsHash: hex(d.termsHash, 32),
    terms: Object.freeze({
      provider: 'football',
      providerFixtureId: text(terms.providerFixtureId),
      source: 'api-football',
      rules: 'regulation-time-1x2-v1',
      deadlineMs: cutoffMs + 21_600_000,
    }),
    entryEnabled: d.entryEnabled,
    ...(d.entryUnavailableReason === undefined
      ? {}
      : { entryUnavailableReason: text(d.entryUnavailableReason, 300) }),
  });
  if ((await descriptorTermsHash(parsed)) !== parsed.termsHash)
    throw Error('Football fixture terms failed their integrity check.');
  return parsed;
}

export type Ticket = Readonly<{ owner: string; outcome: Outcome; principal: bigint }>;
export type CellState =
  | { kind: 'market'; phase: 0 | 1; outcome: Outcome | 255 }
  | {
      kind: 'shard';
      id: number;
      accepted: readonly Ticket[];
      pending: Ticket | null;
      bytes: Uint8Array;
    }
  | { kind: 'claim'; id: number; ticket: Ticket }
  | { kind: 'reserve'; outcome: Outcome | 255; totals: readonly bigint[] };
function outcome(value: number): Outcome {
  if (value !== 0 && value !== 1 && value !== 2) throw Error('Invalid prediction outcome.');
  return value;
}
function ticket(data: Uint8Array, offset: number): Ticket {
  const principal = read64(data, offset + 33);
  if (principal < MIN_PRINCIPAL || principal > U64_MAX - STORAGE)
    throw Error('Invalid position principal.');
  return Object.freeze({
    owner: ccc.hexFrom(data.slice(offset, offset + 32)),
    outcome: outcome(data[offset + 32]),
    principal,
  });
}
export function decode(data: string): CellState {
  if (!/^0x(?:[0-9a-f]{2}){1,332}$/.test(data)) throw Error('Invalid contract cell data.');
  const b = bytes(data);
  if (b[0] === 0 && b.length === 3 && ((b[1] === 0 && b[2] === 255) || (b[1] === 1 && b[2] < 3)))
    return { kind: 'market', phase: b[1] as 0 | 1, outcome: b[2] === 255 ? 255 : outcome(b[2]) };
  if (
    b[0] === 1 &&
    b.length >= 4 &&
    b[1] < 4 &&
    b[3] <= 1 &&
    b[2] + b[3] <= 8 &&
    b.length === 4 + 41 * (b[2] + b[3])
  )
    return {
      kind: 'shard',
      id: b[1],
      accepted: Array.from({ length: b[2] }, (_, i) => ticket(b, 4 + i * 41)),
      pending: b[3] ? ticket(b, 4 + b[2] * 41) : null,
      bytes: b,
    };
  if (b[0] === 3 && b.length === 43 && b[1] < 32)
    return { kind: 'claim', id: b[1], ticket: ticket(b, 2) };
  if (b[0] === 2 && b.length === 34 && (b[1] < 3 || b[1] === 255) && read64(b, 26) === 0n)
    return {
      kind: 'reserve',
      outcome: b[1] === 255 ? 255 : outcome(b[1]),
      totals: [read64(b, 2), read64(b, 10), read64(b, 18)],
    };
  throw Error('Unknown or malformed contract cell layout.');
}
export function checkCell(cell: ccc.Cell, descriptor: Descriptor): CellState {
  const type = cell.cellOutput.type,
    lock = cell.cellOutput.lock;
  if (
    !type ||
    !type.eq(descriptor.type) ||
    lock.codeHash !== GUARD_HASH ||
    lock.hashType !== 'data2' ||
    lock.args !== type.hash()
  )
    throw Error('Cell does not belong to the pinned market.');
  const state = decode(cell.outputData);
  if (state.kind === 'shard') {
    const expected = [...state.accepted, ...(state.pending ? [state.pending] : [])].reduce(
      (sum, t) => sum + t.principal + STORAGE,
      SHARD_RESERVE,
    );
    if (cell.cellOutput.capacity !== expected)
      throw Error('Shard capacity does not match its positions.');
  }
  if (state.kind === 'claim' && cell.cellOutput.capacity < STORAGE)
    throw Error('Claim storage is underfunded.');
  return state;
}
export function assertSameTerms(a: Descriptor, b: Descriptor): void {
  if (
    a.id !== b.id ||
    a.fixtureId !== b.fixtureId ||
    a.termsHash !== b.termsHash ||
    a.creationTxHash !== b.creationTxHash ||
    a.type.args !== b.type.args ||
    a.type.codeHash !== b.type.codeHash ||
    a.type.hashType !== b.type.hashType ||
    a.cutoffMs !== b.cutoffMs
  )
    throw Error('Market terms changed. Review this prediction again.');
}

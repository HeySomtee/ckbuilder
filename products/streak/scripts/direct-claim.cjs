'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const ccc = require('@ckb-ccc/core');

async function modules() {
  const base = path.resolve(__dirname, '../web/src/features/direct');
  const [protocol, records, client] = await Promise.all([
    import(pathToFileURL(path.join(base, 'protocol.ts')).href),
    import(pathToFileURL(path.join(base, 'journal.ts')).href),
    import(pathToFileURL(path.join(base, 'client.ts')).href),
  ]);
  return { ...protocol, ...records, ...client };
}

function atomicJson(file, value, exclusive = false) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  const descriptor = fs.openSync(temporary, 'wx', 0o600);
  try {
    fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  try {
    if (exclusive) fs.linkSync(temporary, file);
    else fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}
function immutableRecord(record) {
  const {
    status: _status,
    blockHash: _blockHash,
    blockNumber: _blockNumber,
    conflictProof: _conflictProof,
    ...signed
  } = record;
  return JSON.stringify(signed);
}

/** Immutable signed source plus an atomically replaced, replayable observation. */
class FileClaimJournal {
  constructor(directory, parseRecord) {
    this.directory = path.resolve(directory);
    this.parseRecord = parseRecord;
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
  }
  files() {
    const entries = fs
      .readdirSync(this.directory)
      .filter((name) => /^[0-9a-f]{64}\.signed\.json$/.test(name));
    if (entries.length > 128)
      throw Error('Recovery journal exceeds the 128-transaction pilot limit');
    return entries;
  }
  async list(scope) {
    const result = [];
    for (const filename of this.files()) {
      const signedFile = path.join(this.directory, filename),
        stateFile = signedFile.replace(/\.signed\.json$/, '.state.json');
      if (
        fs.statSync(signedFile).size > 300_000 ||
        (fs.existsSync(stateFile) && fs.statSync(stateFile).size > 300_000)
      )
        throw Error('Recovery record is too large');
      const signed = await this.parseRecord(JSON.parse(fs.readFileSync(signedFile, 'utf8')));
      const current = fs.existsSync(stateFile)
        ? await this.parseRecord(JSON.parse(fs.readFileSync(stateFile, 'utf8')))
        : signed;
      if (immutableRecord(current) !== immutableRecord(signed))
        throw Error('Recovery observation changed the immutable signed transaction');
      if (current.scope === scope) result.push(current);
    }
    return result;
  }
  async put(value) {
    const record = await this.parseRecord(value);
    const signedFile = path.join(this.directory, `${record.hash.slice(2)}.signed.json`);
    if (fs.existsSync(signedFile)) {
      const original = await this.parseRecord(JSON.parse(fs.readFileSync(signedFile, 'utf8')));
      if (immutableRecord(original) !== immutableRecord(record))
        throw Error('Cannot replace signed recovery data');
    } else {
      if (this.files().length >= 128) throw Error('Recovery journal is full');
      atomicJson(signedFile, record, true);
    }
    atomicJson(signedFile.replace(/\.signed\.json$/, '.state.json'), record);
  }
  async exclusive(action) {
    const file = path.join(this.directory, 'recovery.lock'),
      token = randomUUID();
    let descriptor;
    try {
      descriptor = fs.openSync(file, 'wx', 0o600);
    } catch (error) {
      if (error.code === 'EEXIST')
        throw Error(
          'This recovery directory is locked. Stop the other recovery process; remove an orphan recovery.lock only after verifying the previous process has stopped.',
        );
      throw error;
    }
    try {
      fs.writeFileSync(descriptor, JSON.stringify({ pid: process.pid, token }), 'utf8');
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    try {
      return await action();
    } finally {
      const current = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (current.token !== token) throw Error('Recovery directory ownership changed');
      fs.unlinkSync(file);
    }
  }
}

async function readRecovery(filename, loaded) {
  loaded ??= await modules();
  const file = path.resolve(filename);
  if (fs.statSync(file).size > 30_000_000) throw Error('Recovery bundle exceeds its size bound');
  const value = loaded.object(JSON.parse(fs.readFileSync(file, 'utf8')));
  if (
    value.format !== 'streak-direct-recovery-v1' ||
    value.network !== 'testnet' ||
    !Array.isArray(value.markets) ||
    value.markets.length > 256 ||
    !Array.isArray(value.records) ||
    value.records.length > 128
  )
    throw Error('Unsupported recovery bundle');
  const manifest = loaded.parseManifest(value.manifest),
    ownerHash = loaded.hex(value.ownerHash, 32);
  const markets = await Promise.all(value.markets.map(loaded.parseDescriptor));
  const records = await Promise.all(value.records.map(loaded.parseRecord));
  if (records.some((record) => record.ownerHash !== ownerHash))
    throw Error('Recovery bundle mixes wallet owners');
  if (new Set(records.map((record) => record.hash)).size !== records.length)
    throw Error('Recovery bundle repeats a signed transaction');
  const known = new Map();
  for (const market of [...markets, ...records.map((record) => record.descriptor)]) {
    const prior = known.get(market.id);
    if (prior) loaded.assertSameTerms(prior, market);
    else known.set(market.id, market);
  }
  return { manifest, ownerHash, markets: [...known.values()], records };
}

async function runClaim(args) {
  if (process.env.NODE_ENV === 'test')
    throw Error('Public testnet recovery CLI is forbidden in routine tests');
  const [bundlePath, command = 'status', ...remaining] = args;
  const shouldBroadcast = remaining.includes('--broadcast');
  const operands = remaining.filter((value) => value !== '--broadcast');
  if (
    !bundlePath ||
    !['status', 'claim', 'resend', 'resolve'].includes(command) ||
    remaining.filter((value) => value === '--broadcast').length > 1 ||
    (command === 'status' && remaining.length !== 0) ||
    (command === 'claim' && operands.length !== 3) ||
    (command === 'resend' && operands.length !== 1) ||
    (command === 'resolve' && (operands.length !== 2 || shouldBroadcast))
  )
    throw Error(
      'Usage: direct-claim.cjs RECOVERY.json status | RECOVERY.json claim MARKET_ID TX_HASH OUTPUT_INDEX [--broadcast] | RECOVERY.json resend SIGNED_TX_HASH [--broadcast] | RECOVERY.json resolve ORIGINAL_TX_HASH CONFLICTING_TX_HASH',
    );
  const loaded = await modules(),
    recovery = await readRecovery(bundlePath, loaded);
  const directory = process.env.STREAK_DIRECT_RECOVERY_DIR;
  if (!directory || !path.isAbsolute(directory))
    throw Error('Set absolute STREAK_DIRECT_RECOVERY_DIR on durable local storage');
  const rpc = new ccc.ClientPublicTestnet({
    url: recovery.manifest.rpc,
    fallbacks: [],
    timeout: 15_000,
    maxConcurrent: 2,
  });
  let signer;
  const privateKey = process.env.STREAK_DIRECT_OWNER_PRIVATE_KEY;
  if (privateKey) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) throw Error('Invalid explicit recovery owner key');
    signer = new ccc.SignerCkbPrivateKey(rpc, privateKey);
  } else {
    if (command === 'claim')
      throw Error(
        'Claim signing requires STREAK_DIRECT_OWNER_PRIVATE_KEY explicitly. No .env or wallet key file is loaded.',
      );
    const address = process.env.STREAK_DIRECT_OWNER_ADDRESS;
    if (!address)
      throw Error(
        'Set STREAK_DIRECT_OWNER_ADDRESS for status or exact-byte resubmission without a private key',
      );
    await ccc.Address.fromString(address, rpc);
    signer = { client: rpc, getRecommendedAddress: async () => address };
  }
  const journal = new FileClaimJournal(directory, loaded.parseRecord);
  const client = new loaded.DirectClient(
    signer,
    recovery.manifest,
    'standalone-recovery',
    journal,
    { exclusive: async (_name, action) => action() },
  );
  const identity = await client.identity();
  if (identity.ownerHash !== recovery.ownerHash)
    throw Error('The connected recovery wallet does not own this bundle');
  for (const [index, expected] of [
    recovery.manifest.protocolHash,
    recovery.manifest.guardHash,
  ].entries()) {
    const code = await rpc.getCellLiveNoCache(
      recovery.manifest.codeDeps[index].outPoint,
      true,
      false,
    );
    if (!code || ccc.hashCkb(code.outputData) !== expected)
      throw Error('The pinned deployed contract is missing or changed');
  }
  await journal.exclusive(async () => {
    const savedRecords = new Map(
      (await journal.list(identity.scope)).map((record) => [record.hash, record]),
    );
    for (const record of recovery.records) {
      // Scope is an off-chain browser namespace. Owner lock/hash and signed bytes remain unchanged.
      const imported = { ...record, scope: identity.scope };
      const existing = savedRecords.get(record.hash);
      if (existing && existing.signedBytes !== record.signedBytes)
        throw Error('The recovery import changed a signed transaction');
      if (!existing) {
        await journal.put(imported);
        savedRecords.set(record.hash, imported);
      }
    }
    if (command === 'status') {
      const transactions = [];
      for (const record of await client.history()) {
        const state = await client.recover(record);
        transactions.push({
          hash: record.hash,
          status: state.status,
          confirmations: state.confirmations,
          message: state.message,
        });
      }
      const markets = [];
      for (const descriptor of recovery.markets.slice(0, 32))
        markets.push(await client.discover(descriptor));
      console.log(
        JSON.stringify(
          {
            ownerHash: identity.ownerHash,
            transactions,
            markets,
            moreMarkets: Math.max(0, recovery.markets.length - 32),
          },
          (_, value) => (typeof value === 'bigint' ? value.toString() : value),
          2,
        ),
      );
      return;
    }
    if (command === 'resolve') {
      const originalHash = loaded.hex(operands[0], 32),
        conflictingHash = loaded.hex(operands[1], 32);
      const original = (await client.history()).find((saved) => saved.hash === originalHash);
      if (!original) throw Error('Original transaction is absent from the durable owner journal');
      const result = await client.resolveConflict(original, conflictingHash);
      console.log(
        JSON.stringify(
          {
            hash: originalHash,
            status: result.status,
            message: result.message,
            conflictProof: result.record.conflictProof,
          },
          null,
          2,
        ),
      );
      return;
    }
    let record;
    if (command === 'resend') {
      const hash = loaded.hex(operands[0], 32);
      record = (await client.history()).find((saved) => saved.hash === hash);
      if (!record) throw Error('This signed hash is absent from the durable recovery journal');
    } else {
      const [marketId, hash, index] = operands;
      const descriptor = recovery.markets.find((market) => market.id === marketId);
      if (!descriptor) throw Error('Choose a market from this wallet recovery bundle');
      if (!/^\d{1,10}$/.test(index) || Number(index) > 0xffffffff)
        throw Error('Invalid claim output index');
      const review = await client.prepareClaim(descriptor, {
        txHash: loaded.hex(hash, 32),
        index: Number(index),
      });
      console.log(
        JSON.stringify(
          {
            review,
            action: shouldBroadcast
              ? 'Signing, persisting and submitting this claim'
              : 'Review only. Pass --broadcast to sign and submit.',
          },
          null,
          2,
        ),
      );
      if (!shouldBroadcast) return;
      record = await client.signAndPersist(review, descriptor);
    }
    const result = shouldBroadcast ? await client.broadcast(record) : await client.recover(record);
    console.log(
      JSON.stringify(
        {
          hash: record.hash,
          status: result.status,
          confirmations: result.confirmations,
          message: result.message,
          explorer: `https://pudge.explorer.nervos.org/transaction/${record.hash}`,
        },
        null,
        2,
      ),
    );
  });
}

module.exports = { FileClaimJournal, readRecovery, runClaim };
if (require.main === module)
  runClaim(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : 'Claim recovery failed');
    process.exitCode = 1;
  });

"use strict";
// Private subprocess for benchmark-backend.cjs. Runs only against copied source.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const http = require("node:http");
const { performance } = require("node:perf_hooks");
const ts = require("typescript");

const job = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const snapshot = path.join(job.run, job.variant);
const source = path.join(snapshot, "src");
const dbFile = path.join(job.run, "databases", `${job.id}.json`);
const scenario = job.scenario;
let activeWork = null;
let expectedPaymentHash = null;
let transferNumber = 0;
const outstanding = new Set();
const metricNames = ["fileReads", "fileReadBytes", "fileWrites", "fileWriteBytes", "fileRenames", "fileDurabilityFlushes",
  "remoteStateReads", "remoteStateReadBytes", "remoteStateWrites", "remoteStateWriteBytes", "providerResultCalls",
  "analyticsWarmCalls", "balanceRpcCalls", "paymentVerificationCalls", "receiptVerificationCalls", "transferPreparations", "transferBroadcasts"];
const newWork = () => Object.fromEntries(metricNames.map((key) => [key, 0]));
function count(key, amount = 1) { if (activeWork) activeWork[key] += amount; }
function remote(counter, milliseconds, result) {
  count(counter);
  const promise = (milliseconds > 0 ? new Promise((done) => setTimeout(done, milliseconds)) : Promise.resolve())
    .then(() => typeof result === "function" ? result() : result);
  outstanding.add(promise);
  promise.then(() => outstanding.delete(promise), () => outstanding.delete(promise));
  return promise;
}
async function drain() {
  await new Promise((done) => setImmediate(done));
  while (outstanding.size) await Promise.allSettled([...outstanding]);
  await new Promise((done) => setImmediate(done));
}

// Compile copied files only. The two baseline adaptations affect test access,
// not request handlers, algorithms or caching behavior.
require.extensions[".ts"] = (module, filename) => {
  assert.ok(path.relative(source, filename) && !path.relative(source, filename).startsWith(".."), "Unexpected TypeScript outside snapshot");
  if (path.basename(filename) === "env.ts") { module._compile("module.exports = {};", filename); return; }
  let code = fs.readFileSync(filename, "utf8");
  if (job.variant === "before" && path.basename(filename) === "server.ts") {
    assert.ok(code.includes("const server = createServer("));
    code = code.replace("const server = createServer(", "export const server = createServer(");
    const boot = code.lastIndexOf("\nboot().catch(");
    assert.ok(boot > 0, "Cannot locate baseline boot entrypoint");
    code = code.slice(0, boot);
  }
  const compiled = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS, esModuleInterop: true, resolveJsonModule: true } });
  module._compile(compiled.outputText, filename);
};

globalThis.fetch = async () => { throw new Error("External HTTP is forbidden by the benchmark"); };
const config = require(path.join(source, "config.ts"));
config.DB_FILE = dbFile;
config.DATA_DIR = path.dirname(dbFile);
const isDB = (file) => {
  const value = path.resolve(String(file));
  return value === dbFile || value.startsWith(dbFile + ".");
};
const realReadFile = fsp.readFile;
fsp.readFile = async (...args) => {
  if (isDB(args[0])) count("fileReads");
  const result = await realReadFile(...args);
  if (isDB(args[0])) count("fileReadBytes", Buffer.byteLength(result));
  return result;
};
const realWriteFile = fsp.writeFile;
fsp.writeFile = async (...args) => {
  if (isDB(args[0])) {
    count("fileWrites"); count("fileWriteBytes", Buffer.byteLength(args[1]));
    if (args[2]?.flush) count("fileDurabilityFlushes");
  }
  return realWriteFile(...args);
};
const realRename = fsp.rename;
fsp.rename = async (...args) => { if (isDB(args[0])) count("fileRenames"); return realRename(...args); };

let seed = JSON.parse(fs.readFileSync(path.join(job.run, "seed.json"), "utf8"));
let remoteDB = structuredClone(seed);
const supabase = require(path.join(source, "store_supabase.ts"));
supabase.supaEnabled = () => scenario.storage === "mock_supabase";
supabase.supaEnsureTable = async () => {};
supabase.supaLoadDB = async () => {
  count("remoteStateReadBytes", Buffer.byteLength(JSON.stringify(remoteDB)));
  return remote("remoteStateReads", scenario.stateReadMs, () => structuredClone(remoteDB));
};
supabase.supaSaveDB = async (db, serialized) => {
  const encoded = serialized ?? JSON.stringify(db);
  count("remoteStateWriteBytes", Buffer.byteLength(encoded));
  await remote("remoteStateWrites", scenario.stateWriteMs, () => { remoteDB = JSON.parse(encoded); });
};

const chain = require(path.join(source, "chain.ts"));
const { ccc } = require("@ckb-ccc/core");
ccc.Address.fromString = async () => ({ script: { hash: () => "synthetic-lock" } });
chain.getClient().getBalanceSingle = () => remote("balanceRpcCalls", scenario.balanceMs, 123_000_000_000n);
chain.getClient().getTransaction = async () => { throw new Error("Unexpected chain transaction query in benchmark"); };
chain.getClient().sendTransaction = async () => { throw new Error("Real transaction submission is forbidden by the benchmark"); };
chain.verifyPaymentToTreasury = async (hash, from, treasury, minimum) => {
  assert.equal(hash, expectedPaymentHash);
  assert.equal(from, seed.users[0].wallet.address);
  assert.equal(treasury, seed.treasury.address);
  assert.equal(minimum, 100);
  return remote("paymentVerificationCalls", scenario.verifyPaymentMs, 10_000_000_000n);
};
const nextTransferHash = () => "0x" + (++transferNumber).toString(16).padStart(64, "0");
chain.transferFrom = async () => {
  await remote("transferPreparations", scenario.prepareTransferMs);
  return remote("transferBroadcasts", scenario.broadcastMs, nextTransferHash());
};
chain.prepareTransfer = async () => {
  await remote("transferPreparations", scenario.prepareTransferMs);
  const txHash = nextTransferHash();
  return { txHash, signedTransaction: "0x" + "ab".repeat(356),
    broadcast: () => remote("transferBroadcasts", scenario.broadcastMs, txHash) };
};

const notifications = require(path.join(source, "notifications", "index.ts"));
for (const [name, value] of Object.entries(notifications)) if (typeof value === "function") notifications[name] = async () => {};
const { provider } = require(path.join(source, "providers", "index.ts"));
provider.ownsMatch = () => true;
provider.fetchResults = () => remote("providerResultCalls", scenario.resultsMs, {});
provider.loadFixtures = () => structuredClone(seed.matches);
provider.prefetchInsights = () => remote("analyticsWarmCalls", scenario.analyticsMs);
provider.status = async () => ({ provider: "worldcup", league: "Synthetic League", enabled: true,
  simulated: false, source: "benchmark", base: "offline", matchCount: seed.matches.length, liveMatches: 0, finishedMatches: 40 });

const store = require(path.join(source, "store.ts"));
const settlement = require(path.join(source, "settlement.ts"));
settlement.verifyReceiptOnChain = () => remote("receiptVerificationCalls", scenario.receiptMs, { ok: true });
settlement.publishReceipt = async () => { throw new Error("Unexpected real receipt publication in benchmark"); };
for (const [index, market] of seed.markets.filter((market) => market.status === "void").entries()) {
  const built = settlement.buildReceiptPayload(seed, market, seed.treasury);
  seed.receipts.push(built.payload);
  market.receipt = { txHash: "0x" + (10_000 + index).toString(16).padStart(64, "0"), index: 0,
    payloadHash: built.payloadHash, merkleRoot: built.payload.bets.merkleRoot, publishedAt: market.resolvedAt };
}
remoteDB = structuredClone(seed);
fs.mkdirSync(path.dirname(dbFile), { recursive: true });
fs.writeFileSync(dbFile, JSON.stringify(seed));

const { server } = require(path.join(source, "server.ts"));
const { createSession } = require(path.join(source, "auth.ts"));
const cookies = seed.users.map((user) => `streak_sid=${createSession(user.id)}`);
const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
let port;

function request(method, route, body, cookie = cookies[0]) {
  return new Promise((resolve, reject) => {
    const encoded = body ? JSON.stringify(body) : undefined;
    const req = http.request({ hostname: "127.0.0.1", port, path: route, method, agent,
      headers: { Cookie: cookie, "Accept-Encoding": "identity", ...(encoded ? {
        "Content-Type": "application/json", "Content-Length": Buffer.byteLength(encoded) } : {}) } }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("error", reject);
      response.on("end", () => {
        const bytes = Buffer.concat(chunks);
        try { resolve({ status: response.statusCode, bytes: bytes.length, body: JSON.parse(bytes.toString("utf8")) }); }
        catch (error) { reject(error); }
      });
    });
    req.setTimeout(10_000, () => req.destroy(new Error(`HTTP benchmark timeout: ${route}`)));
    req.on("error", reject);
    req.end(encoded);
  });
}

const operations = [
  { id: "dashboard", method: "GET", route: () => "/api/dashboard" },
  { id: "markets", method: "GET", route: () => "/api/markets" },
  { id: "market_detail", method: "GET", route: () => "/api/markets/m-bench-match-0" },
  { id: "portfolio", method: "GET", route: () => "/api/portfolio" },
  { id: "crews", method: "GET", route: () => "/api/crews" },
  { id: "wallet_cached_balance", method: "GET", route: () => "/api/wallet" },
  { id: "wallet_first_balance", method: "GET", route: () => "/api/wallet", cookie: (index) => cookies[100 + index] },
  { id: "status", method: "GET", route: () => "/api/status" },
  { id: "receipt_list", method: "GET", route: () => "/api/receipts" },
  { id: "receipt_first_verification", method: "GET", route: (index) => `/api/receipts/m-bench-archive-${index}` },
  { id: "deposit_confirmed_payment", method: "POST", route: () => "/api/wallet/deposit",
    body: (index) => ({ txHash: "0x" + (20_000 + index).toString(16).padStart(64, "0") }), escrowDelta: 10_000_000_000n },
  { id: "bet", method: "POST", route: () => "/api/markets/m-bench-match-0/bet",
    body: () => ({ outcome: "home", amountCkb: 10, asStreakPick: false }), escrowDelta: -1_000_000_000n },
  { id: "withdraw", method: "POST", route: () => "/api/wallet/withdraw",
    body: () => ({ amountCkb: 100 }), escrowDelta: -10_000_000_000n },
];

async function main() {
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  port = server.address().port;
  const result = { id: job.id, scenario: scenario.id, variant: job.variant, block: job.block,
    seedBytesAfterReceiptConstruction: Buffer.byteLength(JSON.stringify(seed)), operations: [] };
  try {
    for (const operation of operations) {
      await drain();
      await store.update((db) => {
        for (const key of Object.keys(db)) delete db[key];
        Object.assign(db, structuredClone(seed));
      });
      const samples = [];
      for (let index = 0; index < job.warmup + job.trials; index++) {
        const body = operation.body?.(index);
        expectedPaymentHash = body?.txHash ?? null;
        const beforeBalance = operation.escrowDelta === undefined ? null :
          await store.read((db) => BigInt(db.users[0].escrowShannons));
        const work = newWork();
        activeWork = work;
        const started = performance.now();
        const response = await request(operation.method, operation.route(index), body, operation.cookie?.(index));
        const elapsedMs = performance.now() - started;
        assert.ok(response.status >= 200 && response.status < 300, `${operation.id}: ${JSON.stringify(response)}`);
        await drain();
        activeWork = null;
        if (operation.escrowDelta !== undefined) {
          assert.equal(await store.read((db) => BigInt(db.users[0].escrowShannons)), beforeBalance + operation.escrowDelta,
            `${operation.id}: exact escrow accounting must hold`);
          assert.equal(work.paymentVerificationCalls, operation.id === "deposit_confirmed_payment" ? 1 : 0);
        }
        if (operation.id === "wallet_first_balance") {
          assert.equal(work.balanceRpcCalls, 1, "Unique wallet must exercise a real cold cache at the mocked RPC boundary");
        }
        if (operation.id === "receipt_first_verification") assert.equal(work.receiptVerificationCalls, 1);
        if (index >= job.warmup) samples.push({ iteration: index - job.warmup, elapsedMs, responseBytes: response.bytes,
          responseStatus: response.status, work });
      }
      result.operations.push({ id: operation.id, method: operation.method, route: operation.route(0),
        warmupIterations: job.warmup, measuredIterations: job.trials, samples });
    }
    fs.writeFileSync(path.join(job.run, `${job.id}.result.json`), JSON.stringify(result, null, 2));
  } finally {
    agent.destroy();
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

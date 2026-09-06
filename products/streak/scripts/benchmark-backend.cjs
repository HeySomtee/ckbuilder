#!/usr/bin/env node
"use strict";

/** Reproducible, isolated before/after benchmark. No live database or network. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { execFileSync, spawn } = require("node:child_process");

const APP = path.resolve(__dirname, "..");
const ROOT = path.resolve(APP, "..", "..");
const SCRATCH = path.join(APP, "data", "benchmark-backend");
const DEFAULT_OUTPUT = path.join(ROOT, "reports", "assets", "week-16", "benchmark-backend.json");
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");
const git = (...gitArgs) => execFileSync("git", gitArgs, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });

function inside(parent, target) {
  const rel = path.relative(parent, path.resolve(target));
  assert.ok(rel && !rel.startsWith("..") && !path.isAbsolute(rel), `Unsafe benchmark path: ${target}`);
}

function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(file) : entry.isFile() ? [file] : [];
  });
}

function snapshotBefore(revision, destination) {
  const manifest = {};
  const names = git("ls-tree", "-r", "--name-only", revision, "--", "products/streak/src", "products/streak/public")
    .toString("utf8").trim().split(/\r?\n/).filter(Boolean);
  for (const name of names) {
    const relative = name.slice("products/streak/".length);
    const output = path.join(destination, relative);
    inside(destination, output);
    const content = git("show", `${revision}:${name}`);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, content);
    manifest[relative] = sha256(content);
  }
  return manifest;
}

function snapshotAfter(destination) {
  const manifest = {};
  for (const directory of ["src", "public"]) {
    for (const file of filesUnder(path.join(APP, directory))) {
      const relative = path.relative(APP, file).split(path.sep).join("/");
      const output = path.join(destination, relative);
      inside(destination, output);
      const content = fs.readFileSync(file);
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(output, content);
      manifest[relative] = sha256(content);
    }
  }
  return manifest;
}

function makeSeed(now) {
  const users = Array.from({ length: 300 }, (_, index) => ({
    id: `bench-user-${index}`, username: `reader_${String(index).padStart(3, "0")}`,
    walletIdentity: `synthetic-identity-${index}`, walletType: "benchmark", createdAt: now.toISOString(),
    wallet: { address: `synthetic-address-${index}` }, escrowShannons: "100000000000000",
    creatorFeesShannons: "0", streak: { current: index % 12, best: index % 19, status: "active" },
    stats: { totalBets: 0, wonBets: 0, lostBets: 0, renews: 0,
      netPnlShannons: String(BigInt(index % 20) * 1_000_000_000n), turnoverShannons: "0" },
  }));
  const matches = Array.from({ length: 120 }, (_, index) => {
    const kickoff = new Date(now.getTime() + (7 * 24 + index) * 3_600_000).toISOString();
    return { id: `bench-match-${index}`, kickoff, date: kickoff.slice(0, 10), stage: `Round ${1 + index % 10}`,
      status: "scheduled", home: { code: `H${index}`, name: `Home Club ${index}` },
      away: { code: `A${index}`, name: `Away Club ${index}` }, sport: "football",
      competition: { id: "benchmark-league", name: "Synthetic League", country: "Test" } };
  });
  const markets = matches.map((match, index) => ({ id: `m-${match.id}`, matchId: match.id,
    creatorId: "system", status: "open", pools: { home: "0", draw: "0", away: "0" },
    totalBets: 0, uniqueBettors: 0, createdAt: now.toISOString(), closesAt: match.kickoff,
    feeBps: { protocol: 200, creator: 100 }, history: Array.from({ length: 20 }, (_, tick) => ({
      t: now.getTime() - (20 - tick) * 60_000, p: { home: 0.4, draw: 0.25, away: 0.35 } })) }));
  const bettors = markets.map(() => new Set());
  const bets = Array.from({ length: 3_600 }, (_, index) => {
    const marketIndex = index % markets.length;
    const userIndex = (index * 7 + Math.floor(index / markets.length)) % users.length;
    const outcome = ["home", "draw", "away"][Math.floor(index / markets.length) % 3];
    const amount = String(BigInt(10 + index % 40) * 100_000_000n);
    const market = markets[marketIndex];
    market.pools[outcome] = String(BigInt(market.pools[outcome]) + BigInt(amount));
    market.totalBets++;
    bettors[marketIndex].add(users[userIndex].id);
    users[userIndex].stats.totalBets++;
    users[userIndex].stats.turnoverShannons = String(BigInt(users[userIndex].stats.turnoverShannons) + BigInt(amount));
    return { id: `bench-bet-${index}`, marketId: market.id, matchId: market.matchId,
      userId: users[userIndex].id, outcome, amount,
      placedAt: new Date(now.getTime() - (3_600 - index) * 60_000).toISOString(),
      priceAtBet: 1 / 3, settled: false, isStreakPick: index % 113 === 0 };
  });
  markets.forEach((market, index) => { market.uniqueBettors = bettors[index].size; });
  for (let index = 0; index < 40; index++) {
    const kickoff = new Date(now.getTime() - (48 + index) * 3_600_000).toISOString();
    const match = { id: `bench-archive-${index}`, kickoff, date: kickoff.slice(0, 10), stage: "Archive",
      status: "final", result: "home", score: { home: 1, away: 0 },
      home: { code: "OLD", name: "Archive Home" }, away: { code: "LOG", name: "Archive Away" } };
    matches.push(match);
    markets.push({ id: `m-${match.id}`, matchId: match.id, creatorId: "system", status: "void",
      pools: { home: "0", draw: "0", away: "0" }, totalBets: 0, uniqueBettors: 0,
      createdAt: kickoff, closesAt: kickoff, resolvedAt: kickoff, resolvedOutcome: "void",
      feeBps: { protocol: 200, creator: 100 }, history: [] });
  }
  const history = (kind, count) => Array.from({ length: count }, (_, index) => ({
    id: `seed-${kind}-${index}`, userId: users[index % users.length].id, amountShannons: "10000000000",
    txHash: "0x" + crypto.createHash("sha256").update(`${kind}-${index}`).digest("hex"),
    at: new Date(now.getTime() - (count - index) * 3_600_000).toISOString(),
  }));
  return { schema: 4, matchesSchema: 3, users, matches, markets, bets,
    deposits: history("deposit", 600), withdraws: history("withdraw", 300), renewalTxs: [],
    treasury: { address: "synthetic-treasury", privateKey: "NOT-A-REAL-KEY" },
    protocolFeesShannons: "0", receipts: [], telegramLinks: [],
    crews: Array.from({ length: 30 }, (_, index) => ({ id: `bench-crew-${index}`, name: `Book Club ${index}`,
      ownerId: users[index * 10].id, inviteCode: `BOOK${index}`, createdAt: now.toISOString(),
      memberIds: users.slice(index * 10, index * 10 + 10).map((user) => user.id) })) };
}

function prepare() {
  fs.mkdirSync(SCRATCH, { recursive: true });
  const run = fs.mkdtempSync(path.join(SCRATCH, "run-"));
  inside(SCRATCH, run);
  const baseline = git("rev-parse", option("--baseline", "00d4b8f")).toString("utf8").trim();
  const manifests = {
    before: snapshotBefore(baseline, path.join(run, "before")),
    after: snapshotAfter(path.join(run, "after")),
  };
  const seed = makeSeed(new Date());
  fs.writeFileSync(path.join(run, "seed.json"), JSON.stringify(seed));
  const settings = { baseline, preparedAt: new Date().toISOString(), manifests,
    sourceSnapshotHashes: Object.fromEntries(Object.entries(manifests).map(([key, manifest]) => [key, sha256(JSON.stringify(manifest))])),
    seed: { sha256: sha256(JSON.stringify(seed)), bytes: Buffer.byteLength(JSON.stringify(seed)),
      users: seed.users.length, fixtures: seed.matches.length, markets: seed.markets.length,
      bets: seed.bets.length, deposits: seed.deposits.length, withdrawals: seed.withdraws.length, crews: seed.crews.length },
  };
  fs.writeFileSync(path.join(run, "settings.json"), JSON.stringify(settings, null, 2));
  return run;
}

async function worker(job) {
  const jobFile = path.join(job.run, `${job.id}.job.json`);
  fs.writeFileSync(jobFile, JSON.stringify(job));
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, "benchmark-backend-worker.cjs"), jobFile], {
      cwd: job.run, stdio: ["ignore", "inherit", "inherit"], windowsHide: true,
      env: { ...process.env, SUPABASE_URL: "", SUPABASE_KEY: "", SUPABASE_DB_URL: "",
        TELEGRAM_BOT_TOKEN: "", TELEGRAM_BOT_USERNAME: "", TELEGRAM_WEBHOOK_SECRET: "",
        API_SPORTS_KEY: "", MATCH_PROVIDER: "worldcup", TREASURY_PRIVATE_KEY: "" },
    });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${job.id} exited ${code}`)));
  });
  return JSON.parse(fs.readFileSync(path.join(job.run, `${job.id}.result.json`), "utf8"));
}

function summarize(values) {
  const ordered = [...values].sort((a, b) => a - b);
  const quantile = (q) => ordered[Math.max(0, Math.ceil(q * ordered.length) - 1)];
  return { count: values.length, medianMs: (ordered[Math.floor((ordered.length - 1) / 2)] + ordered[Math.floor(ordered.length / 2)]) / 2,
    p95Ms: quantile(0.95), minMs: ordered[0], maxMs: ordered.at(-1), meanMs: values.reduce((sum, value) => sum + value, 0) / values.length };
}

async function main() {
  const run = option("--run-directory", null) ? path.resolve(option("--run-directory")) : prepare();
  inside(SCRATCH, run);
  if (args.includes("--prepare-only")) { console.log(run); return; }
  const settings = JSON.parse(fs.readFileSync(path.join(run, "settings.json"), "utf8"));
  const trials = Number(option("--trials", 30));
  const warmup = Number(option("--warmup", 5));
  assert.ok(Number.isInteger(trials) && trials >= 2 && trials % 2 === 0, "Use an even measured trial count >= 2");
  assert.ok(Number.isInteger(warmup) && warmup >= 0);
  const scenarios = [
    { id: "local_file_zero_remote_delay", storage: "file", stateReadMs: 0, stateWriteMs: 0,
      resultsMs: 0, analyticsMs: 0, balanceMs: 0, verifyPaymentMs: 0, receiptMs: 0, prepareTransferMs: 0, broadcastMs: 0 },
    { id: "modeled_remote_store_40ms", storage: "mock_supabase", stateReadMs: 40, stateWriteMs: 40,
      resultsMs: 0, analyticsMs: 0, balanceMs: 0, verifyPaymentMs: 0, receiptMs: 0, prepareTransferMs: 0, broadcastMs: 0 },
    { id: "modeled_remote_services", storage: "mock_supabase", stateReadMs: 40, stateWriteMs: 40,
      resultsMs: 80, analyticsMs: 40, balanceMs: 80, verifyPaymentMs: 250, receiptMs: 80, prepareTransferMs: 100, broadcastMs: 100 },
  ].filter((scenario) => !option("--scenario", null) || scenario.id === option("--scenario"));
  assert.ok(scenarios.length, "Unknown scenario");
  const startedAt = new Date().toISOString();
  const blocks = [];
  for (const [scenarioIndex, scenario] of scenarios.entries()) {
    const order = scenarioIndex % 2 === 0 ? ["before", "after", "after", "before"] : ["after", "before", "before", "after"];
    for (const [block, variant] of order.entries()) {
      const id = `${scenario.id}-${block}-${variant}`;
      console.log(`[benchmark] ${id}: ${trials / 2} measured + ${warmup} warmup per operation`);
      blocks.push(await worker({ run, scenario, variant, id, block, trials: trials / 2, warmup }));
    }
  }
  const comparisons = [];
  for (const scenario of scenarios) {
    const operations = blocks.find((block) => block.scenario === scenario.id).operations.map((operation) => operation.id);
    for (const operation of operations) {
      const variants = {};
      for (const variant of ["before", "after"]) {
        const matching = blocks.filter((block) => block.scenario === scenario.id && block.variant === variant)
          .flatMap((block) => block.operations.filter((row) => row.id === operation));
        const samples = matching.flatMap((row) => row.samples);
        const countKeys = Object.keys(samples[0].work);
        variants[variant] = { ...summarize(samples.map((sample) => sample.elapsedMs)),
          meanWork: Object.fromEntries(countKeys.map((key) => [key, samples.reduce((sum, sample) => sum + sample.work[key], 0) / samples.length])) };
      }
      comparisons.push({ scenario: scenario.id, operation, ...variants,
        medianChangePercent: (variants.after.medianMs / variants.before.medianMs - 1) * 100,
        medianSpeedup: variants.before.medianMs / variants.after.medianMs });
    }
  }
  const output = path.resolve(option("--output", DEFAULT_OUTPUT));
  inside(ROOT, output);
  const result = { schemaVersion: 1, startedAt, finishedAt: new Date().toISOString(),
    baselineCommit: settings.baseline, workingTreeSnapshotAt: settings.preparedAt,
    sourceSnapshotHashes: settings.sourceSnapshotHashes, sourceFileHashes: settings.manifests,
    machine: { node: process.version, v8: process.versions.v8, os: os.type(), release: os.release(),
      architecture: os.arch(), cpu: os.cpus()[0]?.model, logicalCpuCount: os.cpus().length,
      totalMemoryBytes: os.totalmem() },
    methodology: { trialsPerOperationPerVariant: trials, blocksPerVariant: 2, warmupPerBlock: warmup,
      concurrency: 1, scenarios, seed: settings.seed, transport: "HTTP over loopback, keep-alive, Accept-Encoding: identity",
      measuredInterval: "From issuing the HTTP request through fully receiving and parsing its response body; seed setup, warmup, validation and background-drain wait excluded.",
      stateReset: "Same synthetic seed restored before each operation block; successful warmup and measured mutations then append in identical order in both variants.",
      order: "Two blocks per variant in ABBA order, reversed for alternate scenarios; no simultaneous before/after requests or worker processes.",
      adaptations: ["TypeScript is transpiled with the same installed compiler (ES2020 CommonJS) in both isolated source snapshots; compilation is excluded from timings.",
        "Baseline server variable is exported and its final boot() invocation is removed in memory; no HTTP handler code is changed.",
        "The environment-loader module is disabled in both snapshots and config.DB_FILE is redirected to each worker's private synthetic file.",
        "Provider, chain, notifications and optionally Supabase boundaries are replaced with deterministic local promises; unexpected external HTTP is rejected.",
        "Database readFile/writeFile/rename and mock remote-state calls are counted; after's flush:true durability writes are counted separately.",
        "Background timers/boot work are disabled for both versions. After still performs any refresh scheduled by its real request handlers; those are drained between samples."],
      limitations: ["Synthetic fixture/history sizes are fixed; this is not a production or internet latency measurement.",
        "Modeled service delays are injected on provider/chain boundary invocations, not sampled from live APIs; provider-specific caching is bypassed equally.",
        "Deposit timing begins with an already committed transaction and includes application verification/persistence only. Wallet signing and blockchain confirmation time are excluded.",
        "Withdrawals include matched simulated preparation/broadcast delays. After intentionally adds reservation and signed-payload persistence for recovery, plus file flushes.",
        "Immediate sequential requests emphasize warmed caches; real think time, process restarts, multi-instance storage contention and WAN latency are not covered."] },
    comparisons, blocks };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
  console.log(`[benchmark] saved ${path.relative(ROOT, output)}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

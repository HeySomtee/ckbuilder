/* Reproducible, offline settlement-only comparison against a Git revision.
 * Run from any directory: node scripts/benchmark-settlement.cjs --baseline=HEAD
 * No store, provider, signing, broadcasting or live balance operation is allowed.
 */
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const Module = require("node:module");
const ts = require("typescript");

const product = path.resolve(__dirname, "..");
const repository = path.resolve(product, "../..");
const options = Object.fromEntries(process.argv.slice(2).map((arg) => {
  assert.ok(arg.startsWith("--") && arg.includes("="), `Expected --name=value: ${arg}`);
  const split = arg.indexOf("=");
  return [arg.slice(2, split), arg.slice(split + 1)];
}));
const baselineRef = options.baseline || "HEAD";
const sampleCount = Number(options.samples || 30);
const warmupCount = Number(options.warmup || 5);
assert.ok(Number.isInteger(sampleCount) && sampleCount >= 5 && sampleCount <= 1000);
assert.ok(Number.isInteger(warmupCount) && warmupCount >= 0 && warmupCount <= 100);
const git = (...args) => execFileSync("git", args, { cwd: repository, encoding: "utf8" }).trimEnd();
const baselineCommit = git("rev-parse", "--verify", `${baselineRef}^{commit}`);
const beforeSource = git("show", `${baselineCommit}:products/streak/src/markets.ts`);
const afterSource = fs.readFileSync(path.join(product, "src/markets.ts"), "utf8");

function compile(source, dependencies, filename) {
  const absoluteFilename = path.join(product, "src", filename);
  const compiled = new Module(absoluteFilename);
  compiled.filename = absoluteFilename;
  compiled.paths = Module._nodeModulePaths(path.dirname(absoluteFilename));
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  }).outputText;
  compiled.require = (name) => {
    assert.ok(name in dependencies, `Unexpected benchmark dependency: ${name}`);
    return dependencies[name];
  };
  // Both versions run in the ordinary CommonJS realm. A VM context would add
  // cross-realm overhead to array callbacks and distort this comparison.
  compiled._compile(`const process = { env: {} };\n${code}`, absoluteFilename);
  return compiled.exports;
}

const beforeConfig = compile(git("show", `${baselineCommit}:products/streak/src/config.ts`), { path }, "config.before.ts");
const afterConfig = compile(fs.readFileSync(path.join(product, "src/config.ts"), "utf8"), { path }, "config.after.ts");
const forbidden = () => { throw new Error("Settlement benchmark attempted external I/O"); };
const dependencies = {
  crypto: require("node:crypto"),
  "./chain": { abbrevAddress: forbidden, ckbToShannons: forbidden, shannonsToCkb: forbidden },
  "./matches": { matchLabel: forbidden },
  "./store": { read: forbidden, update: forbidden },
  "./wallet": {
    asBig: (value) => value == null || value === "" ? 0n : BigInt(value),
    asString: (value) => value.toString(),
  },
  "./notifications": { notifyPick: forbidden },
};
const before = compile(beforeSource, { ...dependencies, "./config": beforeConfig }, "markets.before.ts");
const after = compile(afterSource, { ...dependencies, "./config": afterConfig }, "markets.after.ts");

const userCount = 2_000;
const marketCount = 500;
const betsPerMarket = 40;
const users = Array.from({ length: userCount }, (_, i) => ({
  id: `user-${i}`, walletIdentity: `user-${i}`, walletType: "benchmark",
  createdAt: "2026-01-01T00:00:00.000Z", wallet: { address: "offline-fixture" },
  escrowShannons: "0", creatorFeesShannons: "0",
  streak: { current: 0, best: 0, status: "active" },
  stats: { totalBets: 0, wonBets: 0, lostBets: 0, renews: 0, netPnlShannons: "0", turnoverShannons: "0" },
}));
const matches = Array.from({ length: marketCount }, (_, i) => ({
  id: `fixture-${i}`, date: "2026-01-01", kickoff: "2026-01-01T00:00:00.000Z",
  stage: "Offline benchmark", status: "final", result: "home",
  home: { code: "HOM", name: "Home", flag: "" }, away: { code: "AWY", name: "Away", flag: "" },
}));
const fixture = {
  schema: afterConfig.DB_SCHEMA, users, matches, markets: [], bets: [],
  deposits: [], withdraws: [], protocolFeesShannons: "0", receipts: [], crews: [],
};
after.ensureMarketsForMatches(fixture);
for (let marketIndex = 0; marketIndex < marketCount; marketIndex++) {
  const market = fixture.markets[marketIndex];
  market.pools = { home: "20000000000", draw: "0", away: "20000000000" };
  market.totalBets = betsPerMarket;
  market.uniqueBettors = betsPerMarket;
  for (let betIndex = 0; betIndex < betsPerMarket; betIndex++) {
    fixture.bets.push({
      id: `bet-${marketIndex}-${betIndex}`, marketId: market.id, matchId: market.matchId,
      userId: `user-${(marketIndex * betsPerMarket + betIndex) % userCount}`,
      outcome: betIndex % 2 ? "home" : "away", amount: "1000000000",
      placedAt: "2026-01-01T00:00:00.000Z", priceAtBet: 0.5, settled: false,
    });
  }
}

function accounting(db) {
  // Timestamps and history-tick times naturally differ between sequential runs.
  // Every user/bet field and all financial outcome metadata must still match.
  return JSON.stringify({
    users: db.users,
    bets: db.bets,
    protocolFeesShannons: db.protocolFeesShannons,
    markets: db.markets.map(({ status, payout, resolvedOutcome }) => ({ status, payout, resolvedOutcome })),
  });
}

function run(engine) {
  const db = structuredClone(fixture); // Reset and cloning are outside the timed window.
  const start = performance.now();
  const resolved = engine.settleMarkets(db);
  const milliseconds = performance.now() - start;
  assert.equal(resolved.length, marketCount);
  return { milliseconds, accounting: accounting(db) };
}

const samples = { before: [], after: [] };
for (let index = -warmupCount; index < sampleCount; index++) {
  // Alternate run order to reduce consistent first/second execution bias.
  const order = Math.abs(index) % 2 ? ["after", "before"] : ["before", "after"];
  const pair = {};
  for (const name of order) pair[name] = run(name === "before" ? before : after);
  assert.equal(pair.after.accounting, pair.before.accounting, "Financial settlement changed between versions");
  if (index >= 0) for (const name of order) samples[name].push(pair[name].milliseconds);
}

const rounded = (value) => Number(value.toFixed(3));
function distribution(values) {
  const ordered = [...values].sort((a, b) => a - b);
  const half = Math.floor(ordered.length / 2);
  const median = ordered.length % 2 ? ordered[half] : (ordered[half - 1] + ordered[half]) / 2;
  return {
    medianMs: rounded(median),
    p95Ms: rounded(ordered[Math.ceil(ordered.length * 0.95) - 1]),
    minMs: rounded(ordered[0]),
    maxMs: rounded(ordered.at(-1)),
    samplesMs: values.map(rounded),
  };
}
const beforeDistribution = distribution(samples.before);
const afterDistribution = distribution(samples.after);
const result = {
  generatedAt: new Date().toISOString(),
  scenario: "Offline in-memory settlement of final markets",
  baselineRef,
  baselineCommit,
  afterSourceSha256: require("node:crypto").createHash("sha256").update(afterSource).digest("hex"),
  environment: { node: process.version, platform: process.platform, architecture: process.arch, cpu: os.cpus()[0]?.model },
  fixture: { markets: marketCount, users: userCount, bets: fixture.bets.length, outcomes: "Equal home/away pools, home wins" },
  methodology: {
    measuredSamplesPerVersion: sampleCount,
    warmupsPerVersion: warmupCount,
    order: "Alternating before/after pairs",
    execution: "Both versions compiled into the same Node CommonJS realm with controlled offline module boundaries",
    timedWork: "settleMarkets(db) only; setup, compilation, clone and accounting comparison excluded",
    financialOutputsIdenticalEveryPair: true,
    externalIo: "Forbidden; no database, RPC, signatures, broadcasting, browser or provider calls",
  },
  before: beforeDistribution,
  after: afterDistribution,
  medianSpeedup: rounded(beforeDistribution.medianMs / afterDistribution.medianMs),
  medianReductionPercent: rounded(100 * (1 - afterDistribution.medianMs / beforeDistribution.medianMs)),
  limitations: [
    "Synthetic final-market workload; does not measure production load or browser latency.",
    "Does not measure receipt publication or blockchain confirmation time.",
    "Offline boundaries replace unrelated modules; the actual Git/current settlement engine code is executed.",
    "Node, hardware, background load and workload shape affect timing.",
  ],
};
const json = JSON.stringify(result, null, 2) + "\n";
if (options.output) {
  const output = path.resolve(options.output);
  const relative = path.relative(repository, output);
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "Output must stay inside the repository");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, json);
}
console.log(json);

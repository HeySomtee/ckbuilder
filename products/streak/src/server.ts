/**
 * Streak Terminal — HTTP server.
 *
 * Dependency-free Node http server. Static assets from /public, JSON API
 * under /api. Sessions ride in an httpOnly cookie. A background loop keeps
 * the fixture slate fresh and settles markets as matches finalise.
 *
 *   npm start  →  http://localhost:4100
 */

import "./env";

import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { extname, join, normalize, resolve } from "path";
import { randomUUID } from "crypto";
import { URL } from "url";

import { PORT, PUBLIC_DIR, RENEW_FEE_CKB, SESSION_COOKIE, SETTLE_INTERVAL_MS,
  MIN_BET_CKB, MAX_BET_CKB, MIN_ONCHAIN_CKB, PROTOCOL_FEE_BPS, CREATOR_FEE_BPS } from "./config";
import { read } from "./store";
import {
  createSession,
  destroySession,
  getSessionUserId,
  hashPassword,
  validatePassword,
  validateUsername,
  verifyPassword,
} from "./auth";
import {
  GameError,
  leaderboard,
  renewStreak,
  resetStreak,
  syncMatches,
  toPublicUser,
} from "./game";
import {
  MarketError,
  OUTCOMES,
  getMarketDetail,
  listMarkets,
  placeBet,
  portfolio,
} from "./markets";
import {
  WalletError,
  asBig,
  deposit,
  getTreasury,
  withdraw,
} from "./wallet";
import { addressUrl, createWallet, getBalanceShannons, shannonsToCkb, txUrl } from "./chain";
import { liveScoresStatus } from "./livescores";
import type { Outcome, User } from "./types";

// ── HTTP helpers ────────────────────────────────────────────────────────────

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".json": "application/json; charset=utf-8",
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function parseCookies(req: IncomingMessage): Record<string, string> {
  const header = req.headers.cookie ?? "";
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function setSessionCookie(res: ServerResponse, token: string): void {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 7}`,
  );
}

function clearSessionCookie(res: ServerResponse): void {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

async function readJson(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 1_000_000) throw new Error("Body too large");
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function currentUserId(req: IncomingMessage): string | null {
  return getSessionUserId(parseCookies(req)[SESSION_COOKIE]);
}

// ── Static files ────────────────────────────────────────────────────────────

async function serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
  let rel = decodeURIComponent(pathname);
  if (rel === "/" || rel === "") rel = "/index.html";
  const filePath = normalize(join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(resolve(PUBLIC_DIR))) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const s = await stat(filePath);
    if (!s.isFile()) throw new Error("not a file");
    res.writeHead(200, {
      "Content-Type": MIME[extname(filePath)] ?? "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    createReadStream(filePath).pipe(res);
  } catch {
    try {
      res.writeHead(200, { "Content-Type": MIME[".html"] });
      createReadStream(join(PUBLIC_DIR, "index.html")).pipe(res);
    } catch {
      res.writeHead(404).end("Not found");
    }
  }
}

// ── Auth handlers ───────────────────────────────────────────────────────────

async function handleSignup(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req);
  const username = validateUsername(body.username);
  const password = validatePassword(body.password);
  if (!username) return sendJson(res, 400, { error: "Username must be 3–20 letters, numbers or _." });
  if (!password) return sendJson(res, 400, { error: "Password must be at least 6 characters." });

  const exists = await read((db) =>
    db.users.some((u) => u.username.toLowerCase() === username.toLowerCase()),
  );
  if (exists) return sendJson(res, 409, { error: "That username is taken." });

  const wallet = await createWallet();
  const { hash, salt } = hashPassword(password);

  const user: User = {
    id: randomUUID(),
    username,
    passwordHash: hash,
    passwordSalt: salt,
    createdAt: new Date().toISOString(),
    wallet,
    escrowShannons: "0",
    creatorFeesShannons: "0",
    streak: { current: 0, best: 0, status: "active" },
    stats: {
      totalBets: 0,
      wonBets: 0,
      lostBets: 0,
      renews: 0,
      netPnlShannons: "0",
      turnoverShannons: "0",
    },
  };
  await (await import("./store")).update((db) => {
    db.users.push(user);
  });

  const token = createSession(user.id);
  setSessionCookie(res, token);
  sendJson(res, 201, {
    user: await toPublicUser(user),
    walletAddress: wallet.address,
    walletExplorer: addressUrl(wallet.address),
    justCreated: true,
  });
}

async function handleLogin(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req);
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  const user = await read((db) =>
    db.users.find((u) => u.username.toLowerCase() === username.toLowerCase()),
  );
  if (!user || !verifyPassword(password, user.passwordHash, user.passwordSalt)) {
    return sendJson(res, 401, { error: "Invalid username or password." });
  }
  const token = createSession(user.id);
  setSessionCookie(res, token);
  sendJson(res, 200, { user: await toPublicUser(user) });
}

async function handleLogout(req: IncomingMessage, res: ServerResponse): Promise<void> {
  destroySession(parseCookies(req)[SESSION_COOKIE]);
  clearSessionCookie(res);
  sendJson(res, 200, { ok: true });
}

async function requireUser(req: IncomingMessage, res: ServerResponse): Promise<User | null> {
  const id = currentUserId(req);
  if (!id) {
    sendJson(res, 401, { error: "Not signed in." });
    return null;
  }
  const user = await read((db) => db.users.find((u) => u.id === id));
  if (!user) {
    sendJson(res, 401, { error: "Session expired." });
    return null;
  }
  return user;
}

async function handleMe(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const user = await requireUser(req, res);
  if (!user) return;
  sendJson(res, 200, { user: await toPublicUser(user) });
}

// ── Terminal home (one-shot dashboard payload) ──────────────────────────────

async function handleDashboard(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const user = await requireUser(req, res);
  if (!user) return;

  await syncMatches();
  const fresh = await read((db) => db.users.find((u) => u.id === user.id))!;
  const board = await leaderboard(user.id);
  const live = await liveScoresStatus();

  // Headline (next or current featured market): first open market closing soonest.
  const all = await listMarkets();
  const headline = all.find((m) => m.status === "open") ?? all.find((m) => m.status === "closed");

  // Recent bets across the platform for the ticker.
  const recentBets = await read((db) =>
    db.bets
      .slice()
      .sort((a, b) => b.placedAt.localeCompare(a.placedAt))
      .slice(0, 12)
      .map((b) => {
        const u = db.users.find((x) => x.id === b.userId);
        const m = db.matches.find((x) => x.id === b.matchId);
        return {
          user: u?.username ?? "—",
          outcome: b.outcome,
          amountCkb: shannonsToCkb(asBig(b.amount)),
          matchLabel: m ? `${m.home.code}–${m.away.code}` : b.matchId,
          placedAt: b.placedAt,
        };
      }),
  );

  let walletBalanceCkb = "—";
  try {
    walletBalanceCkb = shannonsToCkb(await getBalanceShannons(user.wallet.address));
  } catch {
    /* chain may be unreachable */
  }

  const counts = await read((db) => ({
    openMarkets: db.markets.filter((m) => m.status === "open").length,
    closedMarkets: db.markets.filter((m) => m.status === "closed").length,
    resolvedMarkets: db.markets.filter((m) => m.status === "resolved").length,
    totalPoolCkb: shannonsToCkb(
      db.markets.reduce(
        (acc, m) =>
          acc + asBig(m.pools.home) + asBig(m.pools.draw) + asBig(m.pools.away),
        0n,
      ),
    ),
  }));

  sendJson(res, 200, {
    user: await toPublicUser(fresh!),
    walletBalanceCkb,
    walletAddress: user.wallet.address,
    walletExplorer: addressUrl(user.wallet.address),
    headline: headline ?? null,
    recentBets,
    counts,
    rank: board.find((r) => r.isMe)?.rank ?? null,
    leaderboardTop: board.slice(0, 5),
    live,
    constants: {
      minBetCkb: MIN_BET_CKB,
      maxBetCkb: MAX_BET_CKB,
      minOnchainCkb: MIN_ONCHAIN_CKB,
      renewFeeCkb: RENEW_FEE_CKB,
      protocolFeeBps: PROTOCOL_FEE_BPS,
      creatorFeeBps: CREATOR_FEE_BPS,
    },
  });
}

// ── Markets ─────────────────────────────────────────────────────────────────

async function handleMarkets(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  await syncMatches();
  const status = url.searchParams.get("status") as any;
  const matchId = url.searchParams.get("matchId") ?? undefined;
  const markets = await listMarkets({
    status: status === "open" || status === "closed" || status === "resolved" || status === "void" ? status : undefined,
    matchId,
  });
  sendJson(res, 200, { markets });
}

async function handleMarketDetail(req: IncomingMessage, res: ServerResponse, id: string): Promise<void> {
  await syncMatches();
  const meId = currentUserId(req) ?? undefined;
  const detail = await getMarketDetail(id, meId);
  if (!detail) return sendJson(res, 404, { error: "Market not found." });
  sendJson(res, 200, { market: detail });
}

async function handleBet(req: IncomingMessage, res: ServerResponse, marketId: string): Promise<void> {
  const user = await requireUser(req, res);
  if (!user) return;
  const body = await readJson(req);
  const outcome = body.outcome as Outcome;
  const amountCkb = Number(body.amountCkb);
  const asStreakPick = !!body.asStreakPick;

  if (!OUTCOMES.includes(outcome)) {
    return sendJson(res, 400, { error: "Invalid outcome." });
  }
  // marketId on the URL is the canonical id; resolve to matchId via store.
  const matchId = await read((db) => db.markets.find((m) => m.id === marketId)?.matchId);
  if (!matchId) return sendJson(res, 404, { error: "Market not found." });

  try {
    const r = await placeBet({ userId: user.id, matchId, outcome, amountCkb, asStreakPick });
    sendJson(res, 201, {
      bet: r.bet,
      newEscrowCkb: r.newEscrowCkb,
      pools: r.market.pools,
    });
  } catch (err) {
    if (err instanceof MarketError) return sendJson(res, 400, { error: err.message, code: err.code });
    throw err;
  }
}

// ── Portfolio ───────────────────────────────────────────────────────────────

async function handlePortfolio(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const user = await requireUser(req, res);
  if (!user) return;
  await syncMatches();
  const positions = await portfolio(user.id);
  // Aggregate exposure: still-open stake, settled wins, settled losses.
  let openStakeShannons = 0n;
  let realisedPnlShannons = 0n;
  for (const p of positions) {
    if (!p.settled) openStakeShannons += BigInt(Math.round(Number(p.amountCkb) * 1e8));
    if (p.settled && p.pnlCkb) realisedPnlShannons += BigInt(Math.round(Number(p.pnlCkb) * 1e8));
  }
  sendJson(res, 200, {
    positions,
    openStakeCkb: shannonsToCkb(openStakeShannons),
    realisedPnlCkb: shannonsToCkb(realisedPnlShannons),
  });
}

// ── Wallet (escrow ↔ on-chain) ──────────────────────────────────────────────

async function handleWallet(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const user = await requireUser(req, res);
  if (!user) return;
  let chainBalanceCkb = "—";
  try {
    chainBalanceCkb = shannonsToCkb(await getBalanceShannons(user.wallet.address));
  } catch {
    /* ignore */
  }
  const treasury = await getTreasury();
  const recent = await read((db) => ({
    deposits: db.deposits
      .filter((d) => d.userId === user.id)
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 20)
      .map((d) => ({
        amountCkb: shannonsToCkb(asBig(d.amountShannons)),
        txHash: d.txHash,
        explorer: txUrl(d.txHash),
        at: d.at,
      })),
    withdraws: db.withdraws
      .filter((d) => d.userId === user.id)
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 20)
      .map((d) => ({
        amountCkb: shannonsToCkb(asBig(d.amountShannons)),
        txHash: d.txHash,
        explorer: txUrl(d.txHash),
        at: d.at,
      })),
  }));
  sendJson(res, 200, {
    address: user.wallet.address,
    explorer: addressUrl(user.wallet.address),
    faucet: "https://faucet.nervos.org/",
    chainBalanceCkb,
    escrowCkb: shannonsToCkb(asBig(user.escrowShannons)),
    creatorFeesCkb: shannonsToCkb(asBig(user.creatorFeesShannons)),
    treasuryAddress: treasury.address,
    treasuryExplorer: addressUrl(treasury.address),
    minOnchainCkb: MIN_ONCHAIN_CKB,
    renewFeeCkb: RENEW_FEE_CKB,
    recent,
  });
}

async function handleDeposit(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const user = await requireUser(req, res);
  if (!user) return;
  const body = await readJson(req);
  try {
    const r = await deposit(user.id, Number(body.amountCkb));
    sendJson(res, 200, { ...r, explorer: txUrl(r.txHash) });
  } catch (err) {
    if (err instanceof WalletError) return sendJson(res, 400, { error: err.message, code: err.code });
    sendJson(res, 502, { error: (err as Error).message || "Deposit failed on-chain." });
  }
}

async function handleWithdraw(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const user = await requireUser(req, res);
  if (!user) return;
  const body = await readJson(req);
  try {
    const r = await withdraw(user.id, Number(body.amountCkb));
    sendJson(res, 200, { ...r, explorer: txUrl(r.txHash) });
  } catch (err) {
    if (err instanceof WalletError) return sendJson(res, 400, { error: err.message, code: err.code });
    sendJson(res, 502, { error: (err as Error).message || "Withdraw failed on-chain." });
  }
}

// ── Streak revival ──────────────────────────────────────────────────────────

async function handleRenew(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    const r = await renewStreak(user.id);
    sendJson(res, 200, { ...r, explorer: txUrl(r.txHash) });
  } catch (err) {
    if (err instanceof GameError) return sendJson(res, 400, { error: err.message, code: err.code });
    sendJson(res, 502, { error: (err as Error).message || "Renewal failed on-chain." });
  }
}

async function handleReset(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const user = await requireUser(req, res);
  if (!user) return;
  await resetStreak(user.id);
  sendJson(res, 200, { ok: true });
}

// ── Misc ────────────────────────────────────────────────────────────────────

async function handleLeaderboard(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const id = currentUserId(req);
  const board = await leaderboard(id ?? undefined);
  sendJson(res, 200, { leaderboard: board.slice(0, 100) });
}

async function handleMatchesList(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  await syncMatches();
  const matches = await read((db) =>
    db.matches.slice().sort((a, b) => a.kickoff.localeCompare(b.kickoff)),
  );
  sendJson(res, 200, { matches });
}

async function handleStatus(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  sendJson(res, 200, {
    live: await liveScoresStatus(),
    constants: {
      minBetCkb: MIN_BET_CKB,
      maxBetCkb: MAX_BET_CKB,
      minOnchainCkb: MIN_ONCHAIN_CKB,
      renewFeeCkb: RENEW_FEE_CKB,
      protocolFeeBps: PROTOCOL_FEE_BPS,
      creatorFeeBps: CREATOR_FEE_BPS,
    },
  });
}

// ── Router ──────────────────────────────────────────────────────────────────

type Handler = (req: IncomingMessage, res: ServerResponse, url: URL) => Promise<void>;

const staticRoutes: Record<string, Handler> = {
  "POST /api/signup": (req, res) => handleSignup(req, res),
  "POST /api/login": (req, res) => handleLogin(req, res),
  "POST /api/logout": (req, res) => handleLogout(req, res),
  "GET /api/me": (req, res) => handleMe(req, res),
  "GET /api/dashboard": (req, res) => handleDashboard(req, res),
  "GET /api/markets": (req, res, url) => handleMarkets(req, res, url),
  "GET /api/portfolio": (req, res) => handlePortfolio(req, res),
  "GET /api/leaderboard": (req, res) => handleLeaderboard(req, res),
  "GET /api/wallet": (req, res) => handleWallet(req, res),
  "POST /api/wallet/deposit": (req, res) => handleDeposit(req, res),
  "POST /api/wallet/withdraw": (req, res) => handleWithdraw(req, res),
  "POST /api/renew": (req, res) => handleRenew(req, res),
  "POST /api/reset": (req, res) => handleReset(req, res),
  "GET /api/matches": (req, res) => handleMatchesList(req, res),
  "GET /api/status": (req, res) => handleStatus(req, res),
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const key = `${req.method} ${url.pathname}`;

    if (url.pathname.startsWith("/api/")) {
      const direct = staticRoutes[key];
      if (direct) return await direct(req, res, url);

      // /api/markets/:id and /api/markets/:id/bet
      const m = url.pathname.match(/^\/api\/markets\/([^\/]+)(?:\/(bet))?$/);
      if (m) {
        const id = m[1];
        const sub = m[2];
        if (req.method === "GET" && !sub) return await handleMarketDetail(req, res, id);
        if (req.method === "POST" && sub === "bet") return await handleBet(req, res, id);
      }
      return sendJson(res, 404, { error: "Unknown endpoint." });
    }
    await serveStatic(req, res, url.pathname);
  } catch (err) {
    console.error("[streak] error:", (err as Error).message);
    if (!res.headersSent) sendJson(res, 500, { error: "Internal server error." });
  }
});

// ── Boot ────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  await getTreasury();
  await syncMatches();

  setInterval(() => {
    syncMatches().catch((e) => console.error("[streak] settle loop:", e.message));
  }, SETTLE_INTERVAL_MS);

  const live = await liveScoresStatus();
  server.listen(PORT, () => {
    console.log(`\n  STREAK TERMINAL online`);
    console.log(`     http://localhost:${PORT}`);
    console.log(`     network: CKB Pudge testnet`);
    if (live.enabled) {
      console.log(
        `     live data: ${live.base} (${live.source}${live.email ? ", " + live.email : ""})`,
      );
    } else {
      console.log(`     live data: off — using simulated results`);
    }
    console.log();
  });
}

boot().catch((err) => {
  console.error("[streak] failed to boot:", err);
  process.exit(1);
});

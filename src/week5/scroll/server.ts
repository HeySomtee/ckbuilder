/**
 * Week 5 — CKB Scroll: HTTP server.
 *
 * Every POST /api/post creates a real CKB cell on the Pudge testnet and
 * stores the resulting post in a local JSON file so the feed survives
 * restarts. A background loop polls pending transactions every 15 s and
 * promotes them to "confirmed" once committed.
 *
 * Run:  npm run week5
 * UI:   http://localhost:4002
 */

import { createReadStream } from "fs";
import { mkdir, readFile, rename, stat, writeFile } from "fs/promises";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { dirname, extname, join, normalize, resolve } from "path";
import { randomUUID } from "crypto";
import { URL } from "url";

import {
  publishScrollPost,
  tipAddress,
  checkTxStatus,
  getFaucetBalance,
  shannonsToCkb,
  estimatePostCostCkb,
  pudgeTxUrl,
  MIN_TIP_SHANNONS,
} from "./chain";
import type { ScrollPost, ScrollState, ScrollStats } from "./types";

// ── Config ─────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 4002);
const PUBLIC_DIR = resolve(__dirname, "public");
const DATA_FILE = resolve(__dirname, "data", "posts.json");

const MAX_CONTENT_CHARS = 200;
const MAX_AUTHOR_CHARS = 100;
const MIN_TIP_CKB = 63;
const MAX_TIP_CKB = 10_000;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
};

// ── State helpers ──────────────────────────────────────────────────────────

let writeQueue = Promise.resolve();

async function loadState(): Promise<ScrollState> {
  try {
    const raw = await readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw) as ScrollState;
    return { posts: Array.isArray(parsed.posts) ? parsed.posts : [] };
  } catch (err: any) {
    if (err?.code === "ENOENT") return { posts: [] };
    throw err;
  }
}

async function saveState(state: ScrollState): Promise<void> {
  await mkdir(dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2));
  await rename(tmp, DATA_FILE);
}

function updateState<T>(fn: (state: ScrollState) => T | Promise<T>): Promise<T> {
  const run = writeQueue.then(async () => {
    const state = await loadState();
    const result = await fn(state);
    await saveState(state);
    return result;
  });
  writeQueue = run.then(
    () => {},
    () => {},
  );
  return run;
}

// ── HTTP helpers ───────────────────────────────────────────────────────────

function send(
  res: ServerResponse,
  status: number,
  body: unknown,
  type = "application/json",
): void {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function isTestnetAddress(value: unknown): value is string {
  return typeof value === "string" && /^ckt1[0-9a-z]+$/.test(value);
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function readJson(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Invalid JSON body");
  }
}

// ── API handlers ───────────────────────────────────────────────────────────

/** GET /api/feed?limit=N&order=asc|desc */
async function handleFeed(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "50")));
  const order = url.searchParams.get("order") === "asc" ? "asc" : "desc";

  const { posts } = await loadState();
  const sorted = order === "desc" ? [...posts].reverse() : posts;
  send(res, 200, { posts: sorted.slice(0, limit), total: posts.length });
}

/** GET /api/stats */
async function handleStats(res: ServerResponse): Promise<void> {
  const [{ posts }, balance] = await Promise.all([loadState(), getFaucetBalance()]);

  const confirmed = posts.filter((p) => p.status === "confirmed");
  const pending = posts.filter((p) => p.status === "pending");
  const totalCapacity = confirmed.reduce(
    (acc, p) => acc + (p.capacity ? BigInt(p.capacity) : 0n),
    0n,
  );

  const stats: ScrollStats = {
    totalPosts: posts.length,
    confirmedPosts: confirmed.length,
    pendingPosts: pending.length,
    totalCapacityLocked: totalCapacity.toString(),
    faucetBalance: balance.toString(),
  };
  send(res, 200, stats);
}

/** GET /api/status/:txHash */
async function handleTxStatus(
  res: ServerResponse,
  txHash: string,
): Promise<void> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return send(res, 400, { error: "Invalid txHash" });
  }
  const status = await checkTxStatus(txHash);

  // If now confirmed, persist the update
  if (status === "confirmed") {
    await updateState((state) => {
      const post = state.posts.find((p) => p.txHash === txHash);
      if (post && post.status === "pending") post.status = "confirmed";
    });
  }

  send(res, 200, { txHash, status });
}

/** GET /api/cost?bytes=N — estimate post cost without posting */
function handleCost(res: ServerResponse, url: URL): void {
  const bytes = Math.max(0, Math.min(400, Number(url.searchParams.get("bytes") ?? "0")));
  const ckb = estimatePostCostCkb(bytes);
  send(res, 200, { estimatedCkb: ckb });
}

/** POST /api/post — publish a new scroll post on-chain */
async function handlePost(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: any;
  try {
    body = await readJson(req);
  } catch {
    return send(res, 400, { error: "Invalid JSON" });
  }

  const content = cleanText(body.content, MAX_CONTENT_CHARS);
  if (!content) return send(res, 400, { error: "content is required" });
  if (content.length > MAX_CONTENT_CHARS) {
    return send(res, 400, { error: `content must be ≤ ${MAX_CONTENT_CHARS} chars` });
  }

  // Author is optional; defaults to "anonymous"
  const rawAuthor = cleanText(body.authorAddress, MAX_AUTHOR_CHARS);
  const authorAddress = isTestnetAddress(rawAuthor) ? rawAuthor : "anonymous";

  const id = randomUUID();
  const createdAt = new Date().toISOString();

  const post: ScrollPost = {
    id,
    content,
    authorAddress,
    status: "pending",
    createdAt,
  };

  // Persist immediately as "pending" so a crash during broadcast doesn't lose it
  await updateState((state) => {
    state.posts.push(post);
  });

  try {
    const { txHash, capacity } = await publishScrollPost({ content, authorAddress, createdAt });

    await updateState((state) => {
      const p = state.posts.find((x) => x.id === id);
      if (p) {
        p.txHash = txHash;
        p.index = 0;
        p.capacity = capacity;
      }
    });

    post.txHash = txHash;
    post.index = 0;
    post.capacity = capacity;

    send(res, 201, {
      post,
      pudgeUrl: pudgeTxUrl(txHash),
      estimatedCkb: shannonsToCkb(BigInt(capacity)),
    });
  } catch (err: any) {
    await updateState((state) => {
      const p = state.posts.find((x) => x.id === id);
      if (p) p.status = "failed";
    });
    console.error("[scroll] publish error:", err.message);
    send(res, 500, { error: err.message ?? "Failed to publish post" });
  }
}

/** POST /api/tip — send CKB from the faucet wallet to an author */
async function handleTip(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: any;
  try {
    body = await readJson(req);
  } catch {
    return send(res, 400, { error: "Invalid JSON" });
  }

  if (!isTestnetAddress(body.toAddress)) {
    return send(res, 400, { error: "Invalid toAddress (must be a ckt1… address)" });
  }

  const ckbAmount = Number(body.ckbAmount);
  if (!Number.isFinite(ckbAmount) || ckbAmount < MIN_TIP_CKB || ckbAmount > MAX_TIP_CKB) {
    return send(res, 400, {
      error: `ckbAmount must be between ${MIN_TIP_CKB} and ${MAX_TIP_CKB}`,
    });
  }

  try {
    const txHash = await tipAddress(body.toAddress, ckbAmount);
    send(res, 200, { txHash, pudgeUrl: pudgeTxUrl(txHash) });
  } catch (err: any) {
    console.error("[scroll] tip error:", err.message);
    send(res, 500, { error: err.message ?? "Tip failed" });
  }
}

// ── Static file serving ────────────────────────────────────────────────────

async function serveStatic(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const urlPath = new URL(req.url ?? "/", "http://x").pathname;
  // Normalise to forward-slashes so the root-check works on Windows too.
  const safePath = normalize(urlPath).replace(/\\/g, "/").replace(/^(\.\.(\/|$))+/, "");
  const isRoot = safePath === "/" || safePath === "";
  const filePath = join(PUBLIC_DIR, isRoot ? "index.html" : safePath);

  // Guard against path traversal (normalize separators for Windows compatibility)
  const normalPublic = PUBLIC_DIR.replace(/\\/g, "/");
  const normalFile   = filePath.replace(/\\/g, "/");
  if (!normalFile.startsWith(normalPublic + "/") && normalFile !== normalPublic) {
    return send(res, 403, "Forbidden", "text/plain");
  }

  try {
    const st = await stat(filePath);
    if (!st.isFile()) throw new Error("Not a file");
    const ct = MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": ct });
    createReadStream(filePath).pipe(res);
  } catch {
    send(res, 404, "Not Found", "text/plain");
  }
}

// ── Request router ─────────────────────────────────────────────────────────

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const method = req.method?.toUpperCase() ?? "GET";
  const path = url.pathname;

  try {
    if (method === "GET" && path === "/api/feed") return await handleFeed(req, res, url);
    if (method === "GET" && path === "/api/stats") return await handleStats(res);
    if (method === "GET" && path === "/api/cost") return handleCost(res, url);
    if (method === "GET" && path.startsWith("/api/status/")) {
      return await handleTxStatus(res, path.slice("/api/status/".length));
    }
    if (method === "POST" && path === "/api/post") return await handlePost(req, res);
    if (method === "POST" && path === "/api/tip") return await handleTip(req, res);
    if (method === "GET") return await serveStatic(req, res);
    send(res, 405, { error: "Method not allowed" });
  } catch (err: any) {
    console.error("[scroll] unhandled:", err);
    send(res, 500, { error: "Internal server error" });
  }
}

// ── Background status updater ──────────────────────────────────────────────

async function pollPendingPosts(): Promise<void> {
  const { posts } = await loadState();
  const pending = posts.filter((p) => p.status === "pending" && p.txHash);
  if (pending.length === 0) return;

  for (const post of pending) {
    const status = await checkTxStatus(post.txHash!);
    if (status !== "pending") {
      await updateState((state) => {
        const p = state.posts.find((x) => x.id === post.id);
        if (p) p.status = status;
      });
      console.log(`[scroll] post ${post.id.slice(0, 8)} → ${status}`);
    }
  }
}

// ── Bootstrap ──────────────────────────────────────────────────────────────

const server = createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    console.error("[scroll] fatal:", err);
    try {
      res.writeHead(500);
      res.end("Internal Server Error");
    } catch {}
  });
});

server.listen(PORT, () => {
  console.log(`\n◈  CKB Scroll running at http://localhost:${PORT}`);
  console.log(`   Every post you submit creates a real cell on the CKB testnet.\n`);
});

// Poll pending posts every 15 seconds
setInterval(() => {
  pollPendingPosts().catch((err) => console.error("[scroll] poll error:", err.message));
}, 15_000);

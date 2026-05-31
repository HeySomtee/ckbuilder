/**
 * Week 4 - NFT-gated DAO HTTP server.
 *
 * This app builds on the week-3 Spore NFT faucet. Anyone can create a
 * proposal, but voting requires at least one Spore NFT held by the address.
 *
 * Run: npm run week4
 */

import { createReadStream } from "fs";
import { mkdir, readFile, rename, stat, writeFile } from "fs/promises";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { dirname, extname, join, normalize, resolve } from "path";
import { randomUUID } from "crypto";
import { URL } from "url";

import { listHeldFaucetNfts } from "../../week3/nft-faucet/faucetStore";

const PORT = Number(process.env.PORT ?? 4001);
const PUBLIC_DIR = resolve(__dirname, "public");
const DATA_FILE = resolve(__dirname, "data", "dao.json");
const DEFAULT_PROPOSAL_MS = 7 * 24 * 60 * 60 * 1000;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

type VoteChoice = "for" | "against" | "abstain";

interface Vote {
  address: string;
  choice: VoteChoice;
  sporeCount: number;
  updatedAt: string;
}

interface Proposal {
  id: string;
  title: string;
  body: string;
  creatorAddress?: string;
  createdAt: string;
  expiresAt: string;
  votes: Vote[];
}

interface DaoState {
  proposals: Proposal[];
}

let writeQueue = Promise.resolve();

function send(res: ServerResponse, status: number, body: unknown, type = "application/json") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function isTestnetAddress(value: unknown): value is string {
  return typeof value === "string" && /^ckt1[0-9a-z]+$/.test(value);
}

function cleanText(value: unknown, max: number) {
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

async function loadState(): Promise<DaoState> {
  try {
    const raw = await readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw) as DaoState;
    return {
      proposals: Array.isArray(parsed.proposals)
        ? parsed.proposals.map(normalizeProposal)
        : [],
    };
  } catch (err: any) {
    if (err?.code === "ENOENT") return { proposals: [] };
    throw err;
  }
}

function normalizeProposal(proposal: Proposal): Proposal {
  const createdAt = proposal.createdAt || new Date().toISOString();
  return {
    ...proposal,
    createdAt,
    expiresAt:
      proposal.expiresAt ||
      new Date(new Date(createdAt).getTime() + DEFAULT_PROPOSAL_MS).toISOString(),
    votes: Array.isArray(proposal.votes) ? proposal.votes : [],
  };
}

function isExpired(proposal: Proposal, now = Date.now()) {
  return new Date(proposal.expiresAt).getTime() <= now;
}

async function saveState(state: DaoState) {
  await mkdir(dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2));
  await rename(tmp, DATA_FILE);
}

async function updateState<T>(fn: (state: DaoState) => T | Promise<T>): Promise<T> {
  const run = writeQueue.then(async () => {
    const state = await loadState();
    const result = await fn(state);
    await saveState(state);
    return result;
  });
  writeQueue = run.then(() => undefined, () => undefined);
  return run;
}

function proposalView(proposal: Proposal) {
  const tally = { for: 0, against: 0, abstain: 0 };
  for (const vote of proposal.votes) tally[vote.choice] += vote.sporeCount;
  const total = tally.for + tally.against + tally.abstain;
  return {
    id: proposal.id,
    title: proposal.title,
    body: proposal.body,
    creatorAddress: proposal.creatorAddress,
    createdAt: proposal.createdAt,
    expiresAt: proposal.expiresAt,
    status: isExpired(proposal) ? "expired" : "active",
    voterCount: proposal.votes.length,
    tally,
    total,
    votes: proposal.votes,
  };
}

async function serveStatic(_req: IncomingMessage, res: ServerResponse, urlPath: string) {
  const rel = urlPath === "/" ? "/index.html" : urlPath;
  const filePath = normalize(join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    return send(res, 403, "Forbidden", "text/plain");
  }
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error("not a file");
    res.writeHead(200, {
      "Content-Type": MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream",
      "Content-Length": fileStat.size,
    });
    createReadStream(filePath).pipe(res);
  } catch {
    send(res, 404, "Not found", "text/plain");
  }
}

async function handleHealth(_req: IncomingMessage, res: ServerResponse) {
  send(res, 200, { ok: true, faucet: "http://localhost:4000" });
}

async function handleMember(_req: IncomingMessage, res: ServerResponse, url: URL) {
  const address = url.searchParams.get("address");
  if (!isTestnetAddress(address)) {
    return send(res, 400, { error: "Provide a testnet (ckt1...) address." });
  }
  const nfts = await listHeldFaucetNfts(address);
  send(res, 200, { address, eligible: nfts.length > 0, count: nfts.length, nfts });
}

async function handleListProposals(_req: IncomingMessage, res: ServerResponse) {
  const state = await loadState();
  send(res, 200, { proposals: state.proposals.map(proposalView) });
}

async function handleCreateProposal(req: IncomingMessage, res: ServerResponse) {
  const body = await readJson(req);
  const title = cleanText(body?.title, 90);
  const proposalBody = cleanText(body?.body, 900);
  const creatorAddress = cleanText(body?.creatorAddress, 130);
  const expiresAtInput = cleanText(body?.expiresAt, 80);

  if (title.length < 6) return send(res, 400, { error: "Proposal title must be at least 6 characters." });
  if (proposalBody.length < 12) return send(res, 400, { error: "Proposal details must be at least 12 characters." });
  if (creatorAddress && !isTestnetAddress(creatorAddress)) {
    return send(res, 400, { error: "Creator address must be a testnet ckt1 address." });
  }
  const expiresAt = expiresAtInput
    ? new Date(expiresAtInput)
    : new Date(Date.now() + DEFAULT_PROPOSAL_MS);
  if (Number.isNaN(expiresAt.getTime())) {
    return send(res, 400, { error: "Expiration time must be a valid date." });
  }
  if (expiresAt.getTime() <= Date.now()) {
    return send(res, 400, { error: "Expiration time must be in the future." });
  }

  const proposal = await updateState((state) => {
    const next: Proposal = {
      id: randomUUID(),
      title,
      body: proposalBody,
      creatorAddress: creatorAddress || undefined,
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
      votes: [],
    };
    state.proposals.unshift(next);
    return next;
  });

  send(res, 201, { proposal: proposalView(proposal) });
}

async function handleVote(req: IncomingMessage, res: ServerResponse) {
  const body = await readJson(req);
  const proposalId = cleanText(body?.proposalId, 80);
  const address = cleanText(body?.address, 130);
  const choice = body?.choice as VoteChoice;

  if (!proposalId) return send(res, 400, { error: "Proposal id required." });
  if (!isTestnetAddress(address)) return send(res, 400, { error: "Provide a testnet (ckt1...) voter address." });
  if (!["for", "against", "abstain"].includes(choice)) {
    return send(res, 400, { error: "Vote choice must be for, against, or abstain." });
  }

  const nfts = await listHeldFaucetNfts(address);
  if (nfts.length === 0) {
    return send(res, 403, { error: "Voting is NFT-gated. Mint a faucet NFT first, then try again." });
  }

  const proposal = await updateState((state) => {
    const found = state.proposals.find((item) => item.id === proposalId);
    if (!found) throw new Error("Proposal not found.");
    if (isExpired(found)) throw new Error("Proposal voting has expired.");

    const now = new Date().toISOString();
    const existing = found.votes.find((vote) => vote.address === address);
    if (existing) {
      existing.choice = choice;
      existing.sporeCount = nfts.length;
      existing.updatedAt = now;
    } else {
      found.votes.push({ address, choice, sporeCount: nfts.length, updatedAt: now });
    }
    return found;
  });

  send(res, 200, { proposal: proposalView(proposal), sporeCount: nfts.length });
}

const server = createServer(async (req, res) => {
  if (!req.url || !req.method) return send(res, 400, "Bad request", "text/plain");
  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

  try {
    if (req.method === "GET" && url.pathname === "/api/health") return handleHealth(req, res);
    if (req.method === "GET" && url.pathname === "/api/member") return handleMember(req, res, url);
    if (req.method === "GET" && url.pathname === "/api/proposals") return handleListProposals(req, res);
    if (req.method === "POST" && url.pathname === "/api/proposals") return handleCreateProposal(req, res);
    if (req.method === "POST" && url.pathname === "/api/vote") return handleVote(req, res);
    if (req.method === "GET") return serveStatic(req, res, url.pathname);
    send(res, 405, "Method not allowed", "text/plain");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[dao]", msg);
    send(res, msg === "Proposal not found." ? 404 : msg === "Proposal voting has expired." ? 403 : 500, { error: msg });
  }
});

server.listen(PORT, () => {
  console.log(`NFT DAO running at http://localhost:${PORT}`);
  console.log("Voting gate: any address holding a week-3 faucet Spore NFT.");
  console.log("Mint faucet: http://localhost:4000");
});

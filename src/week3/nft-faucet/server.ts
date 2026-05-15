/**
 * Week 3 — NFT faucet HTTP server.
 *
 * Zero-dep Node server that serves a minimal HTML UI and two JSON endpoints:
 *   POST /api/mint  { address }            → mints a Spore NFT to that address
 *   GET  /api/nfts?address=...             → lists Spores held by that address
 *
 * The faucet pays for both the mint transaction fee AND the ~140-CKB
 * Spore cell capacity out of the wallet stored at .ckb-wallet.key (the
 * same key file used by week 2). Make sure that key is funded before
 * starting the server.
 *
 * Run:  npm run week3
 */

import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { resolve, extname, join, normalize } from "path";
import { URL } from "url";
import { randomBytes } from "crypto";

import { getMyAddress } from "../../week2/wallet/wallet";
import { getBalanceOf, shannonsToCkb } from "../../week2/wallet/wallet";
import { listNfts, mintNft } from "./spore";
import { randomSvg } from "./art";

const PORT = Number(process.env.PORT ?? 4000);
const PUBLIC_DIR = resolve(__dirname, "public");
const EXPLORER = "https://pudge.explorer.nervos.org";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function send(res: ServerResponse, status: number, body: unknown, type = "application/json") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Invalid JSON body");
  }
}

async function serveStatic(req: IncomingMessage, res: ServerResponse, urlPath: string) {
  const rel = urlPath === "/" ? "/index.html" : urlPath;
  // Path-traversal guard: resolve, then ensure result still inside PUBLIC_DIR.
  const filePath = normalize(join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    return send(res, 403, "Forbidden", "text/plain");
  }
  try {
    const s = await stat(filePath);
    if (!s.isFile()) throw new Error("not a file");
    res.writeHead(200, {
      "Content-Type": MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream",
      "Content-Length": s.size,
    });
    createReadStream(filePath).pipe(res);
  } catch {
    send(res, 404, "Not found", "text/plain");
  }
}

async function handleMint(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = await readJson(req);
    const address: unknown = body?.address;
    if (typeof address !== "string" || !/^ckt1[0-9a-z]+$/.test(address)) {
      return send(res, 400, { error: "Provide a testnet (ckt1...) address." });
    }

    // Each mint gets a unique seed so repeat-minting to the same address
    // produces different art (the sporeId itself is unique anyway).
    const nonce = randomBytes(8).toString("hex");
    const svg = randomSvg(`${address}:${nonce}`);

    const { txHash, sporeId } = await mintNft(address, {
      contentType: "image/svg+xml",
      content: svg,
    });
    send(res, 200, {
      txHash,
      sporeId,
      explorer: `${EXPLORER}/transaction/${txHash}`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[mint]", msg);
    send(res, 500, { error: msg });
  }
}

async function handleList(_req: IncomingMessage, res: ServerResponse, url: URL) {
  try {
    const address = url.searchParams.get("address");
    if (!address || !/^ckt1[0-9a-z]+$/.test(address)) {
      return send(res, 400, { error: "Provide a testnet (ckt1...) address." });
    }
    const nfts = await listNfts(address);
    send(res, 200, { address, count: nfts.length, nfts });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[list]", msg);
    send(res, 500, { error: msg });
  }
}

async function handleBalance(_req: IncomingMessage, res: ServerResponse, url: URL) {
  try {
    const address = url.searchParams.get("address");
    if (!address || !/^ckt1[0-9a-z]+$/.test(address)) {
      return send(res, 400, { error: "Provide a testnet (ckt1...) address." });
    }
    const shannons = await getBalanceOf(address);
    send(res, 200, {
      address,
      shannons: shannons.toString(),
      ckb: shannonsToCkb(shannons),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[balance]", msg);
    send(res, 500, { error: msg });
  }
}

const server = createServer(async (req, res) => {
  if (!req.url || !req.method) return send(res, 400, "Bad request", "text/plain");
  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "POST" && url.pathname === "/api/mint") return handleMint(req, res);
  if (req.method === "GET" && url.pathname === "/api/nfts") return handleList(req, res, url);
  if (req.method === "GET" && url.pathname === "/api/balance") return handleBalance(req, res, url);
  if (req.method === "GET") return serveStatic(req, res, url.pathname);
  send(res, 405, "Method not allowed", "text/plain");
});

async function main() {
  // Fail fast if the wallet key isn't set up — the faucet can't mint without it.
  let faucetAddr: string;
  try {
    faucetAddr = await getMyAddress();
  } catch (err) {
    console.error("Faucet wallet not initialised.");
    console.error("Run `npm run wallet -- init` (or `import <key>`) first, then fund the address.");
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  server.listen(PORT, () => {
    console.log(`NFT faucet running at http://localhost:${PORT}`);
    console.log(`Faucet address (must be funded):\n  ${faucetAddr}`);
    console.log(`Explorer: ${EXPLORER}/address/${faucetAddr}`);
  });
}

main();

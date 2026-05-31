import { mkdir, readFile, rename, writeFile } from "fs/promises";
import { dirname, resolve } from "path";

import { listNfts, NftView } from "./spore";

const DATA_FILE = resolve(__dirname, "data", "mints.json");

interface FaucetMint {
  sporeId: string;
  txHash: string;
  mintedTo: string;
  mintedAt: string;
}

interface FaucetState {
  mints: FaucetMint[];
}

let writeQueue = Promise.resolve();

async function loadState(): Promise<FaucetState> {
  try {
    const raw = await readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw) as FaucetState;
    return { mints: Array.isArray(parsed.mints) ? parsed.mints : [] };
  } catch (err: any) {
    if (err?.code === "ENOENT") return { mints: [] };
    throw err;
  }
}

async function saveState(state: FaucetState) {
  await mkdir(dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2));
  await rename(tmp, DATA_FILE);
}

async function updateState<T>(fn: (state: FaucetState) => T | Promise<T>): Promise<T> {
  const run = writeQueue.then(async () => {
    const state = await loadState();
    const result = await fn(state);
    await saveState(state);
    return result;
  });
  writeQueue = run.then(() => undefined, () => undefined);
  return run;
}

export async function recordFaucetMint(mint: Omit<FaucetMint, "mintedAt">) {
  await updateState((state) => {
    const existing = state.mints.find((item) => item.sporeId === mint.sporeId);
    if (existing) {
      existing.txHash = mint.txHash;
      existing.mintedTo = mint.mintedTo;
      return;
    }
    state.mints.push({ ...mint, mintedAt: new Date().toISOString() });
  });
}

export async function listFaucetMints() {
  return (await loadState()).mints;
}

export async function listHeldFaucetNfts(address: string): Promise<NftView[]> {
  const mints = await listFaucetMints();
  if (mints.length === 0) return [];
  const held = await listNfts(address);
  const faucetIds = new Set(mints.map((mint) => mint.sporeId));
  return held.filter((nft) => faucetIds.has(nft.id));
}

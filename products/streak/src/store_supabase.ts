import type { StreakDB } from "./types";

function env(name: string): string | undefined {
  return process.env[name];
}

export function supaEnabled(): boolean {
  return !!(env("SUPABASE_URL") && env("SUPABASE_KEY"));
}

const table = process.env.SUPABASE_TABLE ?? "streak_state";
const rowId = process.env.SUPABASE_ROW_ID ?? "singleton";
const configuredTimeout = Number(process.env.STORE_REQUEST_TIMEOUT_MS ?? 8000);
const requestTimeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0
  ? configuredTimeout
  : 8000;

function safeIdent(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Invalid SQL identifier: ${name}`);
  }
  return name;
}

async function request(path: string, opts: RequestInit = {}): Promise<Response> {
  const url = `${process.env.SUPABASE_URL!.replace(/\/$/, "")}${path}`;
  const headers = {
    apikey: process.env.SUPABASE_KEY!,
    Authorization: `Bearer ${process.env.SUPABASE_KEY!}`,
    Accept: "application/json",
    ...(opts.headers ?? {}),
  };
  const res = await fetch(url, { ...opts, headers, signal: AbortSignal.timeout(requestTimeoutMs) });
  if (!res.ok) {
    let details = "";
    try {
      details = await res.text();
    } catch {}
    throw new Error(`Supabase ${res.status} ${res.statusText}${details ? `: ${details}` : ""}`);
  }
  return res;
}

export async function supaLoadDB(): Promise<StreakDB | null> {
  if (!supaEnabled()) throw new Error("Supabase not configured");
  // GET row
  const path = `/rest/v1/${table}?select=data&id=eq.${encodeURIComponent(rowId)}`;
  const rows = await (await request(path)).json();
  if (!Array.isArray(rows)) throw new Error("Supabase returned an invalid state response");
  if (rows.length === 0) return null;
  const data = rows[0].data;
  if (!data) return null;
  return data as StreakDB;
}

export async function supaSaveDB(db: StreakDB, serialized = JSON.stringify(db)): Promise<void> {
  if (!supaEnabled()) throw new Error("Supabase not configured");
  // Upsert as { id: rowId, data }
  const path = `/rest/v1/${table}?on_conflict=id`;
  await request(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Required by PostgREST for conflict-handling upserts.
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: `[{"id":${JSON.stringify(rowId)},"data":${serialized}}]`,
  });
}

/**
 * Optional startup bootstrap: create the state table if missing.
 * Requires SUPABASE_DB_URL (Postgres connection string).
 */
export async function supaEnsureTable(): Promise<void> {
  if (!supaEnabled()) return;
  const dbUrl = env("SUPABASE_DB_URL");
  if (!dbUrl) {
    console.warn("[store] SUPABASE_DB_URL not set — skipping auto-create table");
    return;
  }

  const tableName = safeIdent(table);
  try {
    const mod = await import("pg");
    const client = new mod.Client({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
    });
    await client.connect();
    await client.query(
      `create table if not exists ${tableName} (
         id text primary key,
         data jsonb not null default '{}'::jsonb,
         updated_at timestamptz not null default now()
       )`,
    );
    await client.end();
    console.log(`[store] ensured supabase table: ${tableName}`);
  } catch (e) {
    console.warn("[store] failed to auto-create supabase table:", e);
  }
}

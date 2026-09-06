/**
 * Streak Terminal — Postgres store (relational).
 *
 * Replaces the single-jsonb-row store. Two properties matter:
 *
 *   1. Writes are diffed against the previous committed snapshot and only the
 *      changed rows are sent, inside one transaction. Placing a bet used to
 *      upsert the entire ~3 MB ledger; it now writes a handful of rows.
 *
 *   2. A delete is NEVER inferred from a row's absence. Callers mutate a
 *      materialised StreakDB, and any collection that is partially loaded (or
 *      wholesale reassigned, as pruneStaleSimMarkets does) would otherwise read
 *      as "everything else was deleted". Disappearances are logged, not applied;
 *      real deletions go through the explicit helpers at the bottom.
 *
 * Receipts are archive data — 1.5 MB of payloads only ever fetched by marketId
 * or listed in the gallery — so loadDB leaves `receipts` empty and they are read
 * through the accessors here. Pushing onto `db.receipts` inside update() still
 * works: a new entry is a new row, and the diff upserts it.
 */

import { Pool, type PoolClient } from "pg";

import { DB_SCHEMA } from "./config";
import type {
  Bet, Crew, Deposit, Market, Match, SettlementReceipt, StreakDB, TelegramLink, User, Withdraw,
} from "./types";

export function pgEnabled(): boolean {
  return !!process.env.DATABASE_URL;
}

let pool: Pool | null = null;
export function getPool(): Pool {
  if (!pool) {
    const raw = process.env.DATABASE_URL;
    if (!raw) throw new Error("DATABASE_URL is not set");
    // TLS is configured explicitly below, so drop the URL's sslmode/
    // channel_binding parameters — pg-connection-string warns about how it
    // reinterprets them, and its interpretation would be ignored regardless.
    const connectionString = raw.replace(/([?&])(sslmode|channel_binding)=[^&]*/g, "$1")
      .replace(/[?&]+$/, "").replace(/\?&/, "?");
    pool = new Pool({
      connectionString,
      // Hosted Postgres terminates TLS at the pooler with its own chain.
      ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false },
      max: Number(process.env.PG_POOL_MAX ?? 5),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS ?? 20_000),
    });
    pool.on("error", (err) => console.warn("[store] idle pg client error:", err.message));
  }
  return pool;
}

export async function closePool(): Promise<void> {
  const p = pool;
  pool = null;
  if (p) await p.end();
}

// ── value helpers ───────────────────────────────────────────────────────────

/** numeric(40,0) arrives as a string, matching the shannon-string convention. */
const amount = (v: unknown): string => (v == null ? "0" : String(v));
const amountOpt = (v: unknown): string | undefined => (v == null ? undefined : String(v));
const iso = (d: unknown): string | undefined =>
  d == null ? undefined : new Date(d as string).toISOString();
const tsv = (v: unknown): Date | null => (v == null || v === "" ? null : new Date(v as string));
const jsonb = (v: unknown): string | null => (v == null ? null : JSON.stringify(v));

/** Drop null/undefined so a materialised row matches the optional-field shape. */
function compact<T extends Record<string, unknown>>(o: T): T {
  for (const k of Object.keys(o)) if (o[k] === null || o[k] === undefined) delete o[k];
  return o;
}

/** Canonical JSON (sorted keys, undefined dropped) — the change detector. */
function canon(v: unknown): unknown {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(canon);
  const src = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(src).sort()) {
    if (src[k] === undefined) continue;
    out[k] = canon(src[k]);
  }
  return out;
}
const same = (a: unknown, b: unknown): boolean => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

// ── row → object ────────────────────────────────────────────────────────────

const toUser = (r: any): User => compact({
  id: r.id,
  walletIdentity: r.wallet_identity,
  walletType: r.wallet_type,
  username: r.username ?? undefined,
  telegramChatId: r.telegram_chat_id ?? undefined,
  telegramUsername: r.telegram_username ?? undefined,
  createdAt: iso(r.created_at),
  wallet: { address: r.wallet_address },
  escrowShannons: amount(r.escrow_shannons),
  creatorFeesShannons: amount(r.creator_fees_shannons),
  streak: r.streak,
  stats: r.stats,
}) as User;

const toMatch = (r: any): Match => compact({
  id: r.id,
  sport: r.sport ?? undefined,
  competition: r.competition ?? undefined,
  oracle: r.oracle ?? undefined,
  date: r.date,
  stage: r.stage ?? undefined,
  group: r.group ?? undefined,
  home: r.home,
  away: r.away,
  kickoff: iso(r.kickoff),
  status: r.status,
  result: r.result ?? undefined,
  score: r.score ?? undefined,
  venue: r.venue ?? undefined,
  matchday: r.matchday ?? undefined,
  liveResult: r.live_result === null ? undefined : r.live_result,
}) as Match;

const toMarket = (r: any, ticks: unknown, ins: any): Market => compact({
  id: r.id,
  matchId: r.match_id,
  creatorId: r.creator_id,
  status: r.status,
  pools: { home: amount(r.pool_home), draw: amount(r.pool_draw), away: amount(r.pool_away) },
  totalBets: r.total_bets,
  uniqueBettors: r.unique_bettors,
  createdAt: iso(r.created_at),
  closesAt: iso(r.closes_at),
  resolvedAt: iso(r.resolved_at),
  resolvedOutcome: r.resolved_outcome ?? undefined,
  feeBps: r.fee_bps,
  history: (ticks as any) ?? [],
  payout: r.payout ?? undefined,
  receipt: r.receipt_ref ?? undefined,
  insightsLatest: ins?.latest ?? undefined,
  insightSnapshot: ins?.snapshot ?? undefined,
}) as Market;

const toBet = (r: any): Bet => compact({
  id: r.id,
  marketId: r.market_id,
  matchId: r.match_id,
  userId: r.user_id,
  outcome: r.outcome,
  amount: amount(r.amount),
  placedAt: iso(r.placed_at),
  priceAtBet: r.price_at_bet,
  settled: r.settled,
  payout: amountOpt(r.payout),
  isStreakPick: r.is_streak_pick === null ? undefined : r.is_streak_pick,
  streakAtPick: r.streak_at_pick === null ? undefined : r.streak_at_pick,
}) as Bet;

const toDeposit = (r: any): Deposit => compact({
  id: r.id, userId: r.user_id, amountShannons: amount(r.amount_shannons),
  txHash: r.tx_hash, at: iso(r.at),
}) as Deposit;

const toWithdraw = (r: any): Withdraw => compact({
  id: r.id, userId: r.user_id, amountShannons: amount(r.amount_shannons),
  txHash: r.tx_hash ?? undefined, at: iso(r.at), status: r.status ?? undefined,
  signedTransaction: r.signed_transaction ?? undefined,
}) as Withdraw;

const toCrew = (r: any): Crew => compact({
  id: r.id, name: r.name, ownerId: r.owner_id, inviteCode: r.invite_code,
  memberIds: r.member_ids, createdAt: iso(r.created_at),
}) as Crew;

const toTelegramLink = (r: any): TelegramLink => compact({
  token: r.token, userId: r.user_id, createdAt: iso(r.created_at),
  expiresAt: iso(r.expires_at), usedAt: iso(r.used_at),
}) as TelegramLink;

// ── load ────────────────────────────────────────────────────────────────────

/**
 * Materialise the working set. `receipts` is deliberately empty — see the file
 * header; use listReceipts()/getReceipt() instead.
 */
export async function pgLoadDB(): Promise<StreakDB | null> {
  const client = await getPool().connect();
  try {
    // One round trip, and REPEATABLE READ so all twelve selects observe the
    // same snapshot. Issuing them concurrently on one connection would serialise
    // anyway, and spreading them across pooled connections could tear a read
    // across a concurrent commit — a balance from before a write paired with a
    // bet from after it.
    const results = (await client.query(`
      begin transaction isolation level repeatable read;
      select * from streak_meta where id = 'singleton';
      select * from users order by id;
      select * from matches order by id;
      select * from markets order by id;
      select market_id, ticks from market_history;
      select market_id, latest, snapshot from market_insights;
      select * from bets order by id;
      select * from deposits order by id;
      select * from withdraws order by id;
      select * from crews order by id;
      select * from telegram_links order by token;
      select tx_hash from renewal_txs order by tx_hash;
      commit;
    `)) as unknown as Array<{ rows: any[] }>;

    const [, meta, users, matches, markets, history, insights,
           bets, deposits, withdraws, crews, links, renewals] = results;

    if (meta.rows.length === 0) return null;
    const m = meta.rows[0];

    const ticksBy = new Map<string, unknown>(history.rows.map((r) => [r.market_id, r.ticks]));
    const insBy = new Map<string, any>(insights.rows.map((r) => [r.market_id, r]));

    return compact({
      schema: m.schema,
      users: users.rows.map(toUser),
      matches: matches.rows.map(toMatch),
      markets: markets.rows.map((r) => toMarket(r, ticksBy.get(r.id), insBy.get(r.id))),
      bets: bets.rows.map(toBet),
      deposits: deposits.rows.map(toDeposit),
      withdraws: withdraws.rows.map(toWithdraw),
      treasury: m.treasury ?? undefined,
      protocolFeesShannons: amount(m.protocol_fees),
      liveScores: m.live_scores ?? undefined,
      matchesSchema: m.matches_schema === null ? undefined : m.matches_schema,
      receipts: [],
      crews: crews.rows.map(toCrew),
      dummyAnchorIso: m.dummy_anchor_iso ?? undefined,
      telegramLinks: links.rows.map(toTelegramLink),
      renewalTxs: renewals.rows.map((r) => r.tx_hash),
    }) as StreakDB;
  } finally {
    client.release();
  }
}

// ── diffed write ────────────────────────────────────────────────────────────

interface Spec<T> {
  table: string;
  key: (row: T) => string;
  columns: string[];
  values: (row: T) => unknown[];
}

/**
 * Upsert rows that are new or changed. Rows present before and absent now are
 * reported but never deleted — see the file header.
 */
async function syncCollection<T>(
  client: PoolClient, spec: Spec<T>, prev: T[] | undefined, next: T[] | undefined,
): Promise<number> {
  const before = new Map((prev ?? []).map((r) => [spec.key(r), r]));
  const after = new Map((next ?? []).map((r) => [spec.key(r), r]));

  const dirty: T[] = [];
  for (const [k, row] of after) {
    const old = before.get(k);
    if (!old || !same(old, row)) dirty.push(row);
  }

  const vanished = [...before.keys()].filter((k) => !after.has(k));
  if (vanished.length) {
    // Not necessarily a problem: callers that genuinely want rows gone follow
    // the commit with store.purge(). This only reports that the diff itself
    // left them alone, so an unintended disappearance is still visible.
    console.warn(
      `[store] ${spec.table}: ${vanished.length} row(s) absent from the new state left in place ` +
      `(deletes are explicit): ${vanished.slice(0, 5).join(", ")}${vanished.length > 5 ? " ..." : ""}`,
    );
  }
  if (dirty.length === 0) return 0;

  const keyColumn = spec.columns[0];
  const updates = spec.columns.slice(1).map((c) => `${c} = excluded.${c}`).join(", ");
  const perChunk = Math.max(1, Math.floor(20000 / spec.columns.length));

  for (let i = 0; i < dirty.length; i += perChunk) {
    const chunk = dirty.slice(i, i + perChunk);
    const params: unknown[] = [];
    const tuples = chunk.map((row) => {
      const ph = spec.values(row).map((v) => {
        params.push(v);
        return `$${params.length}`;
      });
      return `(${ph.join(",")})`;
    });
    await client.query(
      `insert into ${spec.table} (${spec.columns.join(", ")}) values ${tuples.join(", ")}
       on conflict (${keyColumn}) do update set ${updates}`,
      params,
    );
  }
  return dirty.length;
}

const USERS: Spec<User> = {
  table: "users", key: (u) => u.id,
  columns: ["id", "wallet_identity", "wallet_type", "username", "telegram_chat_id", "telegram_username",
    "created_at", "wallet_address", "escrow_shannons", "creator_fees_shannons", "streak", "stats"],
  values: (u) => [u.id, u.walletIdentity ?? "", u.walletType ?? "", u.username ?? null,
    u.telegramChatId ?? null, u.telegramUsername ?? null, tsv(u.createdAt), u.wallet?.address ?? null,
    amount(u.escrowShannons), amount(u.creatorFeesShannons), jsonb(u.streak), jsonb(u.stats)],
};

const MATCHES: Spec<Match> = {
  table: "matches", key: (m) => m.id,
  columns: ["id", "sport", "competition", "oracle", "date", "stage", `"group"`, "home", "away",
    "kickoff", "status", "result", "score", "venue", "matchday", "live_result"],
  values: (m) => [m.id, m.sport ?? null, jsonb(m.competition), jsonb(m.oracle), m.date, m.stage ?? null,
    m.group ?? null, jsonb(m.home), jsonb(m.away), tsv(m.kickoff), m.status, m.result ?? null,
    jsonb(m.score), m.venue ?? null, m.matchday ?? null, m.liveResult ?? null],
};

const MARKETS: Spec<Market> = {
  table: "markets", key: (m) => m.id,
  columns: ["id", "match_id", "creator_id", "status", "pool_home", "pool_draw", "pool_away",
    "total_bets", "unique_bettors", "created_at", "closes_at", "resolved_at",
    "resolved_outcome", "fee_bps", "payout", "receipt_ref"],
  values: (m) => [m.id, m.matchId, m.creatorId, m.status, amount(m.pools?.home), amount(m.pools?.draw),
    amount(m.pools?.away), m.totalBets ?? 0, m.uniqueBettors ?? 0, tsv(m.createdAt), tsv(m.closesAt),
    tsv(m.resolvedAt), m.resolvedOutcome ?? null, jsonb(m.feeBps), jsonb(m.payout), jsonb(m.receipt)],
};

const BETS: Spec<Bet> = {
  table: "bets", key: (b) => b.id,
  columns: ["id", "market_id", "match_id", "user_id", "outcome", "amount", "placed_at",
    "price_at_bet", "settled", "payout", "is_streak_pick", "streak_at_pick"],
  values: (b) => [b.id, b.marketId, b.matchId, b.userId, b.outcome, amount(b.amount), tsv(b.placedAt),
    b.priceAtBet, !!b.settled, b.payout == null ? null : amount(b.payout),
    b.isStreakPick ?? null, b.streakAtPick ?? null],
};

const DEPOSITS: Spec<Deposit> = {
  table: "deposits", key: (d) => d.id,
  columns: ["id", "user_id", "amount_shannons", "tx_hash", "at"],
  values: (d) => [d.id, d.userId, amount(d.amountShannons), d.txHash, tsv(d.at)],
};

const WITHDRAWS: Spec<Withdraw> = {
  table: "withdraws", key: (w) => w.id,
  columns: ["id", "user_id", "amount_shannons", "tx_hash", "at", "status", "signed_transaction"],
  values: (w) => [w.id, w.userId, amount(w.amountShannons), w.txHash ?? null, tsv(w.at),
    w.status ?? null, w.signedTransaction ?? null],
};

const CREWS: Spec<Crew> = {
  table: "crews", key: (c) => c.id,
  columns: ["id", "name", "owner_id", "invite_code", "member_ids", "created_at"],
  values: (c) => [c.id, c.name, c.ownerId, c.inviteCode, jsonb(c.memberIds ?? []), tsv(c.createdAt)],
};

const TELEGRAM_LINKS: Spec<TelegramLink> = {
  table: "telegram_links", key: (t) => t.token,
  columns: ["token", "user_id", "created_at", "expires_at", "used_at"],
  values: (t) => [t.token, t.userId, tsv(t.createdAt), tsv(t.expiresAt), tsv(t.usedAt)],
};

const RECEIPTS: Spec<SettlementReceipt> = {
  table: "receipts", key: (r) => r.marketId,
  columns: ["market_id", "settled_at", "payload"],
  values: (r) => [r.marketId, tsv(r.settledAt), jsonb(r)],
};

/**
 * Persist the delta between two committed states in a single transaction.
 * `prev` is the last committed snapshot; `next` is the mutated draft.
 */
export async function pgSaveDB(prev: StreakDB | null, next: StreakDB): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("begin");

    const p = prev ?? ({} as Partial<StreakDB>);
    await syncCollection(client, USERS, p.users, next.users);
    await syncCollection(client, MATCHES, p.matches, next.matches);
    await syncCollection(client, MARKETS, p.markets, next.markets);
    await syncCollection(client, BETS, p.bets, next.bets);
    await syncCollection(client, DEPOSITS, p.deposits, next.deposits);
    await syncCollection(client, WITHDRAWS, p.withdraws, next.withdraws);
    await syncCollection(client, CREWS, p.crews, next.crews);
    await syncCollection(client, TELEGRAM_LINKS, p.telegramLinks, next.telegramLinks);
    // loadDB returns receipts: [], so anything here was pushed this transaction.
    await syncCollection(client, RECEIPTS, p.receipts, next.receipts);

    await syncMarketSideTables(client, p.markets, next.markets);

    // renewalTxs is an append-only replay guard, not a mutable collection.
    const seen = new Set(p.renewalTxs ?? []);
    const added = (next.renewalTxs ?? []).filter((h) => !seen.has(h));
    if (added.length) {
      const params: unknown[] = [];
      const tuples = added.map((h) => {
        params.push(h);
        return `($${params.length})`;
      });
      await client.query(
        `insert into renewal_txs (tx_hash) values ${tuples.join(", ")} on conflict do nothing`, params);
    }

    await syncMeta(client, p as StreakDB, next);
    await client.query("commit");
  } catch (err) {
    try { await client.query("rollback"); } catch {}
    throw err;
  } finally {
    client.release();
  }
}

/**
 * History and insights live in side tables. They are only written when present
 * on the incoming market — an absent field means "not loaded", never "cleared".
 */
async function syncMarketSideTables(
  client: PoolClient, prev: Market[] | undefined, next: Market[] | undefined,
): Promise<void> {
  const before = new Map((prev ?? []).map((m) => [m.id, m]));

  const historyRows: Array<[string, string]> = [];
  const insightRows: Array<[string, string | null, string | null]> = [];
  for (const m of next ?? []) {
    const old = before.get(m.id);
    if (m.history !== undefined && !same(old?.history ?? [], m.history)) {
      historyRows.push([m.id, JSON.stringify(m.history)]);
    }
    const insightsChanged =
      (m.insightsLatest !== undefined && !same(old?.insightsLatest, m.insightsLatest)) ||
      (m.insightSnapshot !== undefined && !same(old?.insightSnapshot, m.insightSnapshot));
    if (insightsChanged) {
      insightRows.push([m.id, jsonb(m.insightsLatest), jsonb(m.insightSnapshot)]);
    }
  }

  for (const [id, ticks] of historyRows) {
    await client.query(
      `insert into market_history (market_id, ticks) values ($1, $2)
       on conflict (market_id) do update set ticks = excluded.ticks`, [id, ticks]);
  }
  for (const [id, latest, snapshot] of insightRows) {
    await client.query(
      `insert into market_insights (market_id, latest, snapshot) values ($1, $2, $3)
       on conflict (market_id) do update set latest = excluded.latest, snapshot = excluded.snapshot`,
      [id, latest, snapshot]);
  }
}

async function syncMeta(client: PoolClient, prev: StreakDB, next: StreakDB): Promise<void> {
  const fields: Array<keyof StreakDB> = [
    "schema", "treasury", "protocolFeesShannons", "liveScores", "matchesSchema", "dummyAnchorIso",
  ];
  if (fields.every((f) => same(prev?.[f], next[f]))) return;
  await client.query(
    `insert into streak_meta (id, schema, matches_schema, treasury, live_scores, protocol_fees, dummy_anchor_iso, updated_at)
     values ('singleton', $1, $2, $3, $4, $5, $6, now())
     on conflict (id) do update set
       schema = excluded.schema, matches_schema = excluded.matches_schema,
       treasury = excluded.treasury, live_scores = excluded.live_scores,
       protocol_fees = excluded.protocol_fees, dummy_anchor_iso = excluded.dummy_anchor_iso,
       updated_at = now()`,
    [next.schema ?? DB_SCHEMA, next.matchesSchema ?? null, jsonb(next.treasury), jsonb(next.liveScores),
     amount(next.protocolFeesShannons), next.dummyAnchorIso ?? null],
  );
}

// ── receipts (archive accessors) ────────────────────────────────────────────

export async function getReceipt(marketId: string): Promise<SettlementReceipt | undefined> {
  const { rows } = await getPool().query(
    `select payload from receipts where market_id = $1`, [marketId]);
  return rows[0]?.payload as SettlementReceipt | undefined;
}

/** Newest-first receipt payloads for the gallery. */
export async function listReceipts(limit = 200, offset = 0): Promise<SettlementReceipt[]> {
  const { rows } = await getPool().query(
    `select payload from receipts order by settled_at desc limit $1 offset $2`, [limit, offset]);
  return rows.map((r) => r.payload as SettlementReceipt);
}

export async function countReceipts(): Promise<number> {
  const { rows } = await getPool().query(`select count(*)::int n from receipts`);
  return rows[0].n as number;
}

// ── explicit deletes (never inferred) ───────────────────────────────────────

export async function deleteMarkets(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const client = await getPool().connect();
  try {
    await client.query("begin");
    // Refuse to drop anything carrying money or an on-chain receipt, whatever
    // the caller believes. The prune rules already exclude these; this is the
    // backstop that makes a mistake in them non-destructive.
    const { rows } = await client.query(
      `select m.id from markets m
        where m.id = any($1)
          and (m.receipt_ref is not null
               or exists (select 1 from bets b where b.market_id = m.id)
               or exists (select 1 from receipts r where r.market_id = m.id))`, [ids]);
    if (rows.length) {
      throw new Error(
        `refusing to delete ${rows.length} market(s) with bets or receipts: ` +
        rows.slice(0, 5).map((r) => r.id).join(", "),
      );
    }
    await client.query(`delete from market_history where market_id = any($1)`, [ids]);
    await client.query(`delete from market_insights where market_id = any($1)`, [ids]);
    await client.query(`delete from markets where id = any($1)`, [ids]);
    await client.query("commit");
  } catch (err) {
    try { await client.query("rollback"); } catch {}
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteMatches(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await getPool().query(`delete from matches where id = any($1)`, [ids]);
}

export async function deleteReceipts(marketIds: string[]): Promise<void> {
  if (marketIds.length === 0) return;
  await getPool().query(`delete from receipts where market_id = any($1)`, [marketIds]);
}

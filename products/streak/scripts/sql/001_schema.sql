-- Streak Terminal — relational schema (replaces the singleton jsonb blob).
--
-- Design notes:
--  * Money is numeric(40,0) shannons. node-postgres returns numeric as a JS
--    string, which is exactly what asBig() in wallet.ts already consumes — so
--    amounts round-trip with no precision loss and no call-site changes.
--    (bigint would be parsed into a lossy JS Number; do not use it.)
--  * Fat, rarely-read market columns (price history, provider insights) live in
--    side tables so the hot path never drags them across the wire.
--  * Replay guards that were array scans become primary keys / unique indexes.

begin;

create table if not exists streak_meta (
  id               text primary key default 'singleton',
  schema           int  not null,
  matches_schema   int,
  treasury         jsonb,
  live_scores      jsonb,
  protocol_fees    numeric(40,0) not null default 0,
  dummy_anchor_iso text,
  updated_at       timestamptz not null default now()
);

create table if not exists users (
  id                    text primary key,
  wallet_identity       text not null,
  wallet_type           text not null default '',
  username              text,
  telegram_chat_id      text,
  telegram_username     text,
  created_at            timestamptz,
  wallet_address        text,
  escrow_shannons       numeric(40,0) not null default 0,
  creator_fees_shannons numeric(40,0) not null default 0,
  streak                jsonb not null,
  stats                 jsonb not null,
  constraint users_escrow_non_negative check (escrow_shannons >= 0),
  constraint users_fees_non_negative   check (creator_fees_shannons >= 0)
);
-- Legacy rows may share an empty wallet_identity; only constrain real ones.
create unique index if not exists users_wallet_identity_key
  on users (wallet_identity) where wallet_identity <> '';
create unique index if not exists users_username_key
  on users (lower(username)) where username is not null;

create table if not exists matches (
  id          text primary key,
  sport       text,
  competition jsonb,
  oracle      jsonb,
  date        text not null,
  stage       text,
  "group"     text,
  home        jsonb not null,
  away        jsonb not null,
  kickoff     timestamptz not null,
  status      text not null,
  result      text,
  score       jsonb,
  venue       text,
  matchday    text,
  live_result boolean
);
create index if not exists matches_status_kickoff_idx on matches (status, kickoff);
create index if not exists matches_kickoff_idx        on matches (kickoff);

create table if not exists markets (
  id               text primary key,
  match_id         text not null references matches(id) on delete restrict,
  creator_id       text not null,
  status           text not null,
  pool_home        numeric(40,0) not null default 0,
  pool_draw        numeric(40,0) not null default 0,
  pool_away        numeric(40,0) not null default 0,
  total_bets       int  not null default 0,
  unique_bettors   int  not null default 0,
  created_at       timestamptz,
  closes_at        timestamptz,
  resolved_at      timestamptz,
  resolved_outcome text,
  fee_bps          jsonb not null,
  payout           jsonb,
  receipt_ref      jsonb,
  constraint markets_pools_non_negative
    check (pool_home >= 0 and pool_draw >= 0 and pool_away >= 0)
);
-- markets.ts finds a market by matchId and assumes at most one.
create unique index if not exists markets_match_id_key  on markets (match_id);
create index        if not exists markets_status_idx    on markets (status, closes_at);
create index        if not exists markets_open_idx      on markets (closes_at) where status = 'open';

create table if not exists market_history (
  market_id text primary key references markets(id) on delete cascade,
  ticks     jsonb not null
);

create table if not exists market_insights (
  market_id text primary key references markets(id) on delete cascade,
  latest    jsonb,
  snapshot  jsonb
);

create table if not exists bets (
  id             text primary key,
  market_id      text not null references markets(id) on delete restrict,
  match_id       text not null,
  user_id        text not null references users(id)   on delete restrict,
  outcome        text not null check (outcome in ('home','draw','away')),
  amount         numeric(40,0) not null check (amount > 0),
  placed_at      timestamptz not null,
  price_at_bet   double precision not null,
  settled        boolean not null default false,
  payout         numeric(40,0),
  is_streak_pick boolean,
  streak_at_pick int
);
create index if not exists bets_market_idx     on bets (market_id);
create index if not exists bets_user_idx       on bets (user_id, placed_at desc);
create index if not exists bets_unsettled_idx  on bets (market_id) where not settled;
-- One tagged streak pick per user per UTC day (enforced in game.ts today).
create unique index if not exists bets_streak_pick_daily_key
  on bets (user_id, ((placed_at at time zone 'UTC')::date)) where is_streak_pick;

create table if not exists deposits (
  id              text primary key,
  user_id         text not null references users(id) on delete restrict,
  amount_shannons numeric(40,0) not null,
  tx_hash         text not null,
  at              timestamptz not null
);
-- A deposit tx must never be credited twice.
create unique index if not exists deposits_tx_hash_key on deposits (tx_hash);

create table if not exists withdraws (
  id                 text primary key,
  user_id            text not null references users(id) on delete restrict,
  amount_shannons    numeric(40,0) not null,
  tx_hash            text,
  at                 timestamptz not null,
  status             text,
  signed_transaction text
);
create index if not exists withdraws_pending_idx on withdraws (status) where status = 'pending';
create index if not exists withdraws_user_idx    on withdraws (user_id, at desc);

create table if not exists receipts (
  market_id  text primary key,
  settled_at timestamptz not null,
  payload    jsonb not null
);
create index if not exists receipts_settled_at_idx on receipts (settled_at desc);

create table if not exists crews (
  id          text primary key,
  name        text not null,
  owner_id    text not null references users(id) on delete restrict,
  invite_code text not null,
  member_ids  jsonb not null,
  created_at  timestamptz
);
create unique index if not exists crews_invite_code_key on crews (upper(invite_code));

create table if not exists telegram_links (
  token      text primary key,
  user_id    text not null references users(id) on delete cascade,
  created_at timestamptz,
  expires_at timestamptz,
  used_at    timestamptz
);

-- Was StreakDB.renewalTxs: a string[] scanned linearly. Now a replay guard the
-- database enforces.
create table if not exists renewal_txs (
  tx_hash text primary key,
  used_at timestamptz not null default now()
);

commit;

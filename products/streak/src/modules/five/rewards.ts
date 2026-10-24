import { ccc } from '@ckb-ccc/core';
import type { Pool } from 'pg';
import { FiveError, type Round } from './domain';
import { CONFIRMATIONS } from './funding';
import { isAuction } from './auction';

export interface RewardAccount {
  availableShannons: string;
  pendingShannons: string;
  paidShannons: string;
  minimumShannons: string;
  transactionHash: string;
  status: string;
}
/**
 * A custodial, testnet-only ledger. Credits come only from frozen round allocations.
 * Signed payout bytes and their reserved credit rows commit together before broadcast.
 */
export class FiveRewards {
  private ready?: Promise<void>;
  constructor(
    readonly pool: Pool,
    readonly chain: ccc.Client,
    readonly address: string,
  ) {
    if (chain.addressPrefix !== 'ckt') throw Error('Five rewards are testnet only');
  }
  async init() {
    this.ready ??= this.pool
      .query(
        `
      CREATE TABLE IF NOT EXISTS streak_five_credits (
        id text PRIMARY KEY, wallet text NOT NULL, amount numeric(30,0) NOT NULL CHECK(amount>0),
        payout_id text);
      CREATE TABLE IF NOT EXISTS streak_five_payouts (
        id text PRIMARY KEY, wallet text NOT NULL, amount numeric(30,0) NOT NULL,
        signed_bytes text NOT NULL, tx_hash text UNIQUE NOT NULL, status text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE IF NOT EXISTS streak_five_claim_requests (wallet text PRIMARY KEY);
      ALTER TABLE streak_five_claim_requests ADD COLUMN IF NOT EXISTS refund_only boolean NOT NULL DEFAULT false;
      CREATE TABLE IF NOT EXISTS streak_five_reward_runtime (
        id integer PRIMARY KEY CHECK(id=1), address text NOT NULL, heartbeat timestamptz NOT NULL);
    `,
      )
      .then(() => {})
      .catch((e) => {
        this.ready = undefined;
        throw e;
      });
    return this.ready;
  }
  async active() {
    await this.init();
    const r = await this.pool.query(
      "SELECT 1 FROM streak_five_reward_runtime WHERE id=1 AND address=$1 AND heartbeat>clock_timestamp()-interval '90 seconds'",
      [this.address],
    );
    return r.rowCount === 1;
  }
  async heartbeat() {
    await this.init();
    await this.pool.query(
      `INSERT INTO streak_five_reward_runtime(id,address,heartbeat) VALUES(1,$1,clock_timestamp())
      ON CONFLICT(id) DO UPDATE SET address=$1,heartbeat=clock_timestamp()`,
      [this.address],
    );
  }
  async credit(round: Round) {
    const auction = isAuction(round);
    if (round.state !== 'final' && round.state !== 'cancelled' && !(auction && round.auction))
      return;
    await this.init();
    const rows = (round.state === 'final' ? round.entries : []).flatMap((e) => {
      const amount = round.rewards[e.publicId] ?? '0';
      return BigInt(amount) > 0n
        ? [{ id: `${round.id}:prize:${e.publicId}`, wallet: e.wallet, amount }]
        : [];
    });
    const returnAll = round.state === 'cancelled' || (round.state === 'final' && !rows.length);
    const refunds = round.sponsors.filter(
      (s) =>
        s.funding === 'confirmed' &&
        (returnAll ||
          (auction && !!round.auction && !round.auction.winnerSponsorIds.includes(s.id))),
    );
    for (const s of refunds)
      rows.push({ id: `${round.id}:refund:${s.id}`, wallet: s.wallet, amount: s.amountShannons });
    const connection = await this.pool.connect();
    try {
      await connection.query('BEGIN');
      // Serialize refund producers with the consumer before inserting credits.
      // A producer racing deletion must leave a fresh queued request behind.
      if (auction)
        for (const wallet of [...new Set(refunds.map((s) => s.wallet))].sort())
          await connection.query(
            'INSERT INTO streak_five_claim_requests(wallet,refund_only) VALUES($1,true) ON CONFLICT(wallet) DO UPDATE SET refund_only=streak_five_claim_requests.refund_only',
            [wallet],
          );
      for (const row of rows) {
        await connection.query(
          'INSERT INTO streak_five_credits(id,wallet,amount) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING',
          [row.id, row.wallet, row.amount],
        );
        const old = await connection.query<{ wallet: string; amount: string }>(
          'SELECT wallet,amount FROM streak_five_credits WHERE id=$1',
          [row.id],
        );
        if (old.rows[0].wallet !== row.wallet || old.rows[0].amount !== row.amount)
          throw Error('Frozen Five credit changed');
      }
      await connection.query('COMMIT');
    } catch (e) {
      await connection.query('ROLLBACK');
      throw e;
    } finally {
      connection.release();
    }
  }
  async account(wallet: string): Promise<RewardAccount> {
    await this.init();
    const lock = (await ccc.Address.fromString(wallet, this.chain)).script;
    const minimum = BigInt(ccc.CellOutput.from({ lock }, '0x').occupiedSize) * 100_000_000n;
    const credits = await this.pool.query<{ total: string }>(
      'SELECT coalesce(sum(amount),0)::text AS total FROM streak_five_credits WHERE wallet=$1 AND payout_id IS NULL',
      [wallet],
    );
    const payouts = await this.pool.query<{ amount: string; status: string; tx_hash: string }>(
      'SELECT amount::text,status,tx_hash FROM streak_five_payouts WHERE wallet=$1 ORDER BY created_at DESC',
      [wallet],
    );
    let pending = 0n,
      paid = 0n;
    const queued = await this.pool.query(
      'SELECT 1 FROM streak_five_claim_requests WHERE wallet=$1',
      [wallet],
    );
    for (const p of payouts.rows)
      if (p.status === 'confirmed') paid += BigInt(p.amount);
      else pending += BigInt(p.amount);
    return {
      availableShannons: credits.rows[0].total,
      pendingShannons: pending.toString(),
      paidShannons: paid.toString(),
      minimumShannons: minimum.toString(),
      transactionHash: payouts.rows[0]?.tx_hash ?? '',
      status: queued.rowCount ? 'queued' : (payouts.rows[0]?.status ?? 'none'),
    };
  }
  async refundStates(roundId: string, wallet: string) {
    await this.init();
    const result = await this.pool.query<{ id: string; status: string | null }>(
      'SELECT c.id,p.status FROM streak_five_credits c LEFT JOIN streak_five_payouts p ON p.id=c.payout_id WHERE c.wallet=$1 AND starts_with(c.id,$2)',
      [wallet, `${roundId}:refund:`],
    );
    return new Map(
      result.rows.map((r) => [
        r.id.slice(`${roundId}:refund:`.length),
        r.status === 'confirmed'
          ? 'Refund returned'
          : r.status
            ? 'Refund confirming'
            : 'Refund queued',
      ]),
    );
  }
  async request(wallet: string) {
    const a = await this.account(wallet);
    if (BigInt(a.pendingShannons) > 0n) return;
    if (BigInt(a.availableShannons) < BigInt(a.minimumShannons))
      throw new FiveError(
        'Your rewards are saved. Collect when the balance reaches the wallet cell minimum.',
        409,
      );
    if (!(await this.active()))
      throw new FiveError(
        'Rewards delivery is temporarily unavailable. Your balance remains saved.',
        503,
      );
    await this.pool.query(
      'INSERT INTO streak_five_claim_requests(wallet,refund_only) VALUES($1,false) ON CONFLICT(wallet) DO UPDATE SET refund_only=false',
      [wallet],
    );
  }
  /** One dedicated worker/wallet; an advisory lock also serializes accidental duplicate processes. */
  async tick(signer: ccc.Signer, verifyBacking: (roundId: string) => Promise<void>) {
    await this.init();
    const signerAddress = await signer.getRecommendedAddress();
    if (signerAddress !== this.address || signer.client.addressPrefix !== 'ckt')
      throw Error('Dedicated reward signer does not match configuration');
    const connection = await this.pool.connect();
    const locked = await connection.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock(7138830) AS locked',
    );
    if (!locked.rows[0].locked) {
      connection.release();
      return;
    }
    try {
      const pending = await connection.query<{ id: string; signed_bytes: string; tx_hash: string }>(
        "SELECT id,signed_bytes,tx_hash FROM streak_five_payouts WHERE status<>'confirmed' ORDER BY created_at",
      );
      for (const row of pending.rows) {
        const tx = ccc.Transaction.fromBytes(row.signed_bytes);
        if (tx.hash() !== row.tx_hash) throw Error('Payout journal hash mismatch');
        const result = await this.chain.getTransactionNoCache(row.tx_hash);
        if (
          result?.status === 'committed' &&
          result.transaction.hash() === row.tx_hash &&
          result.blockHash &&
          result.blockNumber !== undefined
        ) {
          const block = await this.chain.getHeaderByNumberNoCache(result.blockNumber),
            tip = await this.chain.getTipHeader();
          if (
            block?.hash === result.blockHash &&
            tip.number - result.blockNumber + 1n >= BigInt(CONFIRMATIONS)
          )
            await connection.query(
              "UPDATE streak_five_payouts SET status='confirmed' WHERE id=$1",
              [row.id],
            );
          else return;
        } else {
          if (!result || ['unknown', 'rejected'].includes(result.status)) {
            for (const input of tx.inputs)
              if (!(await this.chain.getCellLiveNoCache(input.previousOutput, false, true))) return;
            await this.chain.sendTransactionNoCache(tx, 'passthrough');
          }
          return; // Do not select more wallet inputs while a payout is unresolved.
        }
      }
      const requested = await connection.query<{ wallet: string; refund_only: boolean }>(
        'SELECT wallet,refund_only FROM streak_five_claim_requests ORDER BY wallet LIMIT 1',
      );
      if (!requested.rows.length) return;
      const wallet = requested.rows[0].wallet;
      await connection.query('BEGIN');
      try {
        const request = await connection.query<{ refund_only: boolean }>(
          'SELECT refund_only FROM streak_five_claim_requests WHERE wallet=$1 FOR UPDATE',
          [wallet],
        );
        if (!request.rows.length) {
          await connection.query('COMMIT');
          return;
        }
        const credits = await connection.query<{ id: string; amount: string }>(
          "SELECT id,amount::text FROM streak_five_credits WHERE wallet=$1 AND payout_id IS NULL AND (NOT $2::boolean OR id LIKE '%:refund:%') FOR UPDATE",
          [wallet, request.rows[0].refund_only],
        );
        for (const id of new Set(credits.rows.map((c) => c.id.split(':')[0])))
          await verifyBacking(id);
        const total = credits.rows.reduce((n, c) => n + BigInt(c.amount), 0n);
        const target = (await ccc.Address.fromString(wallet, this.chain)).script;
        const minimum =
          BigInt(ccc.CellOutput.from({ lock: target }, '0x').occupiedSize) * 100_000_000n;
        if (total < minimum) {
          await connection.query('DELETE FROM streak_five_claim_requests WHERE wallet=$1', [
            wallet,
          ]);
          await connection.query('COMMIT');
          return;
        }
        let tx = ccc.Transaction.from({
          outputs: [{ lock: target, capacity: total }],
          outputsData: ['0x'],
        });
        // Sponsorship cells contain a 32-byte attribution marker. No type cells are collected.
        const filter = {
          scriptLenRange: [0, 1] as [number, number],
          outputDataLenRange: [0, 33] as [number, number],
        };
        await tx.completeInputsByCapacity(signer, 0n, filter);
        await tx.completeFeeBy(signer, 1000n, filter);
        tx = await signer.signTransaction(tx);
        if (
          !tx.outputs[0]?.lock.eq(target) ||
          tx.outputs[0].capacity !== total ||
          tx.outputs[0].type ||
          tx.outputsData[0] !== '0x'
        )
          throw Error('Reward transaction changed the promised payout');
        const owner = (await ccc.Address.fromString(this.address, this.chain)).script;
        if (
          tx.outputs
            .slice(1)
            .some((o, i) => !o.lock.eq(owner) || o.type || tx.outputsData[i + 1] !== '0x')
        )
          throw Error('Unexpected reward change');
        await this.chain.sendTransactionDry(tx, 'passthrough');
        const id = tx.hash();
        await connection.query(
          'INSERT INTO streak_five_payouts(id,wallet,amount,signed_bytes,tx_hash,status) VALUES($1,$2,$3,$4,$1,$5)',
          [id, wallet, total.toString(), ccc.hexFrom(tx.toBytes()), 'submitted'],
        );
        await connection.query(
          'UPDATE streak_five_credits SET payout_id=$1 WHERE id=ANY($2::text[])',
          [id, credits.rows.map((c) => c.id)],
        );
        await connection.query('DELETE FROM streak_five_claim_requests WHERE wallet=$1', [wallet]);
        await connection.query('COMMIT');
        // The next tick broadcasts the committed journal, including after a crash here.
      } catch (e) {
        await connection.query('ROLLBACK');
        throw e;
      }
    } finally {
      await connection.query('SELECT pg_advisory_unlock(7138830)');
      connection.release();
    }
  }
}

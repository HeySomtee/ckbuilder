import type { Round } from './domain';
import { isAuction } from './auction';

export type SponsorRefundState =
  'owed' | 'queued' | 'paused' | 'confirming' | 'delayed' | 'returned' | 'review';
export interface SponsorRefund {
  state: SponsorRefundState;
  totalShannons: string;
  returnedShannons: string;
  pendingShannons: string;
  transactionHashes: string[];
}
export interface RefundLedgerRow {
  id: string;
  amount: string;
  payout_id: string | null;
  payout_wallet: string | null;
  status: string | null;
  tx_hash: string | null;
  created_at: Date | null;
}

/** Only frozen refund obligations are projected; bids are not payout evidence. */
export function refundableSponsors(round: Round) {
  if (round.state !== 'cancelled' && round.state !== 'final' && !round.auction) return [];
  const returnAll =
    round.state === 'cancelled' ||
    (round.state === 'final' &&
      !round.entries.some((entry) => BigInt(round.rewards[entry.publicId] ?? '0') > 0n));
  return round.sponsors.filter(
    (sponsor) =>
      sponsor.funding === 'confirmed' &&
      (returnAll ||
        (isAuction(round) &&
          !!round.auction &&
          !round.auction.winnerSponsorIds.includes(sponsor.id))),
  );
}

export function projectSponsorRefund(
  round: Round,
  wallet: string,
  ledger: readonly RefundLedgerRow[],
  queued: boolean,
  retrying: boolean,
  workerAvailable: boolean,
  now: number,
): SponsorRefund | null {
  const expected = refundableSponsors(round).filter((sponsor) => sponsor.wallet === wallet);
  if (!expected.length) return null;
  const byId = new Map(ledger.map((row) => [row.id, row]));
  const hashes = new Set<string>();
  let total = 0n,
    returned = 0n,
    pending = 0n,
    missing = false,
    review = false,
    delayed = retrying;
  for (const sponsor of expected) {
    const amount = BigInt(sponsor.amountShannons);
    total += amount;
    const row = byId.get(`${round.id}:refund:${sponsor.id}`);
    if (!row) {
      missing = true;
      continue;
    }
    if (row.amount !== sponsor.amountShannons) {
      review = true;
      continue;
    }
    if (!row.payout_id) continue;
    if (
      row.payout_wallet !== wallet ||
      !row.tx_hash ||
      !/^0x[0-9a-f]{64}$/i.test(row.tx_hash) ||
      !['submitted', 'confirmed'].includes(row.status ?? '')
    ) {
      review = true;
      continue;
    }
    hashes.add(row.tx_hash);
    if (row.status === 'confirmed') returned += amount;
    else {
      pending += amount;
      if (!row.created_at || now - row.created_at.getTime() > 5 * 60_000) delayed = true;
    }
  }
  return {
    state: review
      ? 'review'
      : returned === total
        ? 'returned'
        : !workerAvailable
          ? 'paused'
          : delayed
            ? 'delayed'
            : pending > 0n
              ? 'confirming'
              : missing || !queued
                ? 'owed'
                : 'queued',
    totalShannons: total.toString(),
    returnedShannons: returned.toString(),
    pendingShannons: pending.toString(),
    transactionHashes: [...hashes],
  };
}

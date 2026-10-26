import type { Round, Sponsor } from './domain';
import { lockTime } from './timing';

/** Published auction-v1 rule: allow canonical confirmation after signed admission closes. */
export const AUCTION_GRACE_MS = 30 * 60_000;
export const isAuction = (round: Round) => round.terms.sponsorshipMode === 'auction';
export const auctionCutoff = (round: Round) => lockTime(round) + AUCTION_GRACE_MS;

export function auctionBids(round: Round) {
  const groups = new Map<
    string,
    { wallet: string; amount: bigint; sequence: number; sponsors: Sponsor[] }
  >();
  for (const sponsor of round.sponsors) {
    if (sponsor.funding !== 'confirmed') continue;
    if (
      !Number.isSafeInteger(sponsor.submittedSequence) ||
      sponsor.submittedSequence! < 1 ||
      !sponsor.confirmedAt
    )
      throw Error('Auction funding evidence is incomplete');
    const confirmed = Date.parse(sponsor.confirmedAt);
    if (!Number.isFinite(confirmed)) throw Error('Auction confirmation time is invalid');
    if (confirmed > auctionCutoff(round)) continue;
    const bid = groups.get(sponsor.wallet) ?? {
      wallet: sponsor.wallet,
      amount: 0n,
      sequence: 0,
      sponsors: [],
    };
    bid.amount += BigInt(sponsor.amountShannons);
    bid.sequence = Math.max(bid.sequence, sponsor.submittedSequence!);
    bid.sponsors.push(sponsor);
    groups.set(sponsor.wallet, bid);
  }
  return [...groups.values()].sort((a, b) =>
    a.amount === b.amount ? a.sequence - b.sequence : a.amount > b.amount ? -1 : 1,
  );
}

export function closeAuction(round: Round, now: number) {
  if (!isAuction(round) || round.auction || round.state !== 'open' || now < lockTime(round))
    return false;
  if (now < auctionCutoff(round) && round.sponsors.some((s) => s.funding === 'submitted'))
    return false;
  const winner = auctionBids(round)[0];
  round.auction = {
    closedAt: new Date(now).toISOString(),
    winnerWallet: winner?.wallet ?? '',
    winnerSponsorIds: winner?.sponsors.map((s) => s.id) ?? [],
    amountShannons: winner?.amount.toString() ?? '0',
  };
  return true;
}

export function winningSponsors(round: Round) {
  if (!isAuction(round)) return round.sponsors.filter((s) => s.funding === 'confirmed');
  return round.sponsors.filter(
    (s) => s.funding === 'confirmed' && round.auction?.winnerSponsorIds.includes(s.id),
  );
}

export function auctionView(round: Round, accountId: string | null, now: number) {
  if (!isAuction(round)) return null;
  const bids = auctionBids(round),
    leader = bids[0];
  const ownWallet = round.sponsors.find((s) => s.accountId === accountId)?.wallet;
  const ownPayments = round.sponsors.filter((s) => s.accountId === accountId);
  const paid = ownPayments.some((s) => s.funding === 'confirmed');
  const pending = ownPayments.some((s) => s.funding === 'submitted');
  const own = bids.find((b) => b.wallet === ownWallet);
  const settled = !!round.auction;
  const cancelled = round.state === 'cancelled';
  return {
    state: cancelled
      ? 'cancelled'
      : settled
        ? 'settled'
        : now < lockTime(round)
          ? 'open'
          : 'confirming',
    closesAt: new Date(lockTime(round)).toISOString(),
    confirmationCutoff: new Date(auctionCutoff(round)).toISOString(),
    leadingShannons: settled ? round.auction!.amountShannons : (leader?.amount.toString() ?? '0'),
    bidderCount: bids.length,
    ownShannons: own?.amount.toString() ?? '0',
    ownStatus: !paid
      ? pending
        ? 'confirming'
        : 'none'
      : cancelled
        ? 'refunding'
        : settled
          ? round.auction!.winnerWallet === ownWallet
            ? 'won'
            : 'refunding'
          : !own
            ? 'confirming'
            : own === leader
              ? 'leading'
              : 'outbid',
  };
}

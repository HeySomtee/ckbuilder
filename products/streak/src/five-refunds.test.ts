import assert from 'node:assert/strict';
import { newRound, parseTerms, type Sponsor } from './modules/five/domain';
import {
  projectSponsorRefund,
  refundableSponsors,
  type RefundLedgerRow,
} from './modules/five/refunds';

const now = Date.now();
const round = newRound(
  'refunds',
  'admin',
  parseTerms({
    name: 'Refund projection',
    lockAt: new Date(now + 600_000).toISOString(),
    finalizeAfter: new Date(now + 7_200_000).toISOString(),
    limit: 100,
    qualifyingBps: 500,
    sponsorship: true,
    sponsorshipMode: 'auction',
    minimumShannons: '10000000000',
    source: 'Synthetic fixture',
    players: ['GK', 'DEF', 'MID', 'MID', 'FWD'].map((position, i) => ({
      id: `p${i}`,
      name: `Player ${i}`,
      teamId: `t${i}`,
      team: `Team ${i}`,
      position,
      cost: 80,
      fixtureId: `f${i}`,
    })),
  }),
  now,
);
const bid = (id: string, wallet: string, amount: number): Sponsor => ({
  id,
  accountId: wallet,
  wallet,
  amountShannons: (BigInt(amount) * 100_000_000n).toString(),
  display: 'anonymous',
  name: '',
  logo: '',
  link: '',
  moderation: 'pending',
  createdAt: new Date(now).toISOString(),
  funding: 'confirmed',
});
round.state = 'open';
round.sponsors = [
  bid('winner', 'winner-wallet', 2500),
  bid('one', 'owner', 200),
  bid('two', 'owner', 300),
];
assert.equal(projectSponsorRefund(round, 'owner', [], false, false, true, now), null);
round.auction = {
  closedAt: new Date(now).toISOString(),
  winnerWallet: 'winner-wallet',
  winnerSponsorIds: ['winner'],
  amountShannons: '250000000000',
};
assert.deepEqual(
  refundableSponsors(round).map((sponsor) => sponsor.id),
  ['one', 'two'],
);
const ledger = (id: string, amount: number, status: string | null): RefundLedgerRow => ({
  id: `refunds:refund:${id}`,
  amount: (BigInt(amount) * 100_000_000n).toString(),
  payout_id: status ? 'payout' : null,
  payout_wallet: status ? 'owner' : null,
  status,
  tx_hash: status ? `0x${'12'.repeat(32)}` : null,
  created_at: status ? new Date(now) : null,
});
const view = (rows: RefundLedgerRow[], queued = true, active = true, retry = false) =>
  projectSponsorRefund(round, 'owner', rows, queued, retry, active, now)!;
assert.equal(view([]).state, 'owed', 'Frozen auction results do not imply a transfer started');
assert.equal(view([ledger('one', 200, null), ledger('two', 300, null)]).state, 'queued');
assert.equal(view([ledger('one', 200, null), ledger('two', 300, null)], false).state, 'owed');
assert.equal(view([], false, false).state, 'paused');
assert.equal(view([ledger('one', 200, null)], true, true, true).state, 'delayed');
const partlyPaid = view([ledger('one', 200, 'confirmed'), ledger('two', 300, 'submitted')]);
assert.deepEqual(partlyPaid, {
  state: 'confirming',
  totalShannons: '50000000000',
  returnedShannons: '20000000000',
  pendingShannons: '30000000000',
  transactionHashes: [`0x${'12'.repeat(32)}`],
});
const paid = view(
  [ledger('one', 200, 'confirmed'), ledger('two', 300, 'confirmed')],
  true,
  false,
  true,
);
assert.equal(
  paid.state,
  'returned',
  'Paid refunds stop loading even with a stale queue or stopped worker',
);
assert.equal(paid.returnedShannons, '50000000000');
assert.equal(paid.pendingShannons, '0');
assert.equal(
  view([{ ...ledger('one', 200, 'submitted'), created_at: new Date(now - 301_000) }]).state,
  'delayed',
  'Old signed payouts do not masquerade as fresh progress indefinitely',
);
assert.equal(
  view([{ ...ledger('one', 200, 'confirmed'), payout_wallet: 'another' }]).state,
  'review',
);
assert.equal(view([{ ...ledger('one', 200, 'confirmed'), status: null }]).state, 'review');
assert.equal(view([ledger('one', 999, 'confirmed')]).state, 'review');
assert.equal(
  projectSponsorRefund(
    round,
    'stranger',
    [ledger('one', 200, 'confirmed')],
    true,
    false,
    true,
    now,
  ),
  null,
  'Another account cannot discover payout hashes through this projection',
);
round.sponsors.push({ ...bid('unsigned', 'owner', 100), funding: 'awaiting' });
assert.equal(
  view([ledger('one', 200, 'confirmed'), ledger('two', 300, 'confirmed')]).state,
  'returned',
);
round.sponsors.push(bid('late', 'winner-wallet', 100));
assert.deepEqual(
  refundableSponsors(round).map((sponsor) => sponsor.id),
  ['one', 'two', 'late'],
);
round.state = 'cancelled';
assert.ok(refundableSponsors(round).some((sponsor) => sponsor.id === 'winner'));
console.log(
  'Five sponsor refunds: frozen obligations, top-ups, exact ledger ownership, paid/partial/delayed/paused states passed.',
);

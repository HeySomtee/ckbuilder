import assert from 'node:assert/strict';
import { ccc } from '@ckb-ccc/core';
import { FiveFunding } from './modules/five/funding';
import type { FiveStorage } from './modules/five/storage';
import { auctionBids, auctionCutoff, auctionView, closeAuction } from './modules/five/auction';
import {
  fundedPool,
  hashTerms,
  newRound,
  parseTerms,
  project,
  type Sponsor,
  type Round,
} from './modules/five/domain';

const now = Date.now();
const terms = parseTerms({
  name: 'Auction test',
  lockAt: new Date(now + 600000).toISOString(),
  finalizeAfter: new Date(now + 7200000).toISOString(),
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
});
const r = newRound('auction', 'admin', terms, now);
r.state = 'open';
const deadline = Date.parse(terms.lockAt);
function bid(id: string, wallet: string, ckb: number, sequence: number): Sponsor {
  return {
    id,
    accountId: wallet,
    wallet,
    amountShannons: (BigInt(ckb) * 100000000n).toString(),
    display: 'anonymous',
    name: '',
    logo: '',
    link: '',
    moderation: 'pending',
    createdAt: new Date(now).toISOString(),
    funding: 'confirmed',
    submittedSequence: sequence,
    confirmedAt: new Date(deadline + 1000).toISOString(),
  };
}
r.sponsors.push(bid('a1', 'a', 100, 1), bid('b1', 'b', 300, 2), bid('a2', 'a', 200, 3));
assert.equal(auctionBids(r)[0].wallet, 'b', 'Earlier total wins a tie, not earliest first payment');
assert.equal(auctionView(r, 'a', now)?.ownStatus, 'outbid');
assert.equal(fundedPool(r), '0', 'Escrowed losing bids are never advertised as prizes');
assert.equal(closeAuction(r, deadline - 1), false);
r.sponsors.push(bid('a3', 'a', 100, 4));
assert.equal(auctionBids(r)[0].amount, 40000000000n, 'Top-ups combine by wallet');
const pending = {
  ...bid('pending', 'c', 1000, 5),
  funding: 'submitted' as const,
  confirmedAt: undefined,
};
r.sponsors.push(pending);
assert.equal(closeAuction(r, deadline + 1000), false, 'Wait for accepted signatures during grace');
assert.equal(
  closeAuction(r, auctionCutoff(r)),
  true,
  'Unknown payment cannot block settlement forever',
);
assert.equal(r.auction?.winnerWallet, 'a');
assert.equal(fundedPool(r), '40000000000');
assert.equal(auctionView(r, 'a', auctionCutoff(r))?.ownStatus, 'won');
const snapshot = JSON.stringify(r.auction);
pending.funding = 'submitted';
Object.assign(pending, {
  funding: 'confirmed',
  confirmedAt: new Date(auctionCutoff(r) + 1).toISOString(),
});
assert.equal(closeAuction(r, auctionCutoff(r) + 10000), false);
assert.equal(
  JSON.stringify(r.auction),
  snapshot,
  'Late money and retries cannot replace the winner',
);
assert.equal(fundedPool(r), '40000000000');
assert.equal(
  project(r, 'c', false, auctionCutoff(r) + 10000).ownSponsorships[0].auctionOutcome,
  'Refund pending',
);
assert.equal(
  project(r, null, false, auctionCutoff(r)).sponsors.length,
  1,
  'Only winner recognition',
);
assert.equal(project(r, null, false, auctionCutoff(r)).sponsors[0].name, 'Community supporter');
assert.ok(!JSON.stringify(project(r, null, false, auctionCutoff(r))).includes('winnerWallet'));
const lateObserved = newRound('observed', 'admin', terms, now);
lateObserved.state = 'open';
lateObserved.sponsors = [bid('earlier', 'a', 100, 1)];
assert.equal(closeAuction(lateObserved, auctionCutoff(lateObserved) + 60000), true);
assert.equal(
  fundedPool(lateObserved),
  '10000000000',
  'Canonical confirmation time survives worker downtime',
);
const community = { ...terms };
delete community.sponsorshipMode;
const oldHash = hashTerms(community);
assert.equal(hashTerms(parseTerms(community)), oldHash, 'Legacy terms hash stays stable');
const legacy = newRound('legacy', 'admin', community, now);
legacy.state = 'open';
legacy.sponsors = [bid('x', 'a', 100, 1), bid('y', 'b', 200, 2)];
assert.equal(fundedPool(legacy), '30000000000');
assert.equal(project(legacy, null, false, now).auction, null);
assert.equal(closeAuction(legacy, auctionCutoff(legacy)), false);
assert.throws(() => parseTerms({ ...terms, sponsorshipMode: 'hidden' }), /sponsor auction/);
console.log(
  'Five auction: top-ups, tie priority, deadline/grace, late confirmations, privacy and legacy terms passed.',
);
async function recovery() {
  const round = newRound('recovery', 'admin', terms, now);
  round.state = 'open';
  const transactions = new Map<string, ccc.Transaction>();
  for (let i = 1; i <= 6; i++) {
    const tx = ccc.Transaction.from({
      outputs: [
        {
          capacity: 10000000000n,
          lock: { codeHash: '0x' + '11'.repeat(32), hashType: 'data', args: '0x' },
        },
      ],
      outputsData: ['0x' + i.toString(16).padStart(2, '0')],
    });
    transactions.set(tx.hash(), tx);
    round.sponsors.push({
      ...bid(`bid${i}`, `wallet${i}`, i * 100, i),
      funding: 'submitted',
      confirmedAt: undefined,
      transactionHash: tx.hash(),
      signedBytes: ccc.hexFrom(tx.toBytes()),
    });
  }
  let stored = structuredClone(round);
  const store: FiveStorage = {
    clock: async () => auctionCutoff(round) + 60000,
    list: async () => [],
    load: async () => structuredClone(stored),
    create: async () => {
      throw Error('Not used');
    },
    change: async (_id, mutate) => {
      const copy = structuredClone(stored);
      mutate(copy, auctionCutoff(round) + 60000);
      copy.revision++;
      stored = copy;
      return copy;
    },
  };
  const client = new ccc.ClientPublicTestnet({ url: 'http://127.0.0.1:1', fallbacks: [] });
  let changed = false,
    failLast = true,
    unknown = false,
    tipTimestamp = auctionCutoff(round) + 60000;
  const last = round.sponsors[5].transactionHash;
  Object.assign(client, {
    getTransactionNoCache: async (hash: string) => {
      if (unknown) return undefined;
      if (hash === last && failLast) throw Error('Synthetic unavailable read');
      return {
        status: 'committed',
        transaction: transactions.get(hash),
        blockNumber: 1n,
        blockHash: 'canonical',
      };
    },
    getHeaderByNumberNoCache: async (n: bigint) => ({
      hash: n === 1n ? 'canonical' : 'confirmation',
      timestamp: BigInt(deadline + 1000 + (changed ? 2000000 : 0)),
    }),
    getTipHeader: async () => ({ number: 30n, timestamp: BigInt(tipTimestamp) }),
    sendTransactionNoCache: async () => {
      throw Error('Synthetic rebroadcast interruption');
    },
  });
  const funding = new FiveFunding(store, client, 'ckt1test');
  await funding.reconcile(round.id);
  assert.equal(stored.sponsors.filter((s) => s.funding === 'confirmed').length, 5);
  await funding.settleAuction(round.id);
  assert.equal(stored.auction, undefined, 'Unread sixth bid must not be discarded after downtime');
  await funding.reconcile(round.id);
  await funding.settleAuction(round.id);
  assert.equal(stored.auction, undefined, 'RPC failure is not evidence of an unfunded bid');
  failLast = false;
  await funding.reconcile(round.id);
  await funding.settleAuction(round.id);
  assert.equal((await store.load(round.id))?.auction?.winnerWallet, 'wallet6');
  changed = true;
  await assert.rejects(
    () => funding.verifyConfirmed(round.id),
    /evidence changed/,
    'Reorg cannot retain stale deadline eligibility',
  );
  changed = false;
  stored = structuredClone(round);
  stored.sponsors = [structuredClone(round.sponsors[0])];
  unknown = true;
  tipTimestamp = auctionCutoff(round) - 1;
  await funding.reconcile(round.id);
  assert.equal(
    stored.sponsors[0].auctionCheckedAt,
    undefined,
    'Wall-clock grace cannot certify a lagging chain read',
  );
  tipTimestamp = auctionCutoff(round) + 60000;
  await funding.settleAuction(round.id);
  assert.equal(stored.auction, undefined, 'Later tip cannot certify the earlier status read');
  unknown = false;
  await funding.reconcile(round.id);
  await funding.settleAuction(round.id);
  assert.equal(
    (await store.load(round.id))?.auction?.winnerWallet,
    'wallet1',
    'Catch-up preserves the now-observed eligible bid',
  );
  stored = structuredClone(round);
  stored.sponsors = [structuredClone(round.sponsors[0])];
  unknown = true;
  await funding.reconcile(round.id);
  assert.ok(
    stored.sponsors[0].auctionCheckedAt,
    'Successful cutoff read survives later rebroadcast failure',
  );
  await funding.settleAuction(round.id);
  assert.equal((await store.load(round.id))?.auction?.amountShannons, '0');
  const unpaid: Round = structuredClone(round);
  unpaid.sponsors = [{ ...bid('unsigned', 'unpaid', 100, 1), funding: 'awaiting' }];
  unpaid.state = 'cancelled';
  assert.equal(auctionView(unpaid, 'unpaid', auctionCutoff(unpaid))?.ownStatus, 'none');
  console.log(
    'Five auction recovery: bounded catch-up, unread/RPC-failed bids, reorg evidence and unpaid intent display passed.',
  );
}
void recovery().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

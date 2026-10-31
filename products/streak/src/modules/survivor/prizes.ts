import { ccc } from '@ckb-ccc/core';
import { FiveFunding } from '../five/funding';
import { FiveRewards } from '../five/rewards';
import type { Round } from '../five/domain';
import type { FiveStorage } from '../five/storage';
import { cancel, lockTime, SurvivorError, type Competition } from './domain';
import type { SurvivorStorage } from './storage';
import type { Actor } from './service';

// A dot is not a legal Five round identifier, so credit namespaces cannot collide.
export const prizeKey = (id: string) => `survivor.${id}`;
const competitionId = (key: string) => {
  if (!/^survivor\.[a-zA-Z0-9_-]{1,100}$/.test(key)) throw Error('Invalid Survivor prize key');
  return key.slice(9);
};

/** Payment-only projection into the existing contribution/reward engine.
 * No Five competition, squad or score is created. Survivor remains the state owner.
 */
export function prizeRound(c: Competition): Round {
  const entries = c.entries.filter((e) => e.status === 'winner');
  const prize = BigInt(c.terms.prizeShannons);
  const share = entries.length ? prize / BigInt(entries.length) : 0n;
  const rewards: Record<string, string> = {};
  const recipients = entries.map((e) => {
    if (!e.wallet) throw Error('Survivor prize recipient has no bound wallet');
    rewards[e.publicId] = share.toString();
    return {
      accountId: e.accountId,
      publicId: e.publicId,
      wallet: e.wallet,
      name: e.name,
      players: [],
      captain: '',
      savedAt: e.joinedAt,
    };
  });
  const remainder = entries.length ? prize - share * BigInt(entries.length) : 0n;
  if (remainder > 0n) {
    recipients.push({
      accountId: c.creator,
      publicId: 'creator-remainder',
      wallet: c.creatorWallet!,
      name: '',
      players: [],
      captain: '',
      savedAt: c.createdAt,
    });
    rewards['creator-remainder'] = remainder.toString();
  }
  return {
    id: prizeKey(c.id),
    creator: c.creator,
    createdAt: c.createdAt,
    state:
      c.state === 'complete'
        ? 'final'
        : c.state === 'cancelled'
          ? 'cancelled'
          : c.state === 'draft'
            ? 'open'
            : 'draft',
    terms: {
      name: c.terms.name,
      lockAt: new Date(lockTime(c.rounds[0])).toISOString(),
      finalizeAfter: c.rounds.at(-1)!.resolveAt,
      limit: c.terms.limit,
      qualifyingBps: 10000,
      sponsorship: c.state === 'draft',
      minimumShannons: c.terms.prizeShannons,
      source: 'Survivor creator prize',
      players: [],
    },
    termsHash: c.termsHash,
    revision: c.fundingRevision ?? 0,
    sponsors: c.prizeFunding ? [structuredClone(c.prizeFunding)] : [],
    entries: recipients,
    scores: {},
    scoreSource: '',
    scoresAt: null,
    scoresComplete: false,
    scoreRevision: 0,
    rewards,
    finalizedAt: null,
    rulesVersion: 1,
    rawStats: {},
  };
}

export class SurvivorPrizeStore implements FiveStorage {
  constructor(readonly source: SurvivorStorage) {}
  async clock() {
    return Date.now();
  }
  async list() {
    const rows = await this.source.list();
    return rows.map((c) => ({
      id: prizeKey(c.id),
      state: 'draft' as const,
      name: c.terms.name,
      createdAt: c.createdAt,
      lockAt: '',
    }));
  }
  async load(key: string) {
    const c = await this.source.load(competitionId(key));
    return c?.fundingPolicy ? prizeRound(c) : null;
  }
  async create(): Promise<Round> {
    throw Error('Create Survivor competitions through Survivor');
  }
  async change(
    key: string,
    mutate: (r: Round, now: number) => void,
    reservation?: { intent: string; outpoints: string[] },
  ) {
    const c = await this.source.change(
      competitionId(key),
      (c, now) => {
        if (!c.fundingPolicy)
          throw new SurvivorError('This competition has no creator-funded prize.', 409);
        const r = prizeRound(c);
        mutate(r, now);
        if (r.sponsors.length > 1) throw Error('Only the creator prize may fund Survivor');
        const s = r.sponsors[0];
        if (
          s &&
          (s.id !== c.fundingIntentId ||
            s.wallet !== c.creatorWallet ||
            s.accountId !== c.creator ||
            s.amountShannons !== c.terms.prizeShannons)
        )
          throw new SurvivorError(
            'The prize no longer matches the competition. Review again.',
            409,
          );
        c.prizeFunding = s;
        c.fundingRevision = (c.fundingRevision ?? 0) + 1;
      },
      reservation,
    );
    return prizeRound(c);
  }
}

export class SurvivorPrizes {
  readonly store: SurvivorPrizeStore;
  readonly funding: FiveFunding;
  constructor(
    readonly source: SurvivorStorage,
    readonly rewards: FiveRewards,
  ) {
    this.store = new SurvivorPrizeStore(source);
    this.funding = new FiveFunding(this.store, rewards.chain, rewards.address);
  }
  async prepare(actor: NonNullable<Actor>, id: string, accepted: unknown) {
    const c = await this.source.load(id);
    if (!c || c.creator !== actor.id || c.creatorWallet !== actor.wallet || !c.fundingPolicy)
      throw new SurvivorError('Only this competition creator can fund its prize.', 403);
    if (c.state !== 'draft' || BigInt(c.terms.prizeShannons) <= 0n)
      throw new SurvivorError('Choose a prize in a draft before funding.', 409);
    if (!(await this.rewards.active()))
      throw new SurvivorError(
        'Prize delivery is temporarily unavailable. Your draft is saved.',
        503,
      );
    const target = (await ccc.Address.fromString(this.rewards.address, this.rewards.chain)).script;
    const minimum =
      BigInt(ccc.CellOutput.from({ lock: target }, '0x' + '00'.repeat(32)).occupiedSize) *
      100_000_000n;
    if (BigInt(c.terms.prizeShannons) < minimum)
      throw new SurvivorError(
        `The prize must be at least ${minimum / 100_000_000n} tCKB to fund its wallet cell.`,
      );
    await this.funding.intent(actor, prizeKey(id), {
      sponsorId: c.fundingIntentId,
      amountShannons: c.terms.prizeShannons,
      display: 'anonymous',
      custodyAccepted: accepted,
    });
  }
  async submit(actor: NonNullable<Actor>, id: string, sponsorId: unknown, signedBytes: unknown) {
    await this.funding.submit(actor, prizeKey(id), { sponsorId, signedBytes });
  }
  async verify(id: string) {
    const c = await this.source.load(id);
    if (!c?.fundingPolicy || c.prizeFunding?.funding !== 'confirmed')
      throw new SurvivorError('Wait for the creator prize to confirm.', 409);
    await this.funding.verifyConfirmed(prizeKey(id));
  }
  async tick(id: string) {
    const initial = await this.source.load(id);
    if (!initial?.fundingPolicy || !initial.prizeFunding) return;
    await this.funding.reconcile(prizeKey(id));
    await this.source.change(id, (c, now) => {
      if (c.state === 'draft' && now >= lockTime(c.rounds[0]))
        cancel(
          c,
          now,
          'The draft was not published before its deadline. Funded prize returns to the creator.',
        );
    });
    const c = await this.source.load(id);
    if (
      !c ||
      !['complete', 'cancelled'].includes(c.state) ||
      c.prizeFunding?.funding !== 'confirmed'
    )
      return;
    await this.verify(id);
    await this.rewards.credit(prizeRound(c), true);
  }
}

import { isRecord, request } from '../../lib/http';
export type Player = {
  id: string;
  name: string;
  teamId: string;
  team: string;
  position: 'GK' | 'DEF' | 'MID' | 'FWD';
  cost: number;
  fixtureId: string;
};
export type Terms = {
  name: string;
  lockAt: string;
  finalizeAfter: string;
  limit: number;
  qualifyingBps: number;
  sponsorship: boolean;
  sponsorshipMode?: 'community' | 'auction';
  minimumShannons: string;
  source: string;
  players: Player[];
};
export type FiveRound = {
  id: string;
  state: string;
  terms: Terms;
  termsHash: string;
  revision: number;
  ownId: string | null;
  entries: { id: string; name: string; players?: string[]; captain?: string }[];
  standings: { id: string; name: string; points: number; pending: boolean }[];
  scores: Record<string, { points: number; lines: { label: string; points: number }[] }>;
  scoresAt: string | null;
  scoresComplete: boolean;
  scoreSource: string;
  scoreRevision: number;
  finalizedAt: string | null;
  rewards: Record<string, string>;
  poolShannons: string;
  auction?: {
    state: string;
    closesAt: string;
    confirmationCutoff: string;
    leadingShannons: string;
    bidderCount: number;
    ownShannons: string;
    ownStatus: string;
  } | null;
  sponsors: { id: string; name: string; amountShannons: string; logo: string; link: string }[];
  ownSponsorships: {
    id: string;
    amountShannons: string;
    funding: string;
    moderation: string;
    destination: string;
    tag: string;
    transactionHash: string;
    auctionOutcome?: string;
  }[];
  moderation?: { id: string; name: string; logo: string; link: string; moderation: string }[];
};
export type RewardAccount = {
  availableShannons: string;
  pendingShannons: string;
  paidShannons: string;
  minimumShannons: string;
  transactionHash: string;
  status: string;
};
export type FiveData = {
  automation?: { enabled: boolean; state: string; lastSyncedAt: string | null; message: string };
  rewardsAccount: RewardAccount | null;
  now: string;
  admin: boolean;
  viewerId: string | null;
  feedAvailable: boolean;
  fundingAvailable: boolean;
  rounds: { id: string; state: string; name: string; lockAt: string }[];
  detail: FiveRound | null;
};
const bad = (): never => {
  throw new Error('Five returned incomplete data. Please refresh.');
};
const obj = (v: unknown) => (isRecord(v) ? v : bad());
const str = (v: unknown, max = 1024) => (typeof v === 'string' && v.length <= max ? v : bad());
const bool = (v: unknown) => (typeof v === 'boolean' ? v : bad());
const num = (v: unknown) =>
  typeof v === 'number' && Number.isSafeInteger(v) && Math.abs(v) <= 1_000_000 ? v : bad();
const arr = (v: unknown, max = 1000): unknown[] =>
  Array.isArray(v) && v.length <= max ? v : bad();
const nil = (v: unknown) => (v === null ? null : str(v));
const amt = (v: unknown) => (/^(0|[1-9]\d{0,20})$/.test(str(v)) ? str(v) : bad());
export function parseFive(value: unknown): FiveData {
  const d = obj(value);
  let detail: FiveRound | null = null;
  if (d.detail !== null) {
    const r = obj(d.detail),
      t = obj(r.terms);
    const scores: FiveRound['scores'] = Object.create(null);
    for (const [id, raw] of Object.entries(obj(r.scores))) {
      const s = obj(raw);
      scores[id] = {
        points: num(s.points),
        lines: arr(s.lines, 20).map((v) => {
          const l = obj(v);
          return { label: str(l.label), points: num(l.points) };
        }),
      };
    }
    const rewards: Record<string, string> = Object.create(null);
    for (const [id, v] of Object.entries(obj(r.rewards))) rewards[id] = amt(v);
    detail = {
      id: str(r.id),
      state: str(r.state),
      termsHash: str(r.termsHash),
      revision: num(r.revision),
      ownId: nil(r.ownId),
      terms: {
        name: str(t.name),
        lockAt: str(t.lockAt),
        finalizeAfter: str(t.finalizeAfter),
        limit: num(t.limit),
        qualifyingBps: num(t.qualifyingBps),
        sponsorship: bool(t.sponsorship),
        ...(t.sponsorshipMode === undefined
          ? {}
          : {
              sponsorshipMode:
                t.sponsorshipMode === 'auction'
                  ? ('auction' as const)
                  : t.sponsorshipMode === 'community'
                    ? ('community' as const)
                    : bad(),
            }),
        minimumShannons: amt(t.minimumShannons),
        source: str(t.source),
        players: arr(t.players).map((v) => {
          const p = obj(v),
            position = str(p.position);
          if (!['GK', 'DEF', 'MID', 'FWD'].includes(position)) bad();
          return {
            id: str(p.id),
            name: str(p.name),
            teamId: str(p.teamId),
            team: str(p.team),
            position: position as Player['position'],
            cost: num(p.cost),
            fixtureId: str(p.fixtureId),
          };
        }),
      },
      entries: arr(r.entries).map((v) => {
        const e = obj(v);
        return {
          id: str(e.id),
          name: str(e.name),
          ...(e.players === undefined
            ? {}
            : { players: arr(e.players, 5).map((v) => str(v)), captain: str(e.captain) }),
        };
      }),
      standings: arr(r.standings).map((v) => {
        const s = obj(v);
        return {
          id: str(s.id),
          name: str(s.name),
          points: num(s.points),
          pending: bool(s.pending),
        };
      }),
      scores,
      scoresAt: nil(r.scoresAt),
      scoresComplete: bool(r.scoresComplete),
      scoreSource: str(r.scoreSource),
      scoreRevision: num(r.scoreRevision),
      finalizedAt: nil(r.finalizedAt),
      rewards,
      poolShannons: amt(r.poolShannons),
      auction:
        r.auction == null
          ? null
          : (() => {
              const a = obj(r.auction);
              return {
                state: str(a.state),
                closesAt: str(a.closesAt),
                confirmationCutoff: str(a.confirmationCutoff),
                leadingShannons: amt(a.leadingShannons),
                bidderCount: num(a.bidderCount),
                ownShannons: amt(a.ownShannons),
                ownStatus: str(a.ownStatus),
              };
            })(),
      sponsors: arr(r.sponsors).map((v) => {
        const s = obj(v);
        return {
          id: str(s.id),
          name: str(s.name),
          amountShannons: amt(s.amountShannons),
          logo: str(s.logo),
          link: str(s.link),
        };
      }),
      ownSponsorships: arr(r.ownSponsorships).map((v) => {
        const s = obj(v);
        return {
          id: str(s.id),
          amountShannons: amt(s.amountShannons),
          funding: str(s.funding),
          moderation: str(s.moderation),
          destination: str(s.destination),
          tag: str(s.tag),
          transactionHash: str(s.transactionHash),
          auctionOutcome: s.auctionOutcome === undefined ? '' : str(s.auctionOutcome),
        };
      }),
      ...(r.moderation === undefined
        ? {}
        : {
            moderation: arr(r.moderation).map((v) => {
              const s = obj(v);
              return {
                id: str(s.id),
                name: str(s.name),
                logo: str(s.logo),
                link: str(s.link),
                moderation: str(s.moderation),
              };
            }),
          }),
    };
  }
  const reward = d.rewardsAccount == null ? null : obj(d.rewardsAccount);
  return {
    ...(d.automation === undefined
      ? {}
      : {
          automation: {
            enabled: bool(obj(d.automation).enabled),
            state: str(obj(d.automation).state),
            lastSyncedAt: nil(obj(d.automation).lastSyncedAt),
            message: str(obj(d.automation).message),
          },
        }),
    rewardsAccount: reward
      ? {
          availableShannons: amt(reward.availableShannons),
          pendingShannons: amt(reward.pendingShannons),
          paidShannons: amt(reward.paidShannons),
          minimumShannons: amt(reward.minimumShannons),
          transactionHash: str(reward.transactionHash),
          status: str(reward.status),
        }
      : null,
    now: str(d.now),
    admin: bool(d.admin),
    viewerId: nil(d.viewerId),
    feedAvailable: bool(d.feedAvailable),
    fundingAvailable: bool(d.fundingAvailable),
    rounds: arr(d.rounds, 100).map((v) => {
      const r = obj(v);
      return { id: str(r.id), state: str(r.state), name: str(r.name), lockAt: str(r.lockAt) };
    }),
    detail,
  };
}
export const loadFive = async (id: string, signal: AbortSignal) =>
  parseFive(await request(`/five${id ? `?round=${encodeURIComponent(id)}` : ''}`, signal));
export const actFive = async (body: Record<string, unknown>) =>
  parseFive(await request('/five', undefined, body));
export function shannons(input: string): string {
  if (!/^(0|[1-9]\d{0,8})(\.\d{1,8})?$/.test(input))
    throw new Error('Enter a valid tCKB amount with up to 8 decimal places.');
  const [whole, fraction = ''] = input.split('.');
  return (BigInt(whole) * 100_000_000n + BigInt(fraction.padEnd(8, '0'))).toString();
}
export function money(value: string): string {
  const n = BigInt(value),
    fraction = (n % 100_000_000n).toString().padStart(8, '0').replace(/0+$/, '');
  return `${(n / 100_000_000n).toLocaleString('en')}${fraction ? '.' + fraction : ''}`;
}

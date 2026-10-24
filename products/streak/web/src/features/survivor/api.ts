import { isRecord, request } from '../../lib/http';

export type Team = { id: string; name: string; code: string; logo?: string };
export type Fixture = { id: string; kickoff: string; home: Team; away: Team };
export type Slate = {
  key: string;
  label: string;
  lockAt: string;
  resolveAt: string;
  fixtures: Fixture[];
};
export type Terms = {
  name: string;
  mode: 'free' | 'paid';
  feeShannons: string;
  prizeShannons: string;
  limit: number;
};
type Pick = { teamId: string; fixtureId: string; savedAt: string; result?: string };
export type Entry = {
  id: string;
  name: string;
  status: string;
  used: string[];
  picks: Record<string, Pick>;
  missedRound?: number;
};
export type Competition = {
  id: string;
  terms: Terms;
  state: string;
  termsHash: string;
  reason?: string;
  currentRound: number;
  ownId: string | null;
  rounds: (Slate & {
    state: string;
    voidFixtures: string[];
    results: Record<string, { outcome: string; home: number; away: number }>;
  })[];
  entries: Entry[];
};
export type SurvivorData = {
  now: string;
  viewerId: string | null;
  admin: boolean;
  slates: Slate[];
  competitions: { id: string; state: string; terms: Terms }[];
  detail: Competition | null;
};
const bad = (): never => {
  throw new Error('Survivor returned incomplete data. Please refresh.');
};
const obj = (v: unknown) => (isRecord(v) ? v : bad());
const str = (v: unknown, max = 160) => (typeof v === 'string' && v.length <= max ? v : bad());
const num = (v: unknown, max = 256) =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max ? v : bad();
const arr = (v: unknown, max: number) =>
  Array.isArray(v) && v.length <= max ? (v as unknown[]) : bad();
const choice = (v: unknown, options: string[]) => (options.includes(str(v)) ? str(v) : bad());
const date = (v: unknown) => {
  const s = str(v);
  return Number.isFinite(Date.parse(s)) ? s : bad();
};
const amount = (v: unknown) => {
  const s = str(v, 16);
  return /^(0|[1-9]\d*)$/.test(s) ? s : bad();
};
function terms(value: unknown): Terms {
  const t = obj(value);
  return {
    name: str(t.name, 64),
    mode: choice(t.mode, ['free', 'paid']) as Terms['mode'],
    feeShannons: amount(t.feeShannons),
    prizeShannons: amount(t.prizeShannons),
    limit: num(t.limit),
  };
}
function team(value: unknown): Team {
  const t = obj(value),
    logo = t.logo === undefined ? undefined : str(t.logo, 2048);
  return {
    id: str(t.id),
    name: str(t.name),
    code: str(t.code),
    ...(logo?.startsWith('https://') ? { logo } : {}),
  };
}
function slate(value: unknown): Slate {
  const s = obj(value);
  return {
    key: str(s.key),
    label: str(s.label),
    lockAt: date(s.lockAt),
    resolveAt: date(s.resolveAt),
    fixtures: arr(s.fixtures, 10).map((v) => {
      const f = obj(v);
      return { id: str(f.id), kickoff: date(f.kickoff), home: team(f.home), away: team(f.away) };
    }),
  };
}
function detail(value: unknown): Competition {
  const c = obj(value);
  const rounds = arr(c.rounds, 10).map((value) => {
    const r = obj(value),
      results: Competition['rounds'][number]['results'] = {};
    for (const [id, value] of Object.entries(obj(r.results))) {
      const result = obj(value);
      results[id] = {
        outcome: choice(result.outcome, ['home', 'draw', 'away']),
        home: num(result.home, 100),
        away: num(result.away, 100),
      };
    }
    return {
      ...slate(r),
      state: choice(r.state, ['scheduled', 'locked', 'final']),
      voidFixtures: arr(r.voidFixtures, 10).map((v) => str(v)),
      results,
    };
  });
  const entries = arr(c.entries, 256).map((value) => {
    const e = obj(value),
      picks: Record<string, Pick> = {};
    for (const [index, value] of Object.entries(obj(e.picks))) {
      if (!/^\d$/.test(index)) bad();
      const p = obj(value);
      picks[index] = {
        teamId: str(p.teamId),
        fixtureId: str(p.fixtureId),
        savedAt: date(p.savedAt),
        ...(p.result === undefined
          ? {}
          : { result: choice(p.result, ['won', 'lost', 'void', 'rescued']) }),
      };
    }
    return {
      id: str(e.id),
      name: str(e.name, 40),
      status: choice(e.status, ['active', 'out', 'winner']),
      used: arr(e.used, 10).map((v) => str(v)),
      picks,
      ...(e.missedRound === undefined ? {} : { missedRound: num(e.missedRound, 9) }),
    };
  });
  const currentRound = num(c.currentRound, 9);
  if (!rounds[currentRound]) bad();
  return {
    id: str(c.id),
    terms: terms(c.terms),
    termsHash: str(c.termsHash),
    state: choice(c.state, ['draft', 'open', 'running', 'complete', 'cancelled']),
    currentRound,
    rounds,
    entries,
    ownId: c.ownId === null ? null : str(c.ownId),
    ...(c.reason === undefined ? {} : { reason: str(c.reason) }),
  };
}
export function parseSurvivor(value: unknown): SurvivorData {
  const data = obj(value);
  if (typeof data.admin !== 'boolean') bad();
  return {
    now: date(data.now),
    viewerId: data.viewerId === null ? null : str(data.viewerId),
    admin: data.admin as boolean,
    slates: arr(data.slates, 10).map(slate),
    competitions: arr(data.competitions, 100).map((value) => {
      const c = obj(value);
      return {
        id: str(c.id),
        state: choice(c.state, ['draft', 'open', 'running', 'complete', 'cancelled']),
        terms: terms(c.terms),
      };
    }),
    detail: data.detail === null ? null : detail(data.detail),
  };
}
export const loadSurvivor = async (id: string, signal: AbortSignal) =>
  parseSurvivor(
    await request(`/survivor${id ? `?competition=${encodeURIComponent(id)}` : ''}`, signal),
  );
export const actSurvivor = async (body: unknown) =>
  parseSurvivor(await request('/survivor', undefined, body));
export const money = (shannons: string) => {
  const value = BigInt(shannons),
    decimals = (value % 100000000n).toString().padStart(8, '0').replace(/0+$/, '');
  return `${(value / 100000000n).toLocaleString()}${decimals ? `.${decimals}` : ''} tCKB`;
};
export const decimalAmount = (shannons: string) => {
  const value = BigInt(shannons);
  return `${value / 100000000n}.${(value % 100000000n).toString().padStart(8, '0')}`;
};
export function toShannons(value: string) {
  if (!/^\d{1,8}(\.\d{1,8})?$/.test(value))
    throw Error('Use a positive amount with at most eight decimal places.');
  const [whole, fraction = ''] = value.split('.');
  return (BigInt(whole) * 100000000n + BigInt(fraction.padEnd(8, '0'))).toString();
}

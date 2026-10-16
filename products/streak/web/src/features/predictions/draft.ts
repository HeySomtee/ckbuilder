export type Outcome = 'home' | 'draw' | 'away';
export interface Pick {
  lineId: string;
  marketId: string;
  matchId: string;
  outcome: Outcome;
  amountCkb: string;
}
export interface Draft {
  v: 1;
  revision: string;
  picks: Pick[];
}
export interface DraftState {
  draft: Draft;
  warning: string | null;
  blocked: boolean;
  conflict: boolean;
  saved: boolean;
}
interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export const DRAFT_KEY = 'streak.predictionDraft.v1';
const empty = (): Draft => ({ v: 1, revision: crypto.randomUUID(), picks: [] });
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const identifier = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9:_-]{1,120}$/.test(value);
export function parseDraft(raw: string | null): Draft {
  if (raw === null) return empty();
  if (raw.length > 20_000) throw Error('Saved slip is too large.');
  const data: unknown = JSON.parse(raw);
  if (
    !record(data) ||
    data.v !== 1 ||
    !identifier(data.revision) ||
    !Array.isArray(data.picks) ||
    data.picks.length > 8
  )
    throw Error('Saved slip is invalid.');
  const picks = data.picks.map((pick): Pick => {
    if (
      !record(pick) ||
      !identifier(pick.lineId) ||
      !identifier(pick.marketId) ||
      !identifier(pick.matchId) ||
      (pick.outcome !== 'home' && pick.outcome !== 'draw' && pick.outcome !== 'away') ||
      typeof pick.amountCkb !== 'string' ||
      pick.amountCkb.length > 32
    )
      throw Error('Saved prediction is invalid.');
    return {
      lineId: pick.lineId,
      marketId: pick.marketId,
      matchId: pick.matchId,
      outcome: pick.outcome,
      amountCkb: pick.amountCkb,
    };
  });
  if (
    new Set(picks.map((pick) => pick.lineId)).size !== picks.length ||
    new Set(picks.map((pick) => pick.matchId)).size !== picks.length
  )
    throw Error('Saved slip contains duplicate predictions.');
  return { v: 1, revision: data.revision, picks };
}
export function amountShannons(value: string): bigint | null {
  if (value.length > 32 || !/^(0|[1-9]\d*)(\.\d{1,8})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100_000_000n + BigInt(fraction.padEnd(8, '0'));
}
export function totalShannons(picks: Pick[]): bigint | null {
  let total = 0n;
  for (const pick of picks) {
    const amount = amountShannons(pick.amountCkb);
    if (amount === null) return null;
    total += amount;
  }
  return total;
}
export function displayShannons(value: bigint | string): string {
  const amount = BigInt(value);
  const fraction = (amount % 100_000_000n).toString().padStart(8, '0').replace(/0+$/, '');
  return `${(amount / 100_000_000n).toLocaleString('en-GB')}${fraction ? `.${fraction}` : ''}`;
}

export class DraftStore {
  private listeners = new Set<() => void>();
  private observed: string | null = null;
  private state: DraftState = {
    draft: empty(),
    warning: null,
    blocked: false,
    conflict: false,
    saved: false,
  };
  private storage: StoragePort | null;
  constructor(storage: StoragePort | null) {
    this.storage = storage;
    if (!storage) {
      this.state.warning = 'Storage is unavailable. This slip will only stay in this tab.';
      return;
    }
    try {
      this.observed = storage.getItem(DRAFT_KEY);
    } catch {
      this.storage = null;
      this.state.warning = 'Storage is unavailable. This slip will only stay in this tab.';
      return;
    }
    this.restore(this.observed);
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit() {
    for (const listener of this.listeners) listener();
  }
  private restore(raw: string | null) {
    try {
      this.state = {
        draft: parseDraft(raw),
        warning: null,
        blocked: false,
        conflict: false,
        saved: raw !== null,
      };
    } catch {
      this.state = {
        ...this.state,
        blocked: true,
        conflict: false,
        saved: false,
        warning:
          'The saved slip could not be restored. It has not been overwritten. Start a new slip to discard it.',
      };
    }
  }
  externalChange = () => {
    if (!this.storage) return;
    try {
      if (this.storage.getItem(DRAFT_KEY) !== this.observed) {
        this.state = {
          ...this.state,
          conflict: true,
          saved: false,
          warning: 'Another tab changed this slip. Choose which version to keep.',
        };
        this.emit();
      }
    } catch {
      this.storage = null;
      this.state = {
        ...this.state,
        conflict: false,
        saved: false,
        warning: 'Storage is unavailable. Your picks remain editable in this tab; keep it open.',
      };
      this.emit();
    }
  };
  private write(draft: Draft, explicit = false): boolean {
    if (!explicit) {
      this.externalChange();
      if (this.state.blocked || this.state.conflict) return false;
    }
    let warning: string | null = null;
    let saved = false;
    const raw = JSON.stringify(draft);
    try {
      if (!this.storage) throw Error('Storage unavailable');
      this.storage.setItem(DRAFT_KEY, raw);
      this.observed = raw;
      saved = true;
    } catch {
      warning = 'This slip could not be saved. Your picks remain in this tab; keep it open.';
    }
    this.state = { draft, warning, saved, blocked: false, conflict: false };
    this.emit();
    return true;
  }
  select(marketId: string, matchId: string, outcome: Outcome): boolean {
    const existing = this.state.draft.picks.find((pick) => pick.matchId === matchId);
    if (!existing && this.state.draft.picks.length >= 8) {
      this.state = {
        ...this.state,
        warning: 'Your slip can hold up to eight predictions. Remove one before adding another.',
      };
      this.emit();
      return false;
    }
    const pick = {
      lineId: existing?.lineId ?? crypto.randomUUID(),
      marketId,
      matchId,
      outcome,
      amountCkb: existing?.amountCkb ?? '100',
    };
    return this.write({
      v: 1,
      revision: crypto.randomUUID(),
      picks: existing
        ? this.state.draft.picks.map((row) => (row.lineId === existing.lineId ? pick : row))
        : [...this.state.draft.picks, pick],
    });
  }
  amount(lineId: string, amountCkb: string) {
    if (amountCkb.length > 32) return;
    this.write({
      ...this.state.draft,
      revision: crypto.randomUUID(),
      picks: this.state.draft.picks.map((pick) =>
        pick.lineId === lineId ? { ...pick, amountCkb } : pick,
      ),
    });
  }
  remove(lineId: string) {
    this.write({
      ...this.state.draft,
      revision: crypto.randomUUID(),
      picks: this.state.draft.picks.filter((pick) => pick.lineId !== lineId),
    });
  }
  /** A submitted snapshot cannot erase edits or picks made while a wallet was open. */
  retireSubmitted(submitted: readonly Pick[]): boolean {
    const same = (a: Pick, b: Pick) =>
      a.lineId === b.lineId &&
      a.marketId === b.marketId &&
      a.matchId === b.matchId &&
      a.outcome === b.outcome &&
      a.amountCkb === b.amountCkb;
    if (!this.state.draft.picks.some((pick) => submitted.some((row) => same(pick, row))))
      return true;
    return this.write({
      ...this.state.draft,
      revision: crypto.randomUUID(),
      picks: this.state.draft.picks.filter((pick) => !submitted.some((row) => same(pick, row))),
    });
  }
  clear() {
    this.write(empty(), true);
  }
  keepThisTab() {
    this.write({ ...this.state.draft, revision: crypto.randomUUID() }, true);
  }
  loadOtherTab() {
    try {
      if (!this.storage) throw Error('Storage unavailable');
      this.observed = this.storage.getItem(DRAFT_KEY);
      this.restore(this.observed);
    } catch {
      this.state = {
        ...this.state,
        saved: false,
        warning: 'The other slip could not be loaded. Try again.',
      };
    }
    this.emit();
  }
}
export function createDraftStore() {
  try {
    return new DraftStore(window.localStorage);
  } catch {
    return new DraftStore(null);
  }
}

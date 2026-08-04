/**
 * Streak Terminal — crews (the social layer over settlements).
 *
 * A crew is a small named group joined by invite code. On top of it we build:
 *   - Head-to-head streaks: crew-mates ranked by their live streak.
 *   - Co-picks: matches two or more crew-mates backed with a streak pick today.
 *   - Revive rebate: when you revive a failed streak, every crew-mate who made
 *     a streak pick on the *same match* earns you a rebate credited to escrow.
 *
 * Everything here reads the same bets/markets/matches the rest of the engine
 * uses, so a crew is a lens over existing settlement data — no parallel ledger.
 */

import { randomBytes, randomUUID } from "crypto";

import {
  CREW_MAX_MEMBERS,
  CREW_MAX_PER_USER,
  CREW_NAME_MAX,
  CREW_NAME_MIN,
  CREW_REVIVE_REBATE_CAP_CKB,
  CREW_REVIVE_REBATE_CKB,
} from "./config";
import { abbrevAddress, ckbToShannons, shannonsToCkb } from "./chain";
import { matchLabel } from "./matches";
import { read, update } from "./store";
import { winRate } from "./markets";
import { asBig } from "./wallet";
import type { Bet, Crew, Outcome, StreakDB, User } from "./types";

export class CrewError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

// ── View models ──────────────────────────────────────────────────────────────

export interface CrewMemberView {
  userId: string;
  username: string;
  current: number;
  best: number;
  status: "active" | "failed";
  winRate: number;
  netPnlCkb: string;
  /** This member's streak pick locked today, if any. */
  todayPick: { matchId: string; matchLabel: string; outcome: Outcome } | null;
  isMe: boolean;
  isOwner: boolean;
}

export interface CrewCoPick {
  matchId: string;
  matchLabel: string;
  /** Members (usernames) who picked this match today. */
  members: string[];
  /** Outcome if every co-picker backed the same side, else undefined. */
  outcome?: Outcome;
}

export interface CrewFeedItem {
  user: string;
  kind: "pick" | "win" | "loss";
  matchLabel: string;
  outcome: Outcome;
  at: string;
}

export interface CrewReviveHint {
  eligible: boolean;
  rebateCkb: string;
  coPickers: string[];
  matchLabel?: string;
}

export interface CrewView {
  id: string;
  name: string;
  inviteCode: string;
  ownerId: string;
  memberCount: number;
  isOwner: boolean;
  members: CrewMemberView[];
  coPicks: CrewCoPick[];
  feed: CrewFeedItem[];
  /** Present when the viewing user has a failed streak they could revive. */
  reviveHint?: CrewReviveHint;
}

// ── Pure helpers (operate on a loaded db) ────────────────────────────────────

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function labelFor(db: StreakDB, matchId: string): string {
  const match = db.matches.find((m) => m.id === matchId);
  return match ? matchLabel(match) : matchId;
}

/** The user's streak-pick bet locked today (most recent), if any. */
function todayStreakPick(db: StreakDB, userId: string): Bet | undefined {
  const today = todayKey();
  return db.bets
    .filter((b) => b.userId === userId && b.isStreakPick && b.placedAt.slice(0, 10) === today)
    .sort((a, b) => b.placedAt.localeCompare(a.placedAt))[0];
}

/** Crews the user belongs to. */
function crewsOf(db: StreakDB, userId: string): Crew[] {
  return db.crews.filter((c) => c.memberIds.includes(userId));
}

/**
 * Revive rebate for a user with a failed streak: count distinct crew-mates who
 * made a streak pick on the *same match* the failed pick was on. Pure — safe to
 * call inside an update() mutator.
 */
export function reviveRebate(
  db: StreakDB,
  userId: string,
): { rebateShannons: bigint; coPickers: string[]; matchId?: string; matchLabel?: string } {
  const user = db.users.find((u) => u.id === userId);
  if (!user || user.streak.status !== "failed" || !user.streak.failedBetId) {
    return { rebateShannons: 0n, coPickers: [] };
  }
  const failedBet = db.bets.find((b) => b.id === user.streak.failedBetId);
  if (!failedBet) return { rebateShannons: 0n, coPickers: [] };
  const matchId = failedBet.matchId;

  // Distinct crew-mates across all my crews.
  const mateIds = new Set<string>();
  for (const crew of crewsOf(db, userId)) {
    for (const id of crew.memberIds) if (id !== userId) mateIds.add(id);
  }

  const coPickers: string[] = [];
  for (const mateId of mateIds) {
    const picked = db.bets.some(
      (b) => b.userId === mateId && b.isStreakPick && b.matchId === matchId,
    );
    if (picked) {
      const mate = db.users.find((u) => u.id === mateId);
      if (mate) coPickers.push(mate.username ?? abbrevAddress(mate.wallet.address));
    }
  }

  const rebateCkb = Math.min(
    coPickers.length * CREW_REVIVE_REBATE_CKB,
    CREW_REVIVE_REBATE_CAP_CKB,
  );
  return {
    rebateShannons: rebateCkb > 0 ? ckbToShannons(rebateCkb) : 0n,
    coPickers: coPickers.sort(),
    matchId,
    matchLabel: labelFor(db, matchId),
  };
}

/** Build the full view for one crew from the viewer's perspective. */
function buildCrewView(db: StreakDB, crew: Crew, meId: string): CrewView {
  const userById = new Map(db.users.map((u) => [u.id, u]));

  const members: CrewMemberView[] = crew.memberIds
    .map((id) => userById.get(id))
    .filter((u): u is User => !!u)
    .map((u) => {
      const pick = todayStreakPick(db, u.id);
      return {
        userId: u.id,
        username: u.username ?? abbrevAddress(u.wallet.address),
        current: u.streak.current,
        best: u.streak.best,
        status: u.streak.status,
        winRate: winRate(u),
        netPnlCkb: shannonsToCkb(asBig(u.stats.netPnlShannons)),
        todayPick: pick
          ? { matchId: pick.matchId, matchLabel: labelFor(db, pick.matchId), outcome: pick.outcome }
          : null,
        isMe: u.id === meId,
        isOwner: u.id === crew.ownerId,
      };
    })
    .sort((a, b) => b.current - a.current || b.best - a.best || Number(b.netPnlCkb) - Number(a.netPnlCkb));

  // Co-picks: group today's streak picks by match; keep matches with ≥2 members.
  const byMatch = new Map<string, { members: string[]; outcomes: Set<Outcome> }>();
  for (const m of members) {
    if (!m.todayPick) continue;
    const entry = byMatch.get(m.todayPick.matchId) ?? { members: [], outcomes: new Set() };
    entry.members.push(m.username);
    entry.outcomes.add(m.todayPick.outcome);
    byMatch.set(m.todayPick.matchId, entry);
  }
  const coPicks: CrewCoPick[] = [...byMatch.entries()]
    .filter(([, v]) => v.members.length >= 2)
    .map(([matchId, v]) => ({
      matchId,
      matchLabel: labelFor(db, matchId),
      members: v.members.sort(),
      outcome: v.outcomes.size === 1 ? [...v.outcomes][0] : undefined,
    }));

  // Feed: recent streak-pick activity among members.
  const memberIdSet = new Set(crew.memberIds);
  const feed: CrewFeedItem[] = db.bets
    .filter((b) => b.isStreakPick && memberIdSet.has(b.userId))
    .sort((a, b) => b.placedAt.localeCompare(a.placedAt))
    .slice(0, 20)
    .map((b) => {
      const kind: CrewFeedItem["kind"] = !b.settled
        ? "pick"
        : b.payout && asBig(b.payout) > asBig(b.amount)
          ? "win"
          : "loss";
      return {
        user: userById.get(b.userId)?.username ?? "—",
        kind,
        matchLabel: labelFor(db, b.matchId),
        outcome: b.outcome,
        at: b.placedAt,
      };
    });

  const me = userById.get(meId);
  let reviveHint: CrewReviveHint | undefined;
  if (me && me.streak.status === "failed") {
    const r = reviveRebate(db, meId);
    reviveHint = {
      eligible: r.rebateShannons > 0n,
      rebateCkb: shannonsToCkb(r.rebateShannons),
      coPickers: r.coPickers,
      matchLabel: r.matchLabel,
    };
  }

  return {
    id: crew.id,
    name: crew.name,
    inviteCode: crew.inviteCode,
    ownerId: crew.ownerId,
    memberCount: crew.memberIds.length,
    isOwner: crew.ownerId === meId,
    members,
    coPicks,
    feed,
    reviveHint,
  };
}

// ── Validation ───────────────────────────────────────────────────────────────

function cleanName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (name.length < CREW_NAME_MIN || name.length > CREW_NAME_MAX) {
    throw new CrewError(
      "bad_name",
      `Crew name must be ${CREW_NAME_MIN}–${CREW_NAME_MAX} characters.`,
    );
  }
  return name;
}

/** 6-char uppercase invite code (no ambiguous chars). */
function newInviteCode(existing: Set<string>): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 50; attempt++) {
    const bytes = randomBytes(6);
    let code = "";
    for (let i = 0; i < 6; i++) code += alphabet[bytes[i] % alphabet.length];
    if (!existing.has(code)) return code;
  }
  // Astronomically unlikely fallback.
  return randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
}

// ── Commands ─────────────────────────────────────────────────────────────────

export async function createCrew(userId: string, rawName: string): Promise<CrewView> {
  const name = cleanName(rawName);
  return update((db) => {
    const user = db.users.find((u) => u.id === userId);
    if (!user) throw new CrewError("no_user", "User not found.");
    if (crewsOf(db, userId).length >= CREW_MAX_PER_USER) {
      throw new CrewError("too_many", `You can be in at most ${CREW_MAX_PER_USER} crews.`);
    }
    const codes = new Set(db.crews.map((c) => c.inviteCode));
    const crew: Crew = {
      id: randomUUID(),
      name,
      ownerId: userId,
      inviteCode: newInviteCode(codes),
      memberIds: [userId],
      createdAt: new Date().toISOString(),
    };
    db.crews.push(crew);
    return buildCrewView(db, crew, userId);
  });
}

export async function joinCrew(userId: string, rawCode: string): Promise<CrewView> {
  const code = typeof rawCode === "string" ? rawCode.trim().toUpperCase() : "";
  if (!code) throw new CrewError("bad_code", "Enter an invite code.");
  return update((db) => {
    const user = db.users.find((u) => u.id === userId);
    if (!user) throw new CrewError("no_user", "User not found.");
    const crew = db.crews.find((c) => c.inviteCode === code);
    if (!crew) throw new CrewError("not_found", "No crew with that invite code.");
    if (crew.memberIds.includes(userId)) return buildCrewView(db, crew, userId);
    if (crew.memberIds.length >= CREW_MAX_MEMBERS) {
      throw new CrewError("full", `That crew is full (${CREW_MAX_MEMBERS} members).`);
    }
    if (crewsOf(db, userId).length >= CREW_MAX_PER_USER) {
      throw new CrewError("too_many", `You can be in at most ${CREW_MAX_PER_USER} crews.`);
    }
    crew.memberIds.push(userId);
    return buildCrewView(db, crew, userId);
  });
}

export async function leaveCrew(userId: string, crewId: string): Promise<void> {
  await update((db) => {
    const crew = db.crews.find((c) => c.id === crewId);
    if (!crew) throw new CrewError("not_found", "Crew not found.");
    if (!crew.memberIds.includes(userId)) {
      throw new CrewError("not_member", "You're not in that crew.");
    }
    crew.memberIds = crew.memberIds.filter((id) => id !== userId);
    if (crew.memberIds.length === 0) {
      db.crews = db.crews.filter((c) => c.id !== crewId);
      return;
    }
    // Hand ownership to the next remaining member if the owner left.
    if (crew.ownerId === userId) crew.ownerId = crew.memberIds[0];
  });
}

// ── Queries ──────────────────────────────────────────────────────────────────

export async function listCrews(userId: string): Promise<CrewView[]> {
  return read((db) =>
    crewsOf(db, userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((c) => buildCrewView(db, c, userId)),
  );
}

/** Compact revive hint for the dashboard/streak flow (no crew context needed). */
export async function reviveHint(userId: string): Promise<CrewReviveHint> {
  return read((db) => {
    const user = db.users.find((u) => u.id === userId);
    if (!user || user.streak.status !== "failed") {
      return { eligible: false, rebateCkb: "0", coPickers: [] };
    }
    const r = reviveRebate(db, userId);
    return {
      eligible: r.rebateShannons > 0n,
      rebateCkb: shannonsToCkb(r.rebateShannons),
      coPickers: r.coPickers,
      matchLabel: r.matchLabel,
    };
  });
}

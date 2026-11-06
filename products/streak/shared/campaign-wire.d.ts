/** Public campaign transport. Chain evidence, wallet links and private squads stay server-side. */
export type CampaignKind = 'predictions' | 'five';
export type CampaignPredictionEntryPolicy = 'after-registration-v1' | 'first-admitted-v2';
export type CampaignState = 'draft' | 'open' | 'live' | 'finalizing' | 'finished' | 'deleted';
export interface CampaignPrize {
  place: number;
  amountShannons: string;
  /** Display reference only. Exact CKB amount above is the published obligation. */
  usdReference: string;
}
export interface CampaignDraftInput {
  name: string;
  description: string;
  kind: CampaignKind;
  registrationClosesAt: string;
  fiveRoundId: string | null;
  fixtureIds: string[];
  prizes: CampaignPrize[];
  rehearsal: boolean;
}
export interface CampaignFixture {
  fixtureId: string;
  marketId: string;
  /** Immutable canonical market identity, not a current shard outpoint. */
  marketKey: string;
  home: string;
  away: string;
  homeLogo?: string | null;
  awayLogo?: string | null;
  /** Recent league form in provider order. Missing history stays absent. */
  homeForm?: string | null;
  awayForm?: string | null;
  formFetchedAt?: string | null;
  league: string;
  kickoffAt: string;
  cutoffAt: string;
  capacity: number;
  occupied: number | null;
  updatedAt: string | null;
}
export interface CampaignGameweek {
  id: string;
  name: string;
  lockAt: string;
  state: string;
  /** Official FPL event to prepare; absent for an already open round. */
  event?: number;
}
export interface CampaignOptions {
  fixtures: CampaignFixture[];
  gameweeks: CampaignGameweek[];
}
export interface CampaignStanding {
  publicId: string;
  name: string;
  rank: number;
  points: number;
  participated: boolean;
  qualifyingEntries: number;
  tieBreakAt: string | null;
  own: boolean;
  awardShannons: string | null;
}
export interface CampaignAward {
  place: number;
  publicId: string | null;
  name: string | null;
  amountShannons: string;
  usdReference: string;
  status: 'unawarded' | 'address-needed' | 'ready' | 'submitted' | 'paid';
  transactionHash: string | null;
  /** Only an administrator or this award's recipient receives the address. */
  receivingAddress?: string;
}
export interface CampaignSummary {
  id: string;
  name: string;
  description: string;
  kind: CampaignKind;
  state: CampaignState;
  rehearsal: boolean;
  registrationClosesAt: string;
  fiveRoundId: string | null;
  fixtureCount: number;
  registeredCount: number;
  activeCount: number;
  prizeTotalShannons: string;
  prizePlaces: number;
  joined: boolean;
  /** Only present for this authenticated entrant's joined prediction competitions. */
  joinedFixtureIds?: string[];
  /** Subset already represented by a verified qualifying call for this entrant. */
  qualifyingFixtureIds?: string[];
}
export interface CampaignOwnEntry {
  publicId: string;
  joinedAt: string;
  rank: number;
  points: number;
  participated: boolean;
  tieBreakAt: string | null;
  calls: Array<{
    fixtureId: string;
    outcome: 0 | 1 | 2;
    points: number;
    status: 'pending' | 'correct' | 'incorrect' | 'void';
    transactionHash: string;
  }>;
  fiveRoundId: string | null;
}
export interface CampaignAdminEntry extends CampaignStanding {
  accountId: string;
  joinedAt: string;
}
export interface CampaignDetail extends CampaignSummary {
  revision: number;
  termsHash: string | null;
  predictionEntryPolicy: CampaignPredictionEntryPolicy | null;
  draft: CampaignDraftInput;
  fixtures: CampaignFixture[];
  gameweek: CampaignGameweek | null;
  leaderboard: CampaignStanding[];
  leaderboardTotal: number;
  leaderboardOffset: number;
  own: CampaignOwnEntry | null;
  awards: CampaignAward[];
  scoreStatus: 'waiting' | 'provisional' | 'final' | 'unavailable' | 'review-required';
  verifiedAt: string | null;
  notice: string | null;
  deletedAt: string | null;
  adminEntries?: CampaignAdminEntry[];
}
export interface CampaignPage {
  admin: boolean;
  viewerId: string | null;
  now: string;
  campaigns: CampaignSummary[];
  detail: CampaignDetail | null;
  options?: CampaignOptions;
}

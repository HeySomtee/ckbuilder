export type ScoutPlayer = {
  id: string;
  name: string;
  fullName: string;
  team: string;
  teamCode: string;
  position: string;
  price: number;
  form: number;
  totalPoints: number;
  eventPoints: number;
  pointsPerGame: number;
  selectedPercent: number;
  transfersIn: number;
  transfersOut: number;
  minutes: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  status: string;
  news: string;
  chance: number | null;
};
export type FplEvent = {
  id: number;
  name: string;
  deadline: string;
  finished: boolean;
  checked: boolean;
};
export type FplSeason = { season: string; events: FplEvent[] };
export type ScoutData = { observedAt: string; players: ScoutPlayer[] };
export type PlayerProfile = {
  observedAt: string;
  player: ScoutPlayer;
  history: {
    fixtureId: string;
    event: number;
    opponent: string;
    home: boolean;
    kickoff: string;
    minutes: number;
    goals: number;
    assists: number;
    fplPoints: number;
    fivePoints: number;
  }[];
  fixtures: {
    event: number | null;
    opponent: string;
    home: boolean;
    kickoff: string | null;
    difficulty: number;
  }[];
};

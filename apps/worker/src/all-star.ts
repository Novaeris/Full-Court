import {
  createRng,
  seedState,
  simulateGame,
  type SimTeam,
} from "@fullcourt/game-engine";
import {
  allStarDay,
  allStarMvp,
  pickAllStars,
  STARTERS,
  type AwardLine,
} from "@fullcourt/game-rules";
import type { Game } from "@fullcourt/game-types";
import type { PlayerRow } from "./db";
import { toSimPlayer } from "./map";

/**
 * The All-Star Game (docs/DESIGN.md, "The All-Star Game"): half way through the
 * regular season, before that day's games, the league's best players so far are
 * picked, split into two squads and play one game, which is stored. The worker
 * does it because it is the one that moves the season day by day.
 */

/** Whether the game is played before this day. */
export function isAllStarDay(day: number, lastDay: number): boolean {
  return day === allStarDay(lastDay);
}

/** What the game stores, as the database function wants it. */
export type AllStarRecord = {
  day: number;
  name_a: string;
  name_b: string;
  score_a: number;
  score_b: number;
  overtimes: number;
  mvp_player_id: string | null;
  players: {
    player_id: string;
    team_id: string | null;
    squad: "a" | "b";
    starter: boolean;
    captain: boolean;
    minutes: number;
    points: number;
    rebounds: number;
    assists: number;
    steals: number;
    blocks: number;
  }[];
};

/** What the game needs from the database. */
export interface AllStarStore {
  /** Whether the season already has its game. */
  hasAllStarGame(seasonId: string): Promise<boolean>;
  /** Every player's totals for the regular season so far. */
  loadAllStarLines(seasonId: string): Promise<AwardLine[]>;
  /** The picked players' ratings, last names and teams. */
  loadAllStarPlayers(
    seasonId: string,
    ids: readonly string[],
  ): Promise<{
    players: PlayerRow[];
    lastNames: ReadonlyMap<string, string>;
  }>;
  recordAllStarGame(seasonId: string, game: AllStarRecord): Promise<void>;
}

/**
 * Plays the season's All-Star Game if it hasn't been played. The game is seeded
 * from the league and the year, so a requeued job plays the same one; it is
 * stored once (the database refuses a second). Returns whether one was played.
 */
export async function runAllStarGame(
  store: AllStarStore,
  season: { id: string; league_id: string; year: number; day: number },
): Promise<boolean> {
  if (await store.hasAllStarGame(season.id)) return false;
  const squads = pickAllStars(await store.loadAllStarLines(season.id));
  if (!squads) return false;

  const ids = [...squads.a, ...squads.b];
  const { players, lastNames } = await store.loadAllStarPlayers(season.id, ids);
  const byId = new Map(players.map((p) => [p.id, p]));
  if (ids.some((id) => !byId.has(id))) return false;

  const team = (id: string, squad: string[]): SimTeam => ({
    id,
    players: squad.map((p) => toSimPlayer(byId.get(p) as PlayerRow)),
    // An exhibition: quick, and plenty of threes.
    strategy: { pace: "fast", threePointFocus: "high", defense: "balanced" },
    starters: squad.slice(0, STARTERS),
  });
  const home = team("all-star-a", squads.a);
  const away = team("all-star-b", squads.b);
  const game: Game = {
    id: `all-star-${season.year}`,
    day: season.day,
    homeTeamId: home.id,
    awayTeamId: away.id,
    status: "scheduled",
    homeScore: null,
    awayScore: null,
    overtimes: 0,
  };
  const played = simulateGame(
    game,
    home,
    away,
    createRng(seedState(`${season.league_id}:all-star:${season.year}`)),
  );
  const scoreA = played.game.homeScore ?? 0;
  const scoreB = played.game.awayScore ?? 0;

  const lines = new Map(played.boxScore.lines.map((l) => [l.playerId, l]));
  const winners = scoreA >= scoreB ? squads.a : squads.b;
  const name = (captain: string) => `Team ${lastNames.get(captain) ?? "Stars"}`;
  const row = (id: string, squad: "a" | "b", i: number) => {
    const l = lines.get(id);
    return {
      player_id: id,
      team_id: byId.get(id)?.team_id ?? null,
      squad,
      starter: i < STARTERS,
      captain: id === (squad === "a" ? squads.captainA : squads.captainB),
      minutes: l?.minutes ?? 0,
      points: l?.points ?? 0,
      rebounds: l?.rebounds ?? 0,
      assists: l?.assists ?? 0,
      steals: l?.steals ?? 0,
      blocks: l?.blocks ?? 0,
    };
  };
  await store.recordAllStarGame(season.id, {
    day: season.day,
    name_a: name(squads.captainA),
    name_b: name(squads.captainB),
    score_a: scoreA,
    score_b: scoreB,
    overtimes: played.game.overtimes,
    mvp_player_id: allStarMvp(
      winners.flatMap((id) => {
        const l = lines.get(id);
        return l ? [{ ...l, playerId: id }] : [];
      }),
    ),
    players: [
      ...squads.a.map((id, i) => row(id, "a", i)),
      ...squads.b.map((id, i) => row(id, "b", i)),
    ],
  });
  return true;
}

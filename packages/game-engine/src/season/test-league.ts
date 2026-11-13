import { DEFAULT_TEAM_STRATEGY, type Game } from "@fullcourt/game-types";
import { generateWorld } from "../world/generate";
import type { SimTeam } from "./types";

/** A generated 30-team league as simulation teams, for tests. */
export function testTeams(seed = "season-tests"): SimTeam[] {
  const world = generateWorld({ seed, size: "standard" });
  return world.teams.map((team) => ({
    id: team.abbreviation,
    strategy: { ...DEFAULT_TEAM_STRATEGY },
    players: world.players
      .filter((p) => p.team === team.abbreviation)
      .map((p, i) => ({
        id: `${team.abbreviation}-${i + 1}`,
        position: p.position,
        overall: p.overall,
        ratings: p.ratings,
      })),
  }));
}

export function scheduledGame(
  id: string,
  home: SimTeam,
  away: SimTeam,
  day = 1,
): Game {
  return {
    id,
    day,
    homeTeamId: home.id,
    awayTeamId: away.id,
    status: "scheduled",
    homeScore: null,
    awayScore: null,
    overtimes: 0,
  };
}

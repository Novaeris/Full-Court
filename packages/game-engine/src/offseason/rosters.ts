import type { Position } from "@fullcourt/game-types";
import { ROSTER_LIMITS, playerValue } from "@fullcourt/game-rules";
import { shuffle } from "../rng/helpers";
import type { Rng } from "../rng/rng";
import type { OffseasonPlayer } from "./offseason";

/**
 * Free agency, as far as the players go: every team ends with 12 to 15 players
 * and can be anywhere in that range. A team releases its weakest above 15, lets
 * go of players who are not worth a place when it is above the size its front
 * office aims for, and signs free agents (worst team first, preferring
 * positions it is short of) up to that size, which differs from team to team
 * but is never below the minimum. Free agency itself has no cap.
 */

/** A player below this value is not worth a roster place a team doesn't need. */
const REPLACEMENT_LEVEL = 57;

export type RosterMove = {
  id: string;
  /** null for a free agent. */
  teamId: string | null;
  jersey: number;
};

function freeJersey(rng: Rng, used: ReadonlySet<number>): number {
  const free = shuffle(
    rng,
    Array.from({ length: 100 }, (_, n) => n),
  ).find((n) => !used.has(n));
  return free ?? 0;
}

/**
 * Step 3: the roster moves of free agency. `players` is every active player,
 * on a team or free; `teams` is every team, best record first. Returns only
 * the players whose team or jersey changed.
 */
export function fillRosters(
  rng: Rng,
  input: {
    teams: readonly string[];
    players: readonly OffseasonPlayer[];
  },
): RosterMove[] {
  const teams = [...input.teams];
  const team = new Map<string, string | null>(
    input.players.map((p) => [p.id, p.teamId]),
  );
  const byId = new Map(input.players.map((p) => [p.id, p]));
  const value = (id: string) => {
    const p = byId.get(id) as OffseasonPlayer;
    return playerValue(p.overall, p.potential, p.age);
  };

  const rosters = new Map<string, string[]>(teams.map((t) => [t, []]));
  for (const p of input.players) {
    if (p.teamId) rosters.get(p.teamId)?.push(p.id);
  }
  const pool: string[] = input.players
    .filter((p) => p.teamId === null)
    .map((p) => p.id);

  for (const roster of rosters.values()) {
    roster.sort((a, b) => value(b) - value(a));
    for (const cut of roster.splice(ROSTER_LIMITS.max)) {
      team.set(cut, null);
      pool.push(cut);
    }
  }

  for (const teamId of [...teams].reverse()) {
    const roster = rosters.get(teamId) as string[];
    const target = rng.int(ROSTER_LIMITS.min, ROSTER_LIMITS.max);
    while (roster.length > Math.max(target, ROSTER_LIMITS.min)) {
      const weakest = roster[roster.length - 1] as string;
      if (value(weakest) >= REPLACEMENT_LEVEL) break;
      roster.pop();
      team.set(weakest, null);
      pool.push(weakest);
    }
    while (roster.length < target && pool.length > 0) {
      const counts = new Map<Position, number>();
      for (const id of roster) {
        const position = (byId.get(id) as OffseasonPlayer).position;
        counts.set(position, (counts.get(position) ?? 0) + 1);
      }
      // Prefer a position the team is short of; otherwise the best player.
      let best = 0;
      let bestScore = -Infinity;
      pool.forEach((id, i) => {
        const position = (byId.get(id) as OffseasonPlayer).position;
        const score = value(id) - (counts.get(position) ?? 0) * 4;
        if (score > bestScore) {
          bestScore = score;
          best = i;
        }
      });
      const [signed] = pool.splice(best, 1) as [string];
      team.set(signed, teamId);
      roster.push(signed);
    }
  }

  // Jersey numbers: a player keeps his unless a teammate already wears it
  // (players who were there first are placed first); a newcomer with a clash
  // takes a free one.
  const jersey = new Map<string, number>(
    input.players.map((p) => [p.id, p.jersey]),
  );
  for (const teamId of teams) {
    const members = input.players
      .filter((p) => team.get(p.id) === teamId)
      .sort(
        (a, b) => Number(b.teamId === teamId) - Number(a.teamId === teamId),
      );
    const used = new Set<number>();
    for (const p of members) {
      let number = jersey.get(p.id) as number;
      if (used.has(number)) number = freeJersey(rng, used);
      jersey.set(p.id, number);
      used.add(number);
    }
  }

  return input.players.flatMap((p) => {
    const teamId = team.get(p.id) ?? null;
    const number = jersey.get(p.id) as number;
    return teamId !== p.teamId || number !== p.jersey
      ? [{ id: p.id, teamId, jersey: number }]
      : [];
  });
}

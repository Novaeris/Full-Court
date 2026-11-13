import { POSITIONS, type Position } from "@fullcourt/game-types";
import {
  ROSTER_LIMITS,
  askingSalary,
  hardCeiling,
  minSalary,
  playerValue,
} from "@fullcourt/game-rules";
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
  /** For a player signed to fill a roster (a minimum contract): his salary and length. */
  salary?: number;
  years?: number;
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
    /**
     * The teams whose front office acts. Others (an owner's, who is making
     * their own moves) are left as they are. Everyone when not given.
     */
    acting?: ReadonlySet<string>;
    /**
     * The salary cap. When given, the players teams sign to fill a roster get
     * minimum contracts and are drawn from those who would take one, unless
     * the team is short of the minimum roster size.
     */
    cap?: number;
    /**
     * Each team's payroll, with the cap: a team never signs a minimum contract
     * that would take it past the hard ceiling.
     */
    payroll?: ReadonlyMap<string, number>;
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
  const signedHere = new Set<string>();
  const pool: string[] = input.players
    .filter((p) => p.teamId === null)
    .map((p) => p.id);

  const acts = (teamId: string) =>
    input.acting === undefined || input.acting.has(teamId);
  for (const [teamId, roster] of rosters) {
    if (!acts(teamId)) continue;
    roster.sort((a, b) => value(b) - value(a));
    for (const cut of roster.splice(ROSTER_LIMITS.max)) {
      team.set(cut, null);
      pool.push(cut);
    }
  }

  for (const teamId of [...teams].reverse()) {
    if (!acts(teamId)) continue;
    const roster = rosters.get(teamId) as string[];
    const target = rng.int(ROSTER_LIMITS.min, ROSTER_LIMITS.max);
    while (roster.length > Math.max(target, ROSTER_LIMITS.min)) {
      const weakest = roster[roster.length - 1] as string;
      if (value(weakest) >= REPLACEMENT_LEVEL) break;
      roster.pop();
      team.set(weakest, null);
      pool.push(weakest);
    }
    let spent = input.payroll?.get(teamId) ?? 0;
    while (roster.length < target && pool.length > 0) {
      if (
        input.cap !== undefined &&
        input.payroll !== undefined &&
        spent + minSalary(input.cap) > hardCeiling(input.cap)
      ) {
        break;
      }
      const counts = new Map<Position, number>();
      for (const id of roster) {
        const position = (byId.get(id) as OffseasonPlayer).position;
        counts.set(position, (counts.get(position) ?? 0) + 1);
      }
      // Prefer a position the team is short of; otherwise the best player.
      // With a cap, only players who would take a minimum contract are
      // considered, unless the team can't reach the minimum roster size.
      const wouldTakeMinimum = (id: string) =>
        input.cap === undefined ||
        askingSalary(byId.get(id) as OffseasonPlayer, input.cap) <=
          minSalary(input.cap) * 1.6;
      const cheap = pool.filter(wouldTakeMinimum);
      const candidates =
        cheap.length > 0 && roster.length >= ROSTER_LIMITS.min ? cheap : pool;
      let best = 0;
      let bestScore = -Infinity;
      pool.forEach((id, i) => {
        if (!candidates.includes(id)) return;
        const position = (byId.get(id) as OffseasonPlayer).position;
        const score = value(id) - (counts.get(position) ?? 0) * 4;
        if (score > bestScore) {
          bestScore = score;
          best = i;
        }
      });
      const [signed] = pool.splice(best, 1) as [string];
      team.set(signed, teamId);
      signedHere.add(signed);
      if (input.cap !== undefined) spent += minSalary(input.cap);
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
    if (teamId === p.teamId && number === p.jersey) return [];
    const move: RosterMove = { id: p.id, teamId, jersey: number };
    if (input.cap !== undefined && signedHere.has(p.id)) {
      move.salary = minSalary(input.cap);
      move.years = 1;
    }
    return [move];
  });
}

/**
 * Roster coverage for a team the owner runs: leaves their choices alone but
 * makes the roster legal and every position covered. Too many players: the
 * weakest go, from positions with the most players first. Too few, or a
 * position nobody plays: the best free agent signs, uncovered positions first.
 */
export function coverRoster(input: {
  roster: readonly OffseasonPlayer[];
  pool: readonly OffseasonPlayer[];
}): { release: string[]; sign: string[] } {
  const roster = [...input.roster];
  const pool = [...input.pool];
  const release: string[] = [];
  const sign: string[] = [];
  const value = (p: OffseasonPlayer) =>
    playerValue(p.overall, p.potential, p.age);
  const count = (position: Position) =>
    roster.filter((p) => p.position === position).length;

  while (roster.length > ROSTER_LIMITS.max) {
    const candidates = roster.filter((p) => count(p.position) > 1);
    const from = candidates.length > 0 ? candidates : roster;
    const cut = from.reduce((a, b) => {
      const crowd = count(b.position) - count(a.position);
      if (crowd !== 0) return crowd > 0 ? b : a;
      return value(b) < value(a) ? b : a;
    });
    roster.splice(roster.indexOf(cut), 1);
    release.push(cut.id);
  }

  const missing = () => POSITIONS.filter((position) => count(position) === 0);
  while (
    pool.length > 0 &&
    roster.length < ROSTER_LIMITS.max &&
    (roster.length < ROSTER_LIMITS.min || missing().length > 0)
  ) {
    const uncovered = new Set(missing());
    let best = 0;
    let bestScore = -Infinity;
    pool.forEach((p, i) => {
      const score =
        value(p) +
        (uncovered.has(p.position) ? 100 : 0) -
        count(p.position) * 4;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    const [signed] = pool.splice(best, 1) as [OffseasonPlayer];
    roster.push(signed);
    sign.push(signed.id);
  }
  return { release, sign };
}

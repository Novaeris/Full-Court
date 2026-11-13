import type {
  Game,
  LeagueStructure,
  ScheduleTiers,
} from "@fullcourt/game-types";
import {
  matchupTier,
  validateScheduleTiers,
  validateStructureIntegrity,
  type TeamPlacement,
} from "@fullcourt/game-rules";
import { shuffle } from "../rng/helpers";
import type { Rng } from "../rng/rng";

export type ScheduleOptions = {
  structure: LeagueStructure;
  /** Every team, with the conference and division it belongs to. */
  teams: readonly TeamPlacement[];
  tiers: ScheduleTiers;
  /** Game ids are `${idPrefix}${n}`, n from 1 and zero-padded to 4 digits. */
  idPrefix?: string;
};

type Meeting = { a: string; b: string; games: number };

/**
 * Builds a full regular season: who plays whom, who is home, and on which day.
 *
 * - Each pair meets `tiers[relationship]` times, split between the two homes.
 *   Pairs with an odd count have one extra home game; those extras are
 *   assigned along an Euler circuit so every team's home and away totals
 *   differ by at most one.
 * - No team plays twice on a day. Games are placed on the earliest day both
 *   teams are free, in a shuffled order.
 *
 * Deterministic for a given RNG state. Throws on inconsistent input.
 */
export function generateSchedule(options: ScheduleOptions, rng: Rng): Game[] {
  const { structure, teams, tiers } = options;
  const prefix = options.idPrefix ?? "g-";

  const issues = [
    ...validateStructureIntegrity(structure),
    ...validateScheduleTiers(structure, tiers),
  ];
  if (issues.length > 0) {
    throw new Error(`Can't build a schedule: ${issues[0]?.message}`);
  }
  checkTeams(structure, teams);

  // Meetings per pair, in a stable order.
  const meetings: Meeting[] = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const a = teams[i] as TeamPlacement;
      const b = teams[j] as TeamPlacement;
      meetings.push({
        a: a.teamId,
        b: b.teamId,
        games: tiers[matchupTier(a, b)],
      });
    }
  }

  // [home, away] for every game.
  const pairings: [string, string][] = [];
  const odd: Meeting[] = [];
  for (const m of meetings) {
    const each = Math.floor(m.games / 2);
    for (let k = 0; k < each; k++) {
      pairings.push([m.a, m.b], [m.b, m.a]);
    }
    if (m.games % 2 === 1) odd.push(m);
  }
  pairings.push(...orientBalanced(odd, rng));

  // Place on days, earliest first.
  const order = shuffle(rng, pairings);
  const busy: Set<string>[] = [];
  const placed: { day: number; home: string; away: string }[] = [];
  for (const [home, away] of order) {
    let day = 0;
    while (busy[day]?.has(home) || busy[day]?.has(away)) day++;
    (busy[day] ??= new Set()).add(home).add(away);
    placed.push({ day: day + 1, home, away });
  }
  placed.sort(
    (x, y) =>
      x.day - y.day ||
      (x.home < y.home ? -1 : x.home > y.home ? 1 : 0) ||
      (x.away < y.away ? -1 : 1),
  );
  return placed.map((p, n): Game => ({
    id: `${prefix}${String(n + 1).padStart(4, "0")}`,
    day: p.day,
    homeTeamId: p.home,
    awayTeamId: p.away,
    status: "scheduled",
    homeScore: null,
    awayScore: null,
    overtimes: 0,
  }));
}

function checkTeams(
  structure: LeagueStructure,
  teams: readonly TeamPlacement[],
): void {
  const ids = new Set<string>();
  const counts = new Map<string, number>();
  for (const t of teams) {
    if (ids.has(t.teamId)) throw new Error(`Team ${t.teamId} appears twice.`);
    ids.add(t.teamId);
    counts.set(t.divisionId, (counts.get(t.divisionId) ?? 0) + 1);
    const conference = structure.conferences.find(
      (c) => c.id === t.conferenceId,
    );
    if (!conference?.divisions.some((d) => d.id === t.divisionId)) {
      throw new Error(`Team ${t.teamId} is in an unknown division.`);
    }
  }
  for (const conference of structure.conferences) {
    for (const division of conference.divisions) {
      if ((counts.get(division.id) ?? 0) !== division.teamCount) {
        throw new Error(
          `${division.name} should have ${division.teamCount} teams.`,
        );
      }
    }
  }
}

/**
 * Gives each meeting's extra game to one side so that, for every team, home
 * and away extras differ by at most one. Orients the edges of the "odd pair"
 * graph along Euler circuits (an extra vertex joins the odd-degree teams so
 * circuits exist); each team's in and out degree then differ by at most one.
 */
function orientBalanced(odd: readonly Meeting[], rng: Rng): [string, string][] {
  const edges = shuffle(rng, odd).map((m, id) => ({
    id,
    a: m.a,
    b: m.b,
    dummy: false,
  }));
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.a, (degree.get(e.a) ?? 0) + 1);
    degree.set(e.b, (degree.get(e.b) ?? 0) + 1);
  }
  const DUMMY = "\u0000dummy";
  let next = edges.length;
  for (const [team, d] of [...degree].sort()) {
    if (d % 2 === 1) edges.push({ id: next++, a: team, b: DUMMY, dummy: true });
  }

  const adjacency = new Map<string, typeof edges>();
  for (const e of edges) {
    for (const v of [e.a, e.b]) {
      const list = adjacency.get(v);
      if (list) list.push(e);
      else adjacency.set(v, [e]);
    }
  }

  const used = new Set<number>();
  const result: [string, string][] = [];
  const walkFrom = (start: string): void => {
    // Hierholzer: walk until stuck; every vertex has even degree, so the
    // walk returns to its start. Edges are oriented in the direction walked.
    const stack: string[] = [start];
    while (stack.length > 0) {
      const v = stack[stack.length - 1] as string;
      const edge = adjacency.get(v)?.find((e) => !used.has(e.id));
      if (!edge) {
        stack.pop();
        continue;
      }
      used.add(edge.id);
      const to = edge.a === v ? edge.b : edge.a;
      if (!edge.dummy) result.push([v, to]); // v hosts `to`
      stack.push(to);
    }
  };
  for (const v of [...adjacency.keys()].sort()) walkFrom(v);
  return result;
}

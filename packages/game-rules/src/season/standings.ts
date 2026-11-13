import type { StandingEntry } from "../owner-mode/playoffs";
import type { TeamPlacement } from "./schedule";

/** A finished game, reduced to what standings need. */
export type FinalGameResult = {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
};

export type StandingsRow = StandingEntry & {
  wins: number;
  losses: number;
  /** Wins over games played; 0 before a team has played. */
  winPct: number;
  divisionWins: number;
  divisionLosses: number;
  conferenceWins: number;
  conferenceLosses: number;
  pointsFor: number;
  pointsAgainst: number;
};

type Tally = { w: number; l: number };
const pct = (t: Tally): number => (t.w + t.l === 0 ? 0 : t.w / (t.w + t.l));

/**
 * Ranks every team, best first, from the final games.
 *
 * Ties in win percentage are broken by, in order:
 *  1. record in games among the tied teams,
 *  2. division record (only when all tied teams share a division),
 *  3. conference record (only when all tied teams share a conference),
 *  4. point differential,
 *  5. team id, so the order is always fully determined.
 *
 * Each criterion is computed once over the whole tied group and compared as a
 * single sort key, so the order is consistent for groups of any size. (Leagues
 * that restart the tiebreak after every elimination can differ in rare
 * three-way ties; this is the simpler, deterministic rule.)
 *
 * Throws on an unknown team or a drawn game: basketball games always have a
 * winner.
 */
export function rankStandings(
  teams: readonly TeamPlacement[],
  games: readonly FinalGameResult[],
): StandingsRow[] {
  const byId = new Map(teams.map((t) => [t.teamId, t]));
  const rows = new Map<string, StandingsRow>(
    teams.map((t) => [
      t.teamId,
      {
        teamId: t.teamId,
        conferenceId: t.conferenceId,
        divisionId: t.divisionId,
        wins: 0,
        losses: 0,
        winPct: 0,
        divisionWins: 0,
        divisionLosses: 0,
        conferenceWins: 0,
        conferenceLosses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
      },
    ]),
  );
  // head[a][b] = a's record against b
  const head = new Map<string, Map<string, Tally>>();
  const headTally = (a: string, b: string): Tally => {
    let inner = head.get(a);
    if (!inner) head.set(a, (inner = new Map()));
    let t = inner.get(b);
    if (!t) inner.set(b, (t = { w: 0, l: 0 }));
    return t;
  };

  for (const g of games) {
    const home = byId.get(g.homeTeamId);
    const away = byId.get(g.awayTeamId);
    if (!home || !away) throw new Error("Game refers to an unknown team.");
    if (home.teamId === away.teamId)
      throw new Error("A team can't play itself.");
    if (g.homeScore === g.awayScore)
      throw new Error("A game can't end in a tie.");
    const homeWon = g.homeScore > g.awayScore;
    const sameDivision = home.divisionId === away.divisionId;
    const sameConference = home.conferenceId === away.conferenceId;
    for (const [team, opp, won, scored, allowed] of [
      [home, away, homeWon, g.homeScore, g.awayScore],
      [away, home, !homeWon, g.awayScore, g.homeScore],
    ] as const) {
      const row = rows.get(team.teamId)!;
      row.pointsFor += scored;
      row.pointsAgainst += allowed;
      if (won) row.wins++;
      else row.losses++;
      if (sameDivision) {
        if (won) row.divisionWins++;
        else row.divisionLosses++;
      }
      if (sameConference) {
        if (won) row.conferenceWins++;
        else row.conferenceLosses++;
      }
      const t = headTally(team.teamId, opp.teamId);
      if (won) t.w++;
      else t.l++;
    }
  }
  for (const row of rows.values())
    row.winPct = pct({ w: row.wins, l: row.losses });

  const ordered = [...rows.values()].sort(
    (a, b) => b.winPct - a.winPct || (a.teamId < b.teamId ? -1 : 1),
  );

  // Re-sort each run of equal win percentage by the tiebreak key.
  const result: StandingsRow[] = [];
  for (let i = 0; i < ordered.length;) {
    let j = i + 1;
    while (j < ordered.length && ordered[j]!.winPct === ordered[i]!.winPct) j++;
    const group = ordered.slice(i, j);
    result.push(...(group.length > 1 ? breakTies(group, head) : group));
    i = j;
  }
  return result;
}

function breakTies(
  group: StandingsRow[],
  head: Map<string, Map<string, Tally>>,
): StandingsRow[] {
  const ids = new Set(group.map((r) => r.teamId));
  const sameDivision = new Set(group.map((r) => r.divisionId)).size === 1;
  const sameConference = new Set(group.map((r) => r.conferenceId)).size === 1;
  const key = (r: StandingsRow): number[] => {
    const h: Tally = { w: 0, l: 0 };
    for (const [opp, t] of head.get(r.teamId) ?? []) {
      if (ids.has(opp)) {
        h.w += t.w;
        h.l += t.l;
      }
    }
    return [
      pct(h),
      sameDivision ? pct({ w: r.divisionWins, l: r.divisionLosses }) : 0,
      sameConference ? pct({ w: r.conferenceWins, l: r.conferenceLosses }) : 0,
      r.pointsFor - r.pointsAgainst,
    ];
  };
  const keys = new Map(group.map((r) => [r.teamId, key(r)]));
  return [...group].sort((a, b) => {
    const ka = keys.get(a.teamId)!;
    const kb = keys.get(b.teamId)!;
    for (let n = 0; n < ka.length; n++) {
      if (ka[n] !== kb[n]) return kb[n]! - ka[n]!;
    }
    return a.teamId < b.teamId ? -1 : 1;
  });
}

/** A finished game with the day it was played, so form can be worked out. */
export type DatedResult = FinalGameResult & { day: number };

export type StandingsDetailRow = StandingsRow & {
  /** 1 for the best team. */
  rank: number;
  homeWins: number;
  homeLosses: number;
  awayWins: number;
  awayLosses: number;
  /** "W3" for three straight wins, "L2" for two straight losses, "" before a game is played. */
  streak: string;
  /** Wins and losses in the last ten games, such as "7-3". */
  lastTen: string;
};

/**
 * The full standings: `rankStandings` order plus home and away records,
 * the current streak and the last ten games.
 */
export function buildStandings(
  teams: readonly TeamPlacement[],
  games: readonly DatedResult[],
): StandingsDetailRow[] {
  const ranked = rankStandings(teams, games);
  const results = new Map<
    string,
    { won: boolean; home: boolean; day: number }[]
  >();
  for (const team of teams) results.set(team.teamId, []);
  for (const g of games) {
    const homeWon = g.homeScore > g.awayScore;
    results.get(g.homeTeamId)?.push({ won: homeWon, home: true, day: g.day });
    results.get(g.awayTeamId)?.push({ won: !homeWon, home: false, day: g.day });
  }
  return ranked.map((row, index) => {
    const played = [...(results.get(row.teamId) ?? [])].sort(
      (a, b) => a.day - b.day,
    );
    const count = (home: boolean, won: boolean) =>
      played.filter((r) => r.home === home && r.won === won).length;
    const latest = played[played.length - 1];
    let run = 0;
    for (let i = played.length - 1; i >= 0; i--) {
      if (played[i]?.won !== latest?.won) break;
      run++;
    }
    const lastTen = played.slice(-10);
    const tenWins = lastTen.filter((r) => r.won).length;
    return {
      ...row,
      rank: index + 1,
      homeWins: count(true, true),
      homeLosses: count(true, false),
      awayWins: count(false, true),
      awayLosses: count(false, false),
      streak: latest ? `${latest.won ? "W" : "L"}${run}` : "",
      lastTen: `${tenWins}-${lastTen.length - tenWins}`,
    };
  });
}

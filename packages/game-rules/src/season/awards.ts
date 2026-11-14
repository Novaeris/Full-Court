/**
 * Season awards (docs/DESIGN.md, "Awards and history"). Everything is worked out
 * from a season's archived totals, by rules that are pure and repeatable: ties
 * go to the player with the smaller id, so the same season always gives the
 * same winners.
 */

/** A player's totals for a season, summed over the teams he played for. */
export type AwardLine = {
  playerId: string;
  /** The team he played the most games for. */
  teamId: string;
  position: string;
  games: number;
  started: number;
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fgm: number;
  fga: number;
  ftm: number;
  fta: number;
  /** Whether this is his first season in the league. */
  rookie: boolean;
};

export type AwardTeam = {
  id: string;
  wins: number;
  losses: number;
  pointsAgainst: number;
};

export type AwardWinner = {
  /** A slug: `mvp`, `scoring-title`, `all-league-1` and so on. */
  award: string;
  playerId: string;
  teamId: string;
};

export type AwardInput = {
  lines: readonly AwardLine[];
  teams: readonly AwardTeam[];
  /** Last season's efficiency per game, by player, for most improved. */
  previous: ReadonlyMap<string, number>;
  champion: string | null;
  /** The champion's players' playoff totals, for the finals MVP. */
  finalsLines: readonly AwardLine[];
};

/** Games a player needs to be considered, as a share of the most any played. */
export const AWARD_MIN_GAMES = 0.6;

/** Efficiency per game: the usual box score sum, less every miss and turnover. */
export function efficiency(l: AwardLine): number {
  if (l.games === 0) return 0;
  return (
    (l.points +
      l.rebounds +
      l.assists +
      l.steals +
      l.blocks -
      (l.fga - l.fgm) -
      (l.fta - l.ftm) -
      l.turnovers) /
    l.games
  );
}

const perGame = (l: AwardLine, total: number) =>
  l.games === 0 ? 0 : total / l.games;

/** The best line by `score` (higher wins), ties to the smaller player id. */
function best(
  lines: readonly AwardLine[],
  score: (l: AwardLine) => number,
): AwardLine | null {
  let top: AwardLine | null = null;
  let topScore = -Infinity;
  for (const l of lines) {
    const s = score(l);
    if (s > topScore || (s === topScore && top && l.playerId < top.playerId)) {
      top = l;
      topScore = s;
    }
  }
  return top;
}

const ranked = (
  lines: readonly AwardLine[],
  score: (l: AwardLine) => number,
): AwardLine[] =>
  [...lines].sort(
    (a, b) => score(b) - score(a) || (a.playerId < b.playerId ? -1 : 1),
  );

const GUARDS = ["PG", "SG"];
const FORWARDS = ["SF", "PF"];

/** The awards that can be followed through the season as a race. */
export const RACE_AWARDS = [
  "mvp",
  "defensive-player",
  "sixth-man",
  "rookie-of-the-year",
  "most-improved",
] as const;
export type RaceAward = (typeof RACE_AWARDS)[number];

/** Who can win an award and how a line is scored for it (higher wins). */
type Contest = { pool: AwardLine[]; score: (l: AwardLine) => number };

/**
 * What the award rules share: who is eligible and each race's pool and score.
 * `value` is a player's worth to his team, for the MVP and the all-league teams.
 */
function contests(input: AwardInput) {
  const maxGames = Math.max(0, ...input.lines.map((l) => l.games));
  const eligible = input.lines.filter(
    (l) => l.games >= maxGames * AWARD_MIN_GAMES && l.games > 0,
  );
  const team = new Map(input.teams.map((t) => [t.id, t]));
  const winShare = (id: string) => {
    const t = team.get(id);
    const played = t ? t.wins + t.losses : 0;
    return t && played > 0 ? t.wins / played : 0.5;
  };
  // 1 for the team that allows the fewest points, 0 for the most.
  const defenceShare = (id: string) => {
    const t = team.get(id);
    if (!t || input.teams.length < 2) return 0.5;
    const allowed = (x: AwardTeam) =>
      x.wins + x.losses > 0 ? x.pointsAgainst / (x.wins + x.losses) : 0;
    const order = [...input.teams].sort(
      (a, b) => allowed(a) - allowed(b) || (a.id < b.id ? -1 : 1),
    );
    const at = order.findIndex((x) => x.id === id);
    return 1 - at / (order.length - 1);
  };

  // Efficiency, weighted by how well the team did.
  const value = (l: AwardLine) =>
    efficiency(l) * (0.6 + 0.8 * winShare(l.teamId));

  const races: Record<RaceAward, Contest> = {
    mvp: { pool: eligible, score: value },
    "defensive-player": {
      pool: eligible,
      score: (l) =>
        (2.5 * perGame(l, l.steals) +
          2 * perGame(l, l.blocks) +
          0.5 * perGame(l, l.rebounds)) *
        (0.9 + 0.2 * defenceShare(l.teamId)),
    },
    "sixth-man": {
      pool: eligible.filter(
        (l) => l.started <= l.games * 0.25 && perGame(l, l.minutes) >= 15,
      ),
      score: efficiency,
    },
    "rookie-of-the-year": {
      pool: input.lines.filter(
        (l) => l.rookie && l.games >= maxGames * (AWARD_MIN_GAMES * 0.67),
      ),
      score: efficiency,
    },
    "most-improved": {
      pool: eligible.filter((l) => input.previous.has(l.playerId)),
      score: (l) => efficiency(l) - (input.previous.get(l.playerId) ?? 0),
    },
  };
  return { eligible, value, races };
}

/**
 * The leading candidates for an award on the totals so far, best first, with
 * the score the rules give each (the same rules the season's award uses, so
 * the race ends on the winner). Ties go to the smaller player id.
 */
export function awardRace(
  input: AwardInput,
  award: RaceAward,
  limit = 5,
): { line: AwardLine; score: number }[] {
  const { pool, score } = contests(input).races[award];
  return ranked(pool, score)
    .slice(0, limit)
    .map((line) => ({ line, score: score(line) }));
}

/** All the season's awards. A category nobody qualifies for is left out. */
export function chooseAwards(input: AwardInput): AwardWinner[] {
  const out: AwardWinner[] = [];
  const give = (award: string, l: AwardLine | null) => {
    if (l) out.push({ award, playerId: l.playerId, teamId: l.teamId });
  };
  const { eligible, value, races } = contests(input);

  for (const award of RACE_AWARDS) {
    give(award, best(races[award].pool, races[award].score));
  }
  give(
    "scoring-title",
    best(eligible, (l) => perGame(l, l.points)),
  );
  give(
    "rebounding-title",
    best(eligible, (l) => perGame(l, l.rebounds)),
  );
  give(
    "assists-title",
    best(eligible, (l) => perGame(l, l.assists)),
  );
  give(
    "steals-title",
    best(eligible, (l) => perGame(l, l.steals)),
  );
  give(
    "blocks-title",
    best(eligible, (l) => perGame(l, l.blocks)),
  );

  // Finals MVP: the champion's best player in the playoffs.
  if (input.champion) {
    give(
      "finals-mvp",
      best(
        input.finalsLines.filter((l) => l.teamId === input.champion),
        efficiency,
      ),
    );
  }

  // Three all-league teams: two guards, two forwards and a centre each, best
  // first; a position with too few players is filled by the best left.
  const pool = ranked(eligible, value);
  const used = new Set<string>();
  const take = (positions: readonly string[], count: number): AwardLine[] => {
    const picked = pool
      .filter((l) => !used.has(l.playerId) && positions.includes(l.position))
      .slice(0, count);
    for (const l of picked) used.add(l.playerId);
    return picked;
  };
  for (let n = 1; n <= 3; n++) {
    const five = [...take(GUARDS, 2), ...take(FORWARDS, 2), ...take(["C"], 1)];
    for (const l of pool) {
      if (five.length >= 5) break;
      if (used.has(l.playerId)) continue;
      used.add(l.playerId);
      five.push(l);
    }
    for (const l of five) give(`all-league-${n}`, l);
  }
  return out;
}

/** What each award is called, for the pages. */
export const AWARD_NAMES: Readonly<Record<string, string>> = {
  champion: "Champion",
  finalist: "Finalist",
  mvp: "Most valuable player",
  "finals-mvp": "Finals MVP",
  "defensive-player": "Defensive player of the year",
  "rookie-of-the-year": "Rookie of the year",
  "sixth-man": "Sixth man of the year",
  "most-improved": "Most improved player",
  "scoring-title": "Scoring title",
  "rebounding-title": "Rebounding title",
  "assists-title": "Assists title",
  "steals-title": "Steals title",
  "blocks-title": "Blocks title",
  "all-league-1": "All-league first team",
  "all-league-2": "All-league second team",
  "all-league-3": "All-league third team",
};

/** The individual awards in the order a page lists them. */
export const PLAYER_AWARDS = [
  "mvp",
  "finals-mvp",
  "defensive-player",
  "rookie-of-the-year",
  "sixth-man",
  "most-improved",
  "scoring-title",
  "rebounding-title",
  "assists-title",
  "steals-title",
  "blocks-title",
] as const;

/** One row of a player's archived totals for a season with one team. */
export type StatRow = {
  playerId: string;
  teamId: string;
  games: number;
  started: number;
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fgm: number;
  fga: number;
  ftm: number;
  fta: number;
};

/**
 * Sums a player's rows over the teams he played for into one line, with the
 * team he played the most games for (ties to the smaller team id). Players
 * missing from `info` are left out.
 */
export function awardLines(
  rows: readonly StatRow[],
  info: ReadonlyMap<string, { position: string; rookie: boolean }>,
): AwardLine[] {
  const byPlayer = new Map<string, StatRow[]>();
  for (const r of rows) {
    byPlayer.set(r.playerId, [...(byPlayer.get(r.playerId) ?? []), r]);
  }
  const lines: AwardLine[] = [];
  for (const [playerId, list] of byPlayer) {
    const about = info.get(playerId);
    if (!about) continue;
    const main = [...list].sort(
      (a, b) => b.games - a.games || (a.teamId < b.teamId ? -1 : 1),
    )[0] as StatRow;
    const sum = (key: Exclude<keyof StatRow, "playerId" | "teamId">) =>
      list.reduce((s, r) => s + r[key], 0);
    lines.push({
      playerId,
      teamId: main.teamId,
      position: about.position,
      games: sum("games"),
      started: sum("started"),
      minutes: sum("minutes"),
      points: sum("points"),
      rebounds: sum("rebounds"),
      assists: sum("assists"),
      steals: sum("steals"),
      blocks: sum("blocks"),
      turnovers: sum("turnovers"),
      fgm: sum("fgm"),
      fga: sum("fga"),
      ftm: sum("ftm"),
      fta: sum("fta"),
      rookie: about.rookie,
    });
  }
  return lines.sort((a, b) => (a.playerId < b.playerId ? -1 : 1));
}

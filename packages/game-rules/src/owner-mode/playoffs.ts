import {
  MAX_LEAGUE_TEAMS,
  SERIES_LENGTHS,
  type ConferenceId,
  type DivisionId,
  type LeagueStructure,
  type PlayoffConfig,
  type SeriesLength,
} from "@fullcourt/game-types";
import { divisionCount, totalTeams, type RuleIssue } from "./structure";

export function isPowerOfTwo(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && (n & (n - 1)) === 0;
}

/** Rounds in a single-elimination bracket of `teams` (a power of two). */
export function playoffRounds(teams: number): number {
  return isPowerOfTwo(teams) ? Math.log2(teams) : 0;
}

/** Largest power of two that is at most `n` (at least 1). */
function floorPowerOfTwo(n: number): number {
  let p = 1;
  while (p * 2 <= n) p *= 2;
  return p;
}

/** Conference seeding needs an even split into power-of-two brackets. */
export function canSeedByConference(
  structure: LeagueStructure,
  teams: number,
): boolean {
  const c = structure.conferences.length;
  if (![1, 2, 4].includes(c) || teams % c !== 0) return false;
  const spots = teams / c;
  return (
    isPowerOfTwo(spots) &&
    structure.conferences.every(
      (conf) => conf.divisions.reduce((n, d) => n + d.teamCount, 0) >= spots,
    )
  );
}

/** About half the league qualifies (30 teams → 16), as a power of two. */
export function defaultPlayoffTeams(total: number): number {
  return Math.max(2, floorPowerOfTwo(Math.floor(total * 0.55)));
}

export function defaultPlayoffConfig(
  structure: LeagueStructure,
): PlayoffConfig {
  const teams = defaultPlayoffTeams(totalTeams(structure));
  const seeding = canSeedByConference(structure, teams)
    ? "conference"
    : "league";
  const spots =
    seeding === "conference" ? teams / structure.conferences.length : teams;
  return {
    teams,
    seeding,
    autoQualifyDivisionLeaders: true,
    divisionLeaderTopSeeds: Math.min(4, spots),
    roundSeriesLengths: Array.from({ length: playoffRounds(teams) }, () => 7),
  };
}

/** Playoff team counts a league can choose: 2, 4, 8, 16 or 32, up to its size. */
export function playoffTeamOptions(structure: LeagueStructure): number[] {
  const total = Math.min(totalTeams(structure), MAX_LEAGUE_TEAMS);
  const options: number[] = [];
  for (let n = 2; n <= total; n *= 2) options.push(n);
  return options;
}

/**
 * Adjusts a playoff config after the league's structure or the number of
 * playoff teams changed, so a form never holds an impossible combination:
 * an unavailable team count falls back to the default, conference seeding
 * falls back to league-wide when the bracket can't split, series lengths
 * follow the number of rounds, and top seeds are capped to the pool. Rules
 * that need a decision (such as too few spots for division leaders) are left
 * for validatePlayoffConfig to report.
 */
export function reconcilePlayoffConfig(
  structure: LeagueStructure,
  config: PlayoffConfig,
): PlayoffConfig {
  const teams = playoffTeamOptions(structure).includes(config.teams)
    ? config.teams
    : defaultPlayoffConfig(structure).teams;
  const seeding =
    config.seeding === "conference" && !canSeedByConference(structure, teams)
      ? "league"
      : config.seeding;
  const rounds = playoffRounds(teams);
  const roundSeriesLengths = Array.from(
    { length: rounds },
    (_, i): SeriesLength =>
      config.roundSeriesLengths[i] ?? config.roundSeriesLengths.at(-1) ?? 7,
  );
  const spots =
    seeding === "conference" ? teams / structure.conferences.length : teams;
  const divisionLeaderTopSeeds =
    config.divisionLeaderTopSeeds === null
      ? null
      : Math.max(1, Math.min(config.divisionLeaderTopSeeds, spots));
  return {
    ...config,
    teams,
    seeding,
    roundSeriesLengths,
    divisionLeaderTopSeeds,
  };
}

/** Number of teams that make the bracket in one seeding pool. */
function poolSpots(structure: LeagueStructure, config: PlayoffConfig): number {
  return config.seeding === "conference"
    ? config.teams / structure.conferences.length
    : config.teams;
}

export function validatePlayoffConfig(
  structure: LeagueStructure,
  config: PlayoffConfig,
): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const add = (code: string, message: string) => issues.push({ code, message });
  const total = totalTeams(structure);

  if (!isPowerOfTwo(config.teams) || config.teams < 2) {
    add("playoff_teams_power", "Playoff teams must be 2, 4, 8, 16 or 32.");
    return issues;
  }
  if (config.teams > Math.min(total, MAX_LEAGUE_TEAMS)) {
    add(
      "playoff_teams_exceed_league",
      `A ${total}-team league can't send ${config.teams} teams to the playoffs.`,
    );
    return issues;
  }

  const rounds = playoffRounds(config.teams);
  if (config.roundSeriesLengths.length !== rounds) {
    add(
      "series_round_count",
      `${config.teams} playoff teams play ${rounds} rounds; set a series length for each.`,
    );
  } else if (
    config.roundSeriesLengths.some(
      (n) => !(SERIES_LENGTHS as readonly number[]).includes(n),
    )
  ) {
    add("series_length", "Series are best-of-3, best-of-5 or best-of-7.");
  }

  if (
    config.seeding === "conference" &&
    !canSeedByConference(structure, config.teams)
  ) {
    add(
      "conference_seeding_unavailable",
      "Conference seeding needs 1, 2 or 4 conferences that each send the same power-of-two number of teams. Use league-wide seeding instead.",
    );
    return issues;
  }

  const spots = poolSpots(structure, config);
  if (config.autoQualifyDivisionLeaders) {
    const leaders =
      config.seeding === "conference"
        ? Math.max(...structure.conferences.map((c) => c.divisions.length))
        : divisionCount(structure);
    if (leaders > spots) {
      add(
        "division_leaders_exceed_spots",
        `Division leaders qualify automatically, but only ${spots} playoff ${spots === 1 ? "spot is" : "spots are"} available for ${leaders} ${leaders === 1 ? "leader" : "leaders"}.`,
      );
    }
  }
  const top = config.divisionLeaderTopSeeds;
  if (top !== null && (!Number.isInteger(top) || top < 1 || top > spots)) {
    add(
      "division_leader_top_seeds",
      `Top seeds for division leaders must be between 1 and ${spots}.`,
    );
  }
  return issues;
}

/** One team in the final standings, best record first. */
export type StandingEntry = {
  teamId: string;
  conferenceId: ConferenceId;
  divisionId: DivisionId;
};

export type PlayoffSeed = {
  seed: number;
  teamId: string;
  divisionLeader: boolean;
};

export type PlayoffPool = {
  /** The conference for conference seeding; null for league-wide seeding. */
  conferenceId: ConferenceId | null;
  seeds: PlayoffSeed[];
};

/**
 * Who makes the playoffs and in what order. `standings` lists every team
 * best-first; tie-breaks are the caller's job. With automatic qualification
 * every division leader qualifies and the best `divisionLeaderTopSeeds` of
 * them take the first seeds; the other spots go to the best remaining
 * records. Conference seeding runs one pool per conference, league seeding
 * one pool. Pure; no simulation.
 */
export function seedPlayoffTeams(
  structure: LeagueStructure,
  config: PlayoffConfig,
  standings: readonly StandingEntry[],
): PlayoffPool[] {
  const problems = validatePlayoffConfig(structure, config);
  if (problems.length > 0) {
    throw new Error(`Invalid playoff config: ${problems[0]?.message}`);
  }
  checkStandings(structure, standings);

  const spots = poolSpots(structure, config);
  const pools: {
    conferenceId: ConferenceId | null;
    entries: StandingEntry[];
  }[] =
    config.seeding === "conference"
      ? structure.conferences.map((c) => ({
          conferenceId: c.id,
          entries: standings.filter((s) => s.conferenceId === c.id),
        }))
      : [{ conferenceId: null, entries: [...standings] }];

  return pools.map(({ conferenceId, entries }) => ({
    conferenceId,
    seeds: seedPool(entries, spots, config),
  }));
}

function seedPool(
  entries: readonly StandingEntry[],
  spots: number,
  config: PlayoffConfig,
): PlayoffSeed[] {
  const seenDivisions = new Set<DivisionId>();
  const ranked = entries.map((entry) => {
    const divisionLeader = !seenDivisions.has(entry.divisionId);
    seenDivisions.add(entry.divisionId);
    return { teamId: entry.teamId, divisionLeader };
  });

  let order = ranked;
  if (config.autoQualifyDivisionLeaders) {
    const leaders = ranked.filter((t) => t.divisionLeader);
    const priority = leaders.slice(
      0,
      config.divisionLeaderTopSeeds ?? leaders.length,
    );
    const priorityIds = new Set(priority.map((t) => t.teamId));
    const qualified = new Set(leaders.map((t) => t.teamId));
    for (const t of ranked) {
      if (qualified.size >= spots) break;
      qualified.add(t.teamId);
    }
    order = [
      ...priority,
      ...ranked.filter(
        (t) => qualified.has(t.teamId) && !priorityIds.has(t.teamId),
      ),
    ];
  }
  return order.slice(0, spots).map((t, i) => ({ seed: i + 1, ...t }));
}

function checkStandings(
  structure: LeagueStructure,
  standings: readonly StandingEntry[],
): void {
  const divisions = new Map<DivisionId, ConferenceId>();
  for (const c of structure.conferences) {
    for (const d of c.divisions) divisions.set(d.id, c.id);
  }
  const seen = new Set<string>();
  for (const s of standings) {
    if (divisions.get(s.divisionId) !== s.conferenceId) {
      throw new Error(`Team ${s.teamId} is in an unknown division.`);
    }
    if (seen.has(s.teamId))
      throw new Error(`Team ${s.teamId} is listed twice.`);
    seen.add(s.teamId);
  }
  if (seen.size !== totalTeams(structure)) {
    throw new Error("Standings must list every team in the league.");
  }
}

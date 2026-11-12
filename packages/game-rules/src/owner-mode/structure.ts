import {
  MAX_CONFERENCES,
  MAX_LEAGUE_TEAMS,
  MIN_DIVISIONS,
  MIN_SUPPORTED_TEAMS,
  MIN_TEAMS_PER_DIVISION,
  type ConferenceSpec,
  type DivisionSpec,
  type LeagueStructure,
} from "@fullcourt/game-types";

/** A rule violation. `code` is stable for tests and UI; `message` is for people. */
export type RuleIssue = { code: string; message: string };

export const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;
export const NAME_MAX = 40;

export function totalTeams(structure: LeagueStructure): number {
  let total = 0;
  for (const conference of structure.conferences) {
    for (const division of conference.divisions) total += division.teamCount;
  }
  return total;
}

export function divisionCount(structure: LeagueStructure): number {
  return structure.conferences.reduce((n, c) => n + c.divisions.length, 0);
}

export function conferenceTeamCount(conference: ConferenceSpec): number {
  return conference.divisions.reduce((n, d) => n + d.teamCount, 0);
}

/**
 * Builds a structure of equal divisions with neutral ids and names. Only a
 * constructor: the stored model is the explicit list it returns. Geographic
 * names replace these when a league is generated.
 */
export function equalStructure(
  conferences: number,
  divisionsPerConference: number,
  teamsPerDivision: number,
): LeagueStructure {
  return {
    conferences: Array.from({ length: conferences }, (_, c): ConferenceSpec => {
      const divisions = Array.from(
        { length: divisionsPerConference },
        (_, d): DivisionSpec => ({
          id: `d-${c + 1}-${d + 1}`,
          name: `Division ${c + 1}.${d + 1}`,
          teamCount: teamsPerDivision,
        }),
      );
      return { id: `c-${c + 1}`, name: `Conference ${c + 1}`, divisions };
    }),
  };
}

/** The standard league: 2 conferences × 3 divisions × 5 teams. */
export const STANDARD_SHAPE = {
  conferences: 2,
  divisionsPerConference: 3,
  teamsPerDivision: 5,
} as const;

/**
 * Rules that always hold, whatever the structure: they describe a coherent
 * league. Unequal divisions pass. The database enforces the same.
 */
export function validateStructureIntegrity(
  structure: LeagueStructure,
): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const add = (code: string, message: string) => issues.push({ code, message });

  if (structure.conferences.length < 1) {
    add("no_conferences", "A league needs at least one conference.");
  }
  const conferenceIds = new Set<string>();
  const divisionIds = new Set<string>();
  for (const conference of structure.conferences) {
    checkLabel(conference.id, conference.name, "conference", add);
    if (conferenceIds.has(conference.id)) {
      add("duplicate_conference_id", `Conference id ${conference.id} repeats.`);
    }
    conferenceIds.add(conference.id);
    if (conference.divisions.length < 1) {
      add(
        "empty_conference",
        `${conference.name} needs at least one division.`,
      );
    }
    for (const division of conference.divisions) {
      checkLabel(division.id, division.name, "division", add);
      if (divisionIds.has(division.id)) {
        add("duplicate_division_id", `Division id ${division.id} repeats.`);
      }
      divisionIds.add(division.id);
      if (!Number.isInteger(division.teamCount) || division.teamCount < 1) {
        add("empty_division", `${division.name} needs at least one team.`);
      }
    }
  }
  const total = totalTeams(structure);
  if (total < 1 || total > MAX_LEAGUE_TEAMS) {
    add(
      "team_count",
      `A league has between 1 and ${MAX_LEAGUE_TEAMS} teams (this one has ${total}).`,
    );
  }
  return issues;
}

function checkLabel(
  id: string,
  name: string,
  kind: string,
  add: (code: string, message: string) => void,
): void {
  if (!ID_PATTERN.test(id)) {
    add(`invalid_${kind}_id`, `"${id}" isn't a valid ${kind} id.`);
  }
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > NAME_MAX) {
    add(
      `invalid_${kind}_name`,
      `A ${kind} name has 1 to ${NAME_MAX} characters.`,
    );
  }
}

/**
 * What the creation flow supports today, on top of integrity: equal divisions
 * and equal division counts, 1–4 conferences, 8–32 teams, at least two teams
 * per division. Relaxing unequal divisions later means changing only this.
 */
export function validateSupportedStructure(
  structure: LeagueStructure,
): RuleIssue[] {
  const issues = validateStructureIntegrity(structure);
  if (issues.length > 0) return issues;
  const add = (code: string, message: string) => issues.push({ code, message });

  if (structure.conferences.length > MAX_CONFERENCES) {
    add("too_many_conferences", `Use at most ${MAX_CONFERENCES} conferences.`);
  }
  const total = totalTeams(structure);
  if (total < MIN_SUPPORTED_TEAMS) {
    add("too_few_teams", `Use at least ${MIN_SUPPORTED_TEAMS} teams.`);
  }
  if (divisionCount(structure) < MIN_DIVISIONS) {
    add("too_few_divisions", `Use at least ${MIN_DIVISIONS} divisions.`);
  }
  const perConference = new Set(
    structure.conferences.map((c) => c.divisions.length),
  );
  if (perConference.size > 1) {
    add(
      "unequal_conferences",
      "Every conference needs the same number of divisions.",
    );
  }
  const sizes = new Set(
    structure.conferences.flatMap((c) => c.divisions.map((d) => d.teamCount)),
  );
  if (sizes.size > 1) {
    add("unequal_divisions", "Every division needs the same number of teams.");
  }
  if ([...sizes].some((n) => n < MIN_TEAMS_PER_DIVISION)) {
    add(
      "small_division",
      `Divisions need at least ${MIN_TEAMS_PER_DIVISION} teams.`,
    );
  }
  return issues;
}

export type EqualShape = {
  conferences: number;
  divisionsPerConference: number;
  teamsPerDivision: number;
};

/** Every supported equal-division shape for a team count (empty if none). */
export function supportedShapes(teams: number): EqualShape[] {
  const shapes: EqualShape[] = [];
  if (!Number.isInteger(teams)) return shapes;
  for (let conferences = 1; conferences <= MAX_CONFERENCES; conferences++) {
    if (teams % conferences !== 0) continue;
    const perConference = teams / conferences;
    for (let d = 1; d <= perConference; d++) {
      if (perConference % d !== 0) continue;
      const teamsPerDivision = perConference / d;
      if (
        teamsPerDivision >= MIN_TEAMS_PER_DIVISION &&
        conferences * d >= MIN_DIVISIONS
      ) {
        shapes.push({
          conferences,
          divisionsPerConference: d,
          teamsPerDivision,
        });
      }
    }
  }
  return shapes;
}

/** Team counts a custom league can use, ascending. */
export function supportedTeamCounts(): number[] {
  const counts: number[] = [];
  for (let n = MIN_SUPPORTED_TEAMS; n <= MAX_LEAGUE_TEAMS; n++) {
    if (supportedShapes(n).length > 0) counts.push(n);
  }
  return counts;
}

/** True for exactly 2 conferences × 3 divisions × 5 teams. */
export function isStandardStructure(structure: LeagueStructure): boolean {
  const { conferences } = structure;
  return (
    conferences.length === STANDARD_SHAPE.conferences &&
    conferences.every(
      (c) =>
        c.divisions.length === STANDARD_SHAPE.divisionsPerConference &&
        c.divisions.every(
          (d) => d.teamCount === STANDARD_SHAPE.teamsPerDivision,
        ),
    )
  );
}

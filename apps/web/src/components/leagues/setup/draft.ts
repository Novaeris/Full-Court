import { citiesIn } from "@fullcourt/game-engine";
import {
  defaultPlayoffConfig,
  equalStructure,
  reconcilePlayoffConfig,
  STANDARD_SHAPE,
  supportedShapes,
  totalTeams,
  validateLocalPlayers,
  validatePlayoffConfig,
  validateSupportedStructure,
  type EqualShape,
  type RuleIssue,
} from "@fullcourt/game-rules";
import {
  LEAGUE_CONFIG_SCHEMA_VERSION,
  MAX_LOCAL_PLAYERS,
  NO_AI_ASSIST,
  type LeagueConfig,
  type LeaguePreset,
  type LeagueStructure,
  type PlayoffConfig,
  type Region,
  type SeriesLength,
} from "@fullcourt/game-types";
import {
  LeagueNameSchema,
  type CreateLeagueRequest,
} from "@fullcourt/validation";

/**
 * The league setup being edited. Plain data plus a reducer, so the form's
 * behaviour is testable without a browser. The rules themselves come from
 * @fullcourt/game-rules.
 */
export type Draft = {
  name: string;
  preset: LeaguePreset;
  region: Region;
  /** Equal-division shape; fixed to the standard shape for the standard preset. */
  shape: EqualShape;
  playoffs: PlayoffConfig;
  fantasyDraft: boolean;
  localPlayers: number;
  /** The city of each local player's franchise: Player 1 first. */
  franchiseCities: string[];
};

/**
 * City choices for `count` franchises: keeps the ones already chosen (when
 * they are in the region and not repeated) and fills the rest with the
 * region's biggest unused cities.
 */
export function franchiseCitiesFor(
  region: Region,
  count: number,
  keep: readonly string[] = [],
): string[] {
  const available = citiesIn(region).map((c) => c.id);
  const chosen: string[] = [];
  for (const id of keep) {
    if (chosen.length < count && available.includes(id) && !chosen.includes(id))
      chosen.push(id);
  }
  for (const id of available) {
    if (chosen.length >= count) break;
    if (!chosen.includes(id)) chosen.push(id);
  }
  return chosen;
}

/** The 12-team layout offered as a quick custom choice. */
export const COMPACT_SHAPE: EqualShape = {
  conferences: 2,
  divisionsPerConference: 2,
  teamsPerDivision: 3,
};

export function structureOf(shape: EqualShape): LeagueStructure {
  return equalStructure(
    shape.conferences,
    shape.divisionsPerConference,
    shape.teamsPerDivision,
  );
}

export function initialDraft(): Draft {
  const shape: EqualShape = { ...STANDARD_SHAPE };
  return {
    name: "",
    preset: "standard",
    region: "north-america",
    shape,
    playoffs: defaultPlayoffConfig(structureOf(shape)),
    fantasyDraft: false,
    localPlayers: 1,
    franchiseCities: franchiseCitiesFor("north-america", 1),
  };
}

export type DraftAction =
  | { type: "name"; value: string }
  | { type: "preset"; value: LeaguePreset }
  | { type: "region"; value: Region }
  | { type: "teamCount"; value: number }
  | { type: "shape"; value: EqualShape }
  | { type: "playoffs"; patch: Partial<PlayoffConfig> }
  | { type: "round"; index: number; value: SeriesLength }
  | { type: "allRounds"; value: SeriesLength }
  | { type: "fantasyDraft"; value: boolean }
  | { type: "localPlayers"; value: number }
  | { type: "franchiseCity"; index: number; cityId: string };

export function teamCount(shape: EqualShape): number {
  return (
    shape.conferences * shape.divisionsPerConference * shape.teamsPerDivision
  );
}

/** Changing the structure resets the dependent choices to something valid. */
function withShape(draft: Draft, shape: EqualShape): Draft {
  const structure = structureOf(shape);
  const localPlayers = Math.min(
    draft.localPlayers,
    MAX_LOCAL_PLAYERS,
    totalTeams(structure),
  );
  return {
    ...draft,
    shape,
    playoffs: reconcilePlayoffConfig(structure, draft.playoffs),
    localPlayers,
    franchiseCities: franchiseCitiesFor(
      draft.region,
      localPlayers,
      draft.franchiseCities,
    ),
  };
}

export function draftReducer(draft: Draft, action: DraftAction): Draft {
  switch (action.type) {
    case "name":
      return { ...draft, name: action.value };
    case "region":
      // Cities belong to a region, so the choices start again.
      return {
        ...draft,
        region: action.value,
        franchiseCities: franchiseCitiesFor(action.value, draft.localPlayers),
      };
    case "preset": {
      if (action.value === "standard") {
        return withShape(
          { ...draft, preset: "standard" },
          { ...STANDARD_SHAPE },
        );
      }
      // Leaving the standard layout starts from the compact one, a valid custom shape.
      const shape =
        draft.preset === "standard" ? { ...COMPACT_SHAPE } : draft.shape;
      return withShape({ ...draft, preset: "custom" }, shape);
    }
    case "teamCount": {
      // Prefer two conferences, then divisions close to five teams: the
      // familiar layout. The owner can pick another from the list.
      const shape = [...supportedShapes(action.value)].sort(
        (a, b) =>
          Number(b.conferences === 2) - Number(a.conferences === 2) ||
          Math.abs(a.teamsPerDivision - 5) - Math.abs(b.teamsPerDivision - 5) ||
          a.teamsPerDivision - b.teamsPerDivision,
      )[0];
      return shape ? withShape(draft, shape) : draft;
    }
    case "shape":
      return withShape(draft, action.value);
    case "playoffs":
      return {
        ...draft,
        playoffs: reconcilePlayoffConfig(structureOf(draft.shape), {
          ...draft.playoffs,
          ...action.patch,
        }),
      };
    case "round":
      return {
        ...draft,
        playoffs: {
          ...draft.playoffs,
          roundSeriesLengths: draft.playoffs.roundSeriesLengths.map((n, i) =>
            i === action.index ? action.value : n,
          ),
        },
      };
    case "allRounds":
      return {
        ...draft,
        playoffs: {
          ...draft.playoffs,
          roundSeriesLengths: draft.playoffs.roundSeriesLengths.map(
            () => action.value,
          ),
        },
      };
    case "fantasyDraft":
      return { ...draft, fantasyDraft: action.value };
    case "localPlayers": {
      const localPlayers = Math.max(
        1,
        Math.min(action.value, MAX_LOCAL_PLAYERS, teamCount(draft.shape)),
      );
      return {
        ...draft,
        localPlayers,
        franchiseCities: franchiseCitiesFor(
          draft.region,
          localPlayers,
          draft.franchiseCities,
        ),
      };
    }
    case "franchiseCity": {
      // A city can only be used once.
      const taken = draft.franchiseCities.some(
        (id, i) => i !== action.index && id === action.cityId,
      );
      if (taken || !citiesIn(draft.region).some((c) => c.id === action.cityId))
        return draft;
      return {
        ...draft,
        franchiseCities: draft.franchiseCities.map((id, i) =>
          i === action.index ? action.cityId : id,
        ),
      };
    }
  }
}

export type DraftIssues = { basics: RuleIssue[]; rules: RuleIssue[] };

/** Everything wrong with the draft, split by the step that fixes it. */
export function draftIssues(draft: Draft): DraftIssues {
  const structure = structureOf(draft.shape);
  const basics: RuleIssue[] = [];
  const name = LeagueNameSchema.safeParse(draft.name);
  if (!name.success) {
    basics.push({
      code: "name",
      message: name.error.issues[0]?.message ?? "Give your league a name.",
    });
  }
  basics.push(...validateSupportedStructure(structure));

  const rules = [
    ...validatePlayoffConfig(structure, draft.playoffs),
    ...validateLocalPlayers(
      Array.from({ length: draft.localPlayers }, (_, i) => ({
        slot: i + 1,
        label: null,
      })),
    ),
  ];
  return { basics, rules };
}

/** The stored config this draft would produce (what leagues.config holds). */
export function draftToConfig(draft: Draft): LeagueConfig {
  return {
    schemaVersion: LEAGUE_CONFIG_SCHEMA_VERSION,
    preset: draft.preset,
    region: draft.region,
    fantasyDraft: draft.fantasyDraft,
    playoffs: draft.playoffs,
  };
}

/** "Round 1", "Quarterfinals", "Semifinals", "Finals", counted from the end. */
export function roundName(index: number, rounds: number): string {
  const fromEnd = rounds - 1 - index;
  if (fromEnd === 0) return "Finals";
  if (fromEnd === 1) return "Semifinals";
  if (fromEnd === 2) return "Quarterfinals";
  return `Round ${index + 1}`;
}

export function describeShape(shape: EqualShape): string {
  const c = shape.conferences;
  const d = shape.divisionsPerConference;
  return `${c} ${c === 1 ? "conference" : "conferences"} · ${d} ${d === 1 ? "division" : "divisions"} each · ${shape.teamsPerDivision} teams per division`;
}

/**
 * The create-league request for this draft. The identity seed fixes the
 * generated franchises; the server picks the roster seed itself.
 */
export function draftToRequest(
  draft: Draft,
  identitySeed: string,
): CreateLeagueRequest {
  return {
    name: draft.name.trim(),
    setup: {
      config: draftToConfig(draft),
      shape: draft.shape,
      localPlayers: Array.from({ length: draft.localPlayers }, (_, i) => ({
        slot: i + 1,
        label: null,
      })),
      franchises: draft.franchiseCities.map((cityId, i) => ({
        localPlayerSlot: i + 1,
        cityId,
        aiAssist: { ...NO_AI_ASSIST },
      })),
      identitySeed,
    },
  };
}

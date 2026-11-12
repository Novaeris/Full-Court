/**
 * Owner Mode league settings: structure, playoffs, local players and
 * franchises. Types and plain data only; the rules live in @fullcourt/game-rules.
 *
 * Conferences and divisions are identified by stable ids. `name` is display
 * text and may change without breaking anything that refers to the id.
 */

/** Largest league the game supports. */
export const MAX_LEAGUE_TEAMS = 32;
/** Limits of the configurations supported by the creation flow. */
export const MIN_SUPPORTED_TEAMS = 8;
export const MIN_TEAMS_PER_DIVISION = 2;
export const MIN_DIVISIONS = 2;
export const MAX_CONFERENCES = 4;
export const MAX_LOCAL_PLAYERS = 8;

/** Built-in logos are identified by stable ids, `logo-01`…`logo-24`. */
export const LOGO_COUNT = 24;
export const LOGO_IDS: readonly LogoId[] = Array.from(
  { length: LOGO_COUNT },
  (_, i) => `logo-${String(i + 1).padStart(2, "0")}`,
);

export const REGIONS = [
  "north-america",
  "south-america",
  "europe",
  "asia",
  "australia",
] as const;
export type Region = (typeof REGIONS)[number];

export const REGION_NAMES: Record<Region, string> = {
  "north-america": "North America",
  "south-america": "South America",
  europe: "Europe",
  asia: "Asia",
  australia: "Australia & Oceania",
};

/**
 * Presets chosen at creation. The 12-team "compact" layout is a custom
 * structure, not a preset; `compact` survives only as a legacy league size.
 */
export const LEAGUE_PRESETS = ["standard", "custom"] as const;
export type LeaguePreset = (typeof LEAGUE_PRESETS)[number];

/** Stable, immutable id (a slug such as `c-east`), unique within a league. */
export type ConferenceId = string;
export type DivisionId = string;
/** Stable id of a catalogue city, such as `na-us-nyc`. */
export type CityId = string;
/** Stable id of a built-in logo, such as `logo-01`. */
export type LogoId = string;

export type DivisionSpec = {
  id: DivisionId;
  name: string;
  teamCount: number;
};
export type ConferenceSpec = {
  id: ConferenceId;
  name: string;
  divisions: DivisionSpec[];
};
/**
 * An explicit list, not a formula, so unequal divisions stay representable.
 * What the creation flow currently supports is decided by
 * `validateSupportedStructure`, not by this shape.
 */
export type LeagueStructure = { conferences: ConferenceSpec[] };

export const SERIES_LENGTHS = [3, 5, 7] as const;
export type SeriesLength = (typeof SERIES_LENGTHS)[number];

export const PLAYOFF_SEEDINGS = ["conference", "league"] as const;
export type PlayoffSeeding = (typeof PLAYOFF_SEEDINGS)[number];

export type PlayoffConfig = {
  /** Teams that qualify: a power of two, at most the league size. */
  teams: number;
  seeding: PlayoffSeeding;
  /** Division leaders qualify automatically. */
  autoQualifyDivisionLeaders: boolean;
  /**
   * How many division leaders take the top seeds. `null` seeds every leader
   * ahead of the other qualifiers.
   */
  divisionLeaderTopSeeds: number | null;
  /** Best-of length for each round, first round first. */
  roundSeriesLengths: SeriesLength[];
};

/** Bump when the shape of LeagueConfig changes; mirrored in the database. */
export const LEAGUE_CONFIG_SCHEMA_VERSION = 1;

/**
 * Rules stored in `leagues.config`. Structure, teams and local players live
 * in their own rows and are not repeated here. Leagues created before Owner
 * Mode have no config at all.
 */
export type LeagueConfig = {
  schemaVersion: typeof LEAGUE_CONFIG_SCHEMA_VERSION;
  preset: LeaguePreset;
  region: Region;
  fantasyDraft: boolean;
  playoffs: PlayoffConfig;
};

export const AI_ASSIST_KEYS = [
  "trades",
  "rosterCoverage",
  "rosterManagement",
  "scouting",
  "drafting",
] as const;
export type AiAssistKey = (typeof AI_ASSIST_KEYS)[number];
export type AiAssistFlags = Record<AiAssistKey, boolean>;

export const AI_ASSIST_LABELS: Record<
  AiAssistKey,
  { name: string; description: string }
> = {
  trades: {
    name: "Trades",
    description: "Let the AI propose and accept trades for this franchise.",
  },
  rosterCoverage: {
    name: "Roster coverage",
    description: "Let the AI fill roster spots when players are hurt or short.",
  },
  rosterManagement: {
    name: "Roster and rotation",
    description:
      "Let the AI manage rotations and lineups, and sign free agents and staff.",
  },
  scouting: {
    name: "Scouting",
    description: "Let the AI scout for this franchise.",
  },
  drafting: {
    name: "Drafting",
    description: "Let the AI make this franchise's draft picks.",
  },
};

/** Everything off. */
export const NO_AI_ASSIST: Readonly<AiAssistFlags> = {
  trades: false,
  rosterCoverage: false,
  rosterManagement: false,
  scouting: false,
  drafting: false,
};

/** A local (couch) player, Player 1, Player 2…; `slot` starts at 1. */
export type LocalPlayerSpec = { slot: number; label: string | null };

/** A franchise's identity and control, as chosen in the creation flow. */
export type FranchiseSpec = {
  cityId: CityId;
  nickname: string;
  /** #rrggbb */
  primaryColor: string;
  /** #rrggbb */
  secondaryColor: string;
  logoId: LogoId;
  conferenceId: ConferenceId;
  divisionId: DivisionId;
  /** The local player running it, or null when the AI does. */
  localPlayerSlot: number | null;
  aiAssist: AiAssistFlags;
};

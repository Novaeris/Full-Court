/**
 * Game domain types and constants, shared by every platform. Types and plain
 * data only: no logic beyond tiny guards.
 */

export * from "./owner-mode";
export * from "./season";

/** Basketball positions, in roster order. */
export const POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;
export type Position = (typeof POSITIONS)[number];

export function isPosition(value: string): value is Position {
  return (POSITIONS as readonly string[]).includes(value);
}

export const POSITION_NAMES: Record<Position, string> = {
  PG: "Point guard",
  SG: "Shooting guard",
  SF: "Small forward",
  PF: "Power forward",
  C: "Center",
};

/** Player attributes, each rated 25–99. Order is display order. */
export const RATING_KEYS = [
  "inside",
  "midRange",
  "threePoint",
  "freeThrow",
  "passing",
  "ballHandling",
  "offRebound",
  "defRebound",
  "perimeterD",
  "interiorD",
  "speed",
  "strength",
  "stamina",
] as const;
export type RatingKey = (typeof RATING_KEYS)[number];
export type Ratings = Record<RatingKey, number>;

export const RATING_LABELS: Record<RatingKey, { name: string; short: string }> =
  {
    inside: { name: "Inside scoring", short: "INS" },
    midRange: { name: "Mid-range", short: "MID" },
    threePoint: { name: "Three-point", short: "3PT" },
    freeThrow: { name: "Free throws", short: "FT" },
    passing: { name: "Passing", short: "PAS" },
    ballHandling: { name: "Ball handling", short: "BH" },
    offRebound: { name: "Offensive rebounding", short: "ORB" },
    defRebound: { name: "Defensive rebounding", short: "DRB" },
    perimeterD: { name: "Perimeter defense", short: "PDF" },
    interiorD: { name: "Interior defense", short: "IDF" },
    speed: { name: "Speed", short: "SPD" },
    strength: { name: "Strength", short: "STR" },
    stamina: { name: "Stamina", short: "STA" },
  };

export const RATING_MIN = 25;
export const RATING_MAX = 99;

/** League sizes a player can choose when creating a league. */
export const LEAGUE_SIZES = ["standard", "compact"] as const;
export type LeagueSize = (typeof LEAGUE_SIZES)[number];

export const CONFERENCES = ["East", "West"] as const;
export type Conference = (typeof CONFERENCES)[number];

/** A team as generated, before it has a database id. */
export type TeamSeed = {
  /** Unique within the league; also links players to their team. */
  abbreviation: string;
  city: string;
  nickname: string;
  conference: Conference;
  division: string;
  /** #rrggbb */
  primaryColor: string;
  /** #rrggbb */
  secondaryColor: string;
};

/** A player as generated, before it has a database id. */
export type PlayerSeed = {
  /** The abbreviation of the player's team. */
  team: string;
  firstName: string;
  lastName: string;
  position: Position;
  age: number;
  heightInches: number;
  weightPounds: number;
  jersey: number;
  ratings: Ratings;
  overall: number;
  potential: number;
};

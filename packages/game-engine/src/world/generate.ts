import { invariant } from "@fullcourt/shared";
import {
  CONFERENCES,
  RATING_KEYS,
  type Conference,
  type LeagueSize,
  type PlayerSeed,
  type Position,
  type RatingKey,
  type Ratings,
  type TeamSeed,
} from "@fullcourt/game-types";
import { clampRating, computeOverall } from "@fullcourt/game-rules";
import { normal, pick, shuffle, weighted } from "../rng/helpers";
import { createRng, seedState, type Rng, type RngState } from "../rng/rng";
import {
  CITIES,
  FIRST_NAMES,
  LAST_NAMES,
  NICKNAMES,
  RESERVED_FULL_NAMES,
  TEAM_COLORS,
} from "./names";

/**
 * Generates a brand-new league world: teams, conferences, divisions and full
 * rosters. Pure and deterministic: the same seed and size always produce the
 * same world, on every platform.
 */
export type WorldOptions = { seed: string; size: LeagueSize };

export type GeneratedWorld = {
  teams: TeamSeed[];
  players: PlayerSeed[];
  /** RNG state after generation; later simulation continues from here. */
  rngState: RngState;
};

/** Divisions per conference for each league size. */
export const LEAGUE_LAYOUTS: Record<
  LeagueSize,
  Record<Conference, readonly string[]>
> = {
  standard: {
    East: ["Shoreline", "Heartland", "Northern"],
    West: ["Mountain", "Desert", "Pacific"],
  },
  compact: {
    East: ["Shoreline", "Heartland"],
    West: ["Mountain", "Desert"],
  },
};

export const TEAMS_PER_DIVISION: Record<LeagueSize, number> = {
  standard: 5,
  compact: 3,
};

export const ROSTER_SIZE = 15;

/** Three of each position on every roster. */
const ROSTER_POSITIONS: readonly Position[] = [
  "PG",
  "PG",
  "PG",
  "SG",
  "SG",
  "SG",
  "SF",
  "SF",
  "SF",
  "PF",
  "PF",
  "PF",
  "C",
  "C",
  "C",
];

/**
 * Target overall for each roster slot before the team's strength shift: one
 * star, a few starters, rotation players and the end of the bench.
 */
const SLOT_TARGETS: readonly (readonly [number, number])[] = [
  [79, 5],
  [73, 4],
  [71, 4],
  [68, 3],
  [66, 3],
  [63, 3],
  [61, 3],
  [59, 3],
  [57, 3],
  [55, 3],
  [53, 3],
  [51, 3],
  [49, 3],
  [47, 3],
  [45, 3],
];

/** How each position's attributes sit relative to the player's level. */
const POSITION_PROFILE: Record<Position, Partial<Record<RatingKey, number>>> = {
  PG: {
    passing: 14,
    ballHandling: 14,
    speed: 10,
    threePoint: 5,
    midRange: 3,
    perimeterD: 4,
    inside: -8,
    offRebound: -18,
    defRebound: -12,
    interiorD: -16,
    strength: -12,
  },
  SG: {
    threePoint: 12,
    midRange: 9,
    ballHandling: 5,
    speed: 6,
    perimeterD: 6,
    freeThrow: 4,
    passing: -2,
    offRebound: -14,
    defRebound: -9,
    interiorD: -12,
    strength: -8,
  },
  SF: {
    perimeterD: 6,
    midRange: 3,
    threePoint: 2,
    inside: 2,
    speed: 2,
    defRebound: 0,
    offRebound: -4,
    interiorD: -3,
  },
  PF: {
    inside: 8,
    defRebound: 10,
    offRebound: 8,
    interiorD: 8,
    strength: 10,
    threePoint: -6,
    ballHandling: -9,
    passing: -6,
    speed: -5,
    perimeterD: -4,
  },
  C: {
    inside: 12,
    defRebound: 15,
    offRebound: 14,
    interiorD: 15,
    strength: 14,
    threePoint: -16,
    ballHandling: -16,
    passing: -8,
    speed: -10,
    perimeterD: -10,
    midRange: -8,
    freeThrow: -8,
  },
};

const HEIGHT: Record<Position, readonly [number, number]> = {
  PG: [74, 2],
  SG: [77, 1.6],
  SF: [79, 1.5],
  PF: [81, 1.4],
  C: [83, 1.5],
};

/** Plausible playing weights, in pounds. */
const BODY_WEIGHT = { min: 165, max: 300 } as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function abbreviate(city: string): string[] {
  const words = city
    .toUpperCase()
    .replace(/[^A-Z ]/g, "")
    .split(" ");
  const [a = "", b = ""] = words;
  const at = (word: string, i: number) => word.charAt(i);
  const options = b
    ? [
        at(a, 0) + b.slice(0, 2),
        a.slice(0, 2) + at(b, 0),
        at(a, 0) + at(b, 0) + at(b, 1),
      ]
    : [a.slice(0, 3), at(a, 0) + a.slice(2, 4), at(a, 0) + at(a, 1) + at(a, 3)];
  return options.filter((o) => o.length === 3);
}

function generateTeams(rng: Rng, size: LeagueSize): TeamSeed[] {
  const layout = LEAGUE_LAYOUTS[size];
  const perDivision = TEAMS_PER_DIVISION[size];
  const slots: { conference: Conference; division: string }[] = [];
  for (const conference of CONFERENCES) {
    for (const division of layout[conference]) {
      for (let i = 0; i < perDivision; i++)
        slots.push({ conference, division });
    }
  }
  invariant(slots.length <= CITIES.length, "not enough cities");
  invariant(slots.length <= NICKNAMES.length, "not enough nicknames");
  invariant(slots.length <= TEAM_COLORS.length, "not enough colour pairs");

  const cities = shuffle(rng, CITIES);
  const nicknames = shuffle(rng, NICKNAMES);
  const colors = shuffle(rng, TEAM_COLORS);
  const used = new Set<string>();

  return slots.map((slot, i) => {
    const city = cities[i] as string;
    const abbreviation =
      abbreviate(city).find((option) => !used.has(option)) ??
      `T${String(i).padStart(2, "0")}`;
    used.add(abbreviation);
    const [primaryColor, secondaryColor] = colors[i] as readonly [
      string,
      string,
    ];
    return {
      abbreviation,
      city,
      nickname: nicknames[i] as string,
      conference: slot.conference,
      division: slot.division,
      primaryColor,
      secondaryColor,
    };
  });
}

function generateAge(rng: Rng): number {
  const band = weighted(rng, [
    ["young", 25],
    ["prime", 55],
    ["veteran", 20],
  ] as const);
  if (band === "young") return rng.int(19, 22);
  if (band === "prime") return rng.int(23, 29);
  return rng.int(30, 36);
}

function generatePotential(rng: Rng, age: number, overall: number): number {
  const growth =
    age <= 20
      ? rng.int(8, 22)
      : age <= 22
        ? rng.int(5, 16)
        : age <= 25
          ? rng.int(1, 9)
          : age <= 28
            ? rng.int(0, 3)
            : 0;
  return Math.max(overall, clampRating(overall + growth));
}

function generateRatings(
  rng: Rng,
  position: Position,
  target: number,
): Ratings {
  const profile = POSITION_PROFILE[position];
  const ratings = {} as Ratings;
  for (const key of RATING_KEYS) {
    ratings[key] = clampRating(normal(rng, target + (profile[key] ?? 0), 7));
  }
  // Nudge every attribute so the overall lands on the target.
  const shift = target - computeOverall(position, ratings);
  for (const key of RATING_KEYS) {
    ratings[key] = clampRating(ratings[key] + shift);
  }
  return ratings;
}

function uniqueName(
  rng: Rng,
  taken: Set<string>,
): { firstName: string; lastName: string } {
  for (let attempt = 0; attempt < 200; attempt++) {
    const firstName = pick(rng, FIRST_NAMES);
    const lastName = pick(rng, LAST_NAMES);
    const full = `${firstName} ${lastName}`;
    if (!taken.has(full) && !RESERVED_FULL_NAMES.has(full)) {
      taken.add(full);
      return { firstName, lastName };
    }
  }
  throw new Error("Ran out of unique player names");
}

export function generateWorld(options: WorldOptions): GeneratedWorld {
  const rng = createRng(seedState(options.seed));
  const teams = generateTeams(rng, options.size);
  const players: PlayerSeed[] = [];
  const names = new Set<string>();

  for (const team of teams) {
    const strength = normal(rng, 0, 3.5);
    const targets = shuffle(
      rng,
      SLOT_TARGETS.map(([mean, sd]) => normal(rng, mean + strength, sd)),
    );
    const jerseys = shuffle(
      rng,
      Array.from({ length: 100 }, (_, n) => n),
    ).slice(0, ROSTER_SIZE);

    ROSTER_POSITIONS.forEach((position, slot) => {
      const ratings = generateRatings(rng, position, targets[slot] as number);
      const overall = computeOverall(position, ratings);
      const age = generateAge(rng);
      const [heightMean, heightSd] = HEIGHT[position];
      // Clamped so a rare extreme draw can't produce an implausible body
      // (or break the database's sanity checks).
      const heightInches = clamp(
        Math.round(normal(rng, heightMean, heightSd)),
        heightMean - 5,
        heightMean + 5,
      );
      const weightPounds = clamp(
        Math.round(normal(rng, 215 + (heightInches - 78) * 7.5, 12)),
        BODY_WEIGHT.min,
        BODY_WEIGHT.max,
      );
      players.push({
        team: team.abbreviation,
        ...uniqueName(rng, names),
        position,
        age,
        heightInches,
        weightPounds,
        jersey: jerseys[slot] as number,
        ratings,
        overall,
        potential: generatePotential(rng, age, overall),
      });
    });
  }

  return { teams, players, rngState: rng.state() };
}

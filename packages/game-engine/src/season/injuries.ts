import type { Rng } from "../rng/rng";

/**
 * Injuries (docs/DESIGN.md, "Injuries"). A player can be hurt at any moment a
 * game is played, and the longer he is on the court the likelier it is
 * (`INJURY_RATE_PER_MINUTE`). The game rolls for every player on the court
 * after each trip, takes a hurt player out for the rest of the game, and
 * records the injury; this file decides what the injury is. It keeps him out
 * for some days and doesn't change his ratings.
 */

export type InjurySeverity = "minor" | "moderate" | "major";

/** What an injury is: how long it keeps a player out and what it is called. */
export type InjuryDetails = {
  /** Days he is out, counting from the next day. */
  days: number;
  kind: string;
  severity: InjurySeverity;
};

/** An injury that happened in a game. */
export type Injury = InjuryDetails & {
  playerId: string;
  teamId: string;
};

/** The chance of an injury for each minute on the court: 36 minutes is about 0.6%. */
export const INJURY_RATE_PER_MINUTE = 0.00017;

const SEVERITIES: readonly {
  severity: InjurySeverity;
  /** Share of injuries. */
  share: number;
  min: number;
  max: number;
  kinds: readonly string[];
}[] = [
  {
    severity: "minor",
    share: 0.72,
    min: 1,
    max: 5,
    kinds: [
      "bruised thigh",
      "sore back",
      "jammed finger",
      "tweaked wrist",
      "mild ankle sprain",
      "sore knee",
    ],
  },
  {
    severity: "moderate",
    share: 0.23,
    min: 6,
    max: 20,
    kinds: [
      "strained hamstring",
      "sprained ankle",
      "bruised knee",
      "pulled groin",
      "concussion",
      "strained calf",
    ],
  },
  {
    severity: "major",
    share: 0.05,
    min: 21,
    max: 80,
    kinds: [
      "fractured hand",
      "torn meniscus",
      "stress fracture",
      "torn ligament",
      "broken wrist",
    ],
  },
];

/** What a new injury is. Always three draws, so the rest of a game is unaffected by which. */
export function injuryDetails(rng: Rng): InjuryDetails {
  const kindRoll = rng.next();
  const lengthRoll = rng.next();
  const pickRoll = rng.next();
  let acc = 0;
  let band = SEVERITIES[SEVERITIES.length - 1] as (typeof SEVERITIES)[number];
  for (const s of SEVERITIES) {
    acc += s.share;
    if (acc > kindRoll) {
      band = s;
      break;
    }
  }
  // Shorter injuries are more common than longer ones within a band.
  const span = band.max - band.min + 1;
  return {
    days: band.min + Math.floor(lengthRoll * lengthRoll * span),
    kind: band.kinds[Math.floor(pickRoll * band.kinds.length)] as string,
    severity: band.severity,
  };
}

/** How many healthy players a team always has: below this, injured players play. */
export const MIN_HEALTHY = 8;

/**
 * Who plays for a team: its healthy players, and if there are fewer than
 * `MIN_HEALTHY`, the injured with the fewest days left (ties to the smaller id)
 * come back until there are. Returns the ids that stay out.
 */
export function sitOut(
  roster: readonly { id: string; injuryDays: number }[],
): Set<string> {
  const injured = roster
    .filter((p) => p.injuryDays > 0)
    .sort((a, b) => a.injuryDays - b.injuryDays || (a.id < b.id ? -1 : 1));
  const healthy = roster.length - injured.length;
  const back = Math.max(0, Math.min(injured.length, MIN_HEALTHY - healthy));
  return new Set(injured.slice(back).map((p) => p.id));
}

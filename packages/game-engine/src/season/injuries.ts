import type { Rng } from "../rng/rng";

/**
 * Injuries (docs/DESIGN.md, "Injuries"). They are rolled once a day, after the
 * day's games, from the minutes each player played: the more a player is on
 * the court, the likelier he is to be hurt. An injury keeps him out for some
 * days; it doesn't change his ratings.
 */

export type InjurySeverity = "minor" | "moderate" | "major";

/** What a player who played that day is rolled for. */
export type InjuryCandidate = {
  playerId: string;
  teamId: string;
  minutes: number;
};

export type Injury = {
  playerId: string;
  teamId: string;
  /** Days he is out, counting from the next day. */
  days: number;
  kind: string;
  severity: InjurySeverity;
};

/** The chance of an injury for each minute played: 36 minutes is about 0.6%. */
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

/**
 * The injuries of one day. `played` is everyone who took the court; the order
 * doesn't matter (candidates are rolled by player id), so the same day and
 * seed always give the same injuries.
 */
export function rollInjuries(
  rng: Rng,
  played: readonly InjuryCandidate[],
): Injury[] {
  const out: Injury[] = [];
  const ordered = [...played].sort((a, b) =>
    a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0,
  );
  for (const p of ordered) {
    // Every candidate uses the same number of draws whether hurt or not, so one
    // player's result never moves another's.
    const hurt = rng.next() < Math.max(0, p.minutes) * INJURY_RATE_PER_MINUTE;
    const kindRoll = rng.next();
    const lengthRoll = rng.next();
    const pickRoll = rng.next();
    if (!hurt) continue;
    let acc = 0;
    const band =
      SEVERITIES.find((s) => (acc += s.share) > kindRoll) ??
      (SEVERITIES[SEVERITIES.length - 1] as (typeof SEVERITIES)[number]);
    // Shorter injuries are more common than longer ones within a band.
    const span = band.max - band.min + 1;
    const days = band.min + Math.floor(lengthRoll * lengthRoll * span);
    const kind = band.kinds[Math.floor(pickRoll * band.kinds.length)] as string;
    out.push({
      playerId: p.playerId,
      teamId: p.teamId,
      days,
      kind,
      severity: band.severity,
    });
  }
  return out;
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

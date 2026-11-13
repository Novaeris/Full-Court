import type { PlayEvent } from "@fullcourt/game-types";

/** Plain text for the play feed: "J. Smith makes a three-pointer (assist: K. Lee)". */
export type NameOf = (playerId: string | null) => string;

const LAYUPS = ["layup", "driving layup", "dunk", "finger roll"] as const;

function shotWords(play: PlayEvent): string {
  switch (play.shotZone) {
    case "three":
      return "three-pointer";
    case "mid-range":
      return "mid-range jumper";
    default:
      // Vary the wording without randomness: the same play always reads the same.
      return LAYUPS[play.seq % LAYUPS.length] as string;
  }
}

/** One line describing a play. Deterministic: the same play always gives the same words. */
export function describePlay(play: PlayEvent, nameOf: NameOf): string {
  const who = nameOf(play.playerId);
  const fastBreak = play.transition ? " on the fast break" : "";
  switch (play.kind) {
    case "period-start":
      return play.period <= 4
        ? `Start of period ${play.period}`
        : `Start of overtime${play.period > 5 ? ` ${play.period - 4}` : ""}`;
    case "period-end":
      return play.period <= 4
        ? `End of period ${play.period}`
        : `End of overtime${play.period > 5 ? ` ${play.period - 4}` : ""}`;
    case "made-shot": {
      const assist = play.assistPlayerId
        ? ` (assist: ${nameOf(play.assistPlayerId)})`
        : "";
      return `${who} makes a ${shotWords(play)}${fastBreak}${assist}`;
    }
    case "missed-shot": {
      const block = play.blockPlayerId
        ? ` (block: ${nameOf(play.blockPlayerId)})`
        : "";
      return `${who} misses a ${shotWords(play)}${fastBreak}${block}`;
    }
    case "free-throw":
      return `${who} ${play.made ? "makes" : "misses"} a free throw`;
    case "rebound":
      return `${who} grabs the ${play.offensive ? "offensive" : "defensive"} rebound`;
    case "turnover": {
      const steal = play.stealPlayerId
        ? ` (steal: ${nameOf(play.stealPlayerId)})`
        : "";
      return `${who} turns the ball over${steal}`;
    }
    case "foul":
      return `${who} commits a foul`;
    case "substitution":
      return `${who} enters for ${nameOf(play.outPlayerId)}`;
    default:
      return "";
  }
}

/** True for the plays worth listing in a short feed (everything but substitutions and rebounds). */
export function isKeyPlay(play: PlayEvent): boolean {
  return (
    play.kind === "made-shot" ||
    play.kind === "missed-shot" ||
    play.kind === "turnover" ||
    (play.kind === "free-throw" && play.made === true)
  );
}

/** "11:42" for 702 seconds. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "Q3", or "OT" and "2OT" for overtimes. */
export function periodLabel(period: number): string {
  if (period <= 4) return `Q${period}`;
  return period === 5 ? "OT" : `${period - 4}OT`;
}

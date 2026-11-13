import type { PlayEvent } from "@fullcourt/game-types";
import { describe, expect, it } from "vitest";
import { describePlay, formatClock, isKeyPlay, periodLabel } from "./describe";

const names: Record<string, string> = {
  a: "J. Smith",
  b: "K. Lee",
  c: "M. Cruz",
};
const nameOf = (id: string | null) => (id ? (names[id] ?? "Someone") : "");

function play(over: Partial<PlayEvent>): PlayEvent {
  return {
    gameId: "g",
    seq: 1,
    period: 1,
    clock: 600,
    kind: "made-shot",
    teamId: "t",
    playerId: "a",
    assistPlayerId: null,
    blockPlayerId: null,
    stealPlayerId: null,
    outPlayerId: null,
    shotZone: null,
    made: null,
    offensive: null,
    points: 0,
    homeScore: 0,
    awayScore: 0,
    transition: false,
    at: null,
    ...over,
  };
}

describe("describePlay", () => {
  it("describes shots, with assists, blocks and fast breaks", () => {
    expect(
      describePlay(
        play({ shotZone: "three", assistPlayerId: "b", points: 3 }),
        nameOf,
      ),
    ).toBe("J. Smith makes a three-pointer (assist: K. Lee)");
    expect(
      describePlay(
        play({
          kind: "missed-shot",
          shotZone: "mid-range",
          blockPlayerId: "c",
        }),
        nameOf,
      ),
    ).toBe("J. Smith misses a mid-range jumper (block: M. Cruz)");
    expect(
      describePlay(
        play({ shotZone: "inside", transition: true, seq: 1 }),
        nameOf,
      ),
    ).toBe("J. Smith makes a driving layup on the fast break");
  });

  it("always words the same play the same way", () => {
    const p = play({ shotZone: "inside", seq: 7 });
    expect(describePlay(p, nameOf)).toBe(describePlay({ ...p }, nameOf));
  });

  it("describes the rest of the game", () => {
    expect(describePlay(play({ kind: "free-throw", made: true }), nameOf)).toBe(
      "J. Smith makes a free throw",
    );
    expect(
      describePlay(play({ kind: "free-throw", made: false }), nameOf),
    ).toBe("J. Smith misses a free throw");
    expect(
      describePlay(play({ kind: "rebound", offensive: true }), nameOf),
    ).toBe("J. Smith grabs the offensive rebound");
    expect(
      describePlay(play({ kind: "turnover", stealPlayerId: "b" }), nameOf),
    ).toBe("J. Smith turns the ball over (steal: K. Lee)");
    expect(describePlay(play({ kind: "foul" }), nameOf)).toBe(
      "J. Smith commits a foul",
    );
    expect(
      describePlay(
        play({ kind: "substitution", playerId: "b", outPlayerId: "a" }),
        nameOf,
      ),
    ).toBe("K. Lee enters for J. Smith");
  });

  it("describes the start and end of periods and overtimes", () => {
    const at = (kind: PlayEvent["kind"], period: number) =>
      describePlay(play({ kind, period, playerId: null }), nameOf);
    expect(at("period-start", 1)).toBe("Start of period 1");
    expect(at("period-end", 4)).toBe("End of period 4");
    expect(at("period-start", 5)).toBe("Start of overtime");
    expect(at("period-end", 6)).toBe("End of overtime 2");
  });
});

describe("feed helpers", () => {
  it("picks out the key plays", () => {
    expect(isKeyPlay(play({ kind: "made-shot" }))).toBe(true);
    expect(isKeyPlay(play({ kind: "turnover" }))).toBe(true);
    expect(isKeyPlay(play({ kind: "free-throw", made: true }))).toBe(true);
    expect(isKeyPlay(play({ kind: "free-throw", made: false }))).toBe(false);
    expect(isKeyPlay(play({ kind: "rebound" }))).toBe(false);
    expect(isKeyPlay(play({ kind: "substitution" }))).toBe(false);
  });

  it("formats the clock and the period", () => {
    expect(formatClock(702)).toBe("11:42");
    expect(formatClock(5)).toBe("0:05");
    expect(formatClock(-3)).toBe("0:00");
    expect([1, 4, 5, 6].map(periodLabel)).toEqual(["Q1", "Q4", "OT", "2OT"]);
  });
});

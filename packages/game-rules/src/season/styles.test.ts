import { describe, expect, it } from "vitest";
import {
  STYLE_PLAYERS,
  describeStyle,
  STYLE_THRESHOLDS,
  chooseTeamStrategy,
  type StylePlayer,
} from "./styles";

const player = (over: Partial<StylePlayer> = {}): StylePlayer => ({
  overall: 70,
  threePoint: 63,
  speed: 63,
  stamina: 63,
  perimeterD: 63,
  interiorD: 62,
  ...over,
});
const team = (over: Partial<StylePlayer> = {}, n = 10) =>
  Array.from({ length: n }, () => player(over));

describe("chooseTeamStrategy", () => {
  it("plays the usual way when nothing stands out", () => {
    expect(chooseTeamStrategy(team())).toEqual({
      pace: "normal",
      threePointFocus: "normal",
      defense: "balanced",
    });
  });

  it("runs when it is quick and fit, and slows down when it isn't", () => {
    expect(chooseTeamStrategy(team({ speed: 72, stamina: 70 })).pace).toBe(
      "fast",
    );
    expect(chooseTeamStrategy(team({ speed: 55, stamina: 58 })).pace).toBe(
      "slow",
    );
    // Quick but not fit enough: the two are averaged.
    expect(chooseTeamStrategy(team({ speed: 75, stamina: 52 })).pace).toBe(
      "normal",
    );
  });

  it("shoots threes when it has the shooters, and avoids them when it doesn't", () => {
    expect(chooseTeamStrategy(team({ threePoint: 72 })).threePointFocus).toBe(
      "high",
    );
    expect(chooseTeamStrategy(team({ threePoint: 54 })).threePointFocus).toBe(
      "low",
    );
  });

  it("defends where it is strongest", () => {
    expect(
      chooseTeamStrategy(team({ perimeterD: 72, interiorD: 58 })).defense,
    ).toBe("perimeter");
    expect(
      chooseTeamStrategy(team({ perimeterD: 58, interiorD: 70 })).defense,
    ).toBe("interior");
  });

  it("is decided by the best eight, not the bench", () => {
    const starters = team({ overall: 80, threePoint: 72 }, STYLE_PLAYERS);
    const bench = team({ overall: 50, threePoint: 40 }, 7);
    expect(chooseTeamStrategy([...starters, ...bench]).threePointFocus).toBe(
      "high",
    );
    expect(chooseTeamStrategy([...bench, ...starters]).threePointFocus).toBe(
      "high",
    );
  });

  it("changes exactly at the thresholds", () => {
    const at = STYLE_THRESHOLDS.threes.high;
    expect(chooseTeamStrategy(team({ threePoint: at })).threePointFocus).toBe(
      "high",
    );
    expect(
      chooseTeamStrategy(team({ threePoint: at - 0.1 })).threePointFocus,
    ).toBe("normal");
  });

  it("doesn't depend on the order when players tie at the cutoff of eight", () => {
    // Ten players with the same overall: which eight count is decided by their
    // ratings, not by where they stand in the list.
    const roster = Array.from({ length: 10 }, (_, i) =>
      player({
        overall: 70,
        threePoint: 55 + i * 3,
        perimeterD: 60,
        interiorD: 70 - i * 2,
      }),
    );
    const orders = [
      roster,
      [...roster].reverse(),
      [...roster.slice(5), ...roster.slice(0, 5)],
      [...roster].sort((a, b) => a.interiorD - b.interiorD),
    ];
    const results = orders.map((o) => chooseTeamStrategy(o));
    for (const r of results) expect(r).toEqual(results[0]);
  });

  it("plays the usual way with too few players to judge", () => {
    expect(chooseTeamStrategy(team({ threePoint: 90 }, 4))).toEqual({
      pace: "normal",
      threePointFocus: "normal",
      defense: "balanced",
    });
  });

  it("is the same for the same roster in any order", () => {
    const roster = Array.from({ length: 12 }, (_, i) =>
      player({ overall: 60 + i, threePoint: 50 + i * 2, speed: 55 + i }),
    );
    expect(chooseTeamStrategy(roster)).toEqual(
      chooseTeamStrategy([...roster].reverse()),
    );
  });
});

describe("describeStyle", () => {
  const style = (
    pace: "slow" | "normal" | "fast",
    threePointFocus: "low" | "normal" | "high",
    defense: "balanced" | "perimeter" | "interior",
  ) => ({ pace, threePointFocus, defense });

  it("says a usual style is balanced", () => {
    expect(describeStyle(style("normal", "normal", "balanced"))).toBe(
      "Plays a balanced game.",
    );
  });

  it("lists what a team leans on, in a sentence", () => {
    expect(describeStyle(style("fast", "normal", "balanced"))).toBe(
      "Runs the floor.",
    );
    expect(describeStyle(style("fast", "high", "balanced"))).toBe(
      "Runs the floor and shoots a lot of threes.",
    );
    expect(describeStyle(style("fast", "high", "perimeter"))).toBe(
      "Runs the floor, shoots a lot of threes and pressures the perimeter.",
    );
    expect(describeStyle(style("slow", "low", "interior"))).toBe(
      "Slows the game down, works inside for its shots and protects the paint.",
    );
  });
});

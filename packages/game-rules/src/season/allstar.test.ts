import { describe, expect, it } from "vitest";
import type { AwardLine } from "./awards";
import {
  ALL_STARS,
  SQUAD_SIZE,
  allStarDay,
  allStarMvp,
  pickAllStars,
} from "./allstar";

const line = (id: string, points: number, games = 20): AwardLine => ({
  playerId: id,
  teamId: "t",
  position: "SF",
  games,
  started: games,
  minutes: games * 30,
  points: points * games,
  rebounds: 0,
  assists: 0,
  steals: 0,
  blocks: 0,
  turnovers: 0,
  fgm: 0,
  fga: 0,
  ftm: 0,
  fta: 0,
  rookie: false,
});
const field = (n: number, games = 20) =>
  Array.from({ length: n }, (_, i) =>
    line(`p${String(i).padStart(2, "0")}`, 40 - i, games),
  );

describe("allStarDay", () => {
  it("is half way through the season, and never the first day", () => {
    expect(allStarDay(60)).toBe(30);
    expect(allStarDay(31)).toBe(15);
    expect(allStarDay(1)).toBe(2);
  });
});

describe("pickAllStars", () => {
  it("picks the best 24, two even squads, the top two as captains", () => {
    const squads = pickAllStars(field(40)) as NonNullable<
      ReturnType<typeof pickAllStars>
    >;
    expect(squads.a).toHaveLength(SQUAD_SIZE);
    expect(squads.b).toHaveLength(SQUAD_SIZE);
    expect(squads.captainA).toBe("p00");
    expect(squads.captainB).toBe("p01");
    const everyone = [...squads.a, ...squads.b].sort();
    expect(everyone).toEqual(
      field(ALL_STARS)
        .map((l) => l.playerId)
        .sort(),
    );
    expect(new Set(everyone).size).toBe(ALL_STARS);
    // The captains lead their own squads, and the best player is on squad A.
    expect(squads.a[0]).toBe("p00");
    expect(squads.b[0]).toBe("p01");
  });

  it("drafts so the squads are about equal in strength", () => {
    const lines = field(30);
    const squads = pickAllStars(lines) as NonNullable<
      ReturnType<typeof pickAllStars>
    >;
    const strength = (ids: string[]) =>
      ids.reduce(
        (s, id) => s + (lines.find((l) => l.playerId === id)?.points ?? 0),
        0,
      );
    const gap = Math.abs(strength(squads.a) - strength(squads.b));
    // A snake draft is within a pick or two of even.
    expect(gap).toBeLessThan(20 * 3);
  });

  it("leaves out players who have played too few games", () => {
    const lines = [line("star-but-hurt", 99, 3), ...field(30, 20)];
    const squads = pickAllStars(lines) as NonNullable<
      ReturnType<typeof pickAllStars>
    >;
    expect([...squads.a, ...squads.b]).not.toContain("star-but-hurt");
  });

  it("is the same every time, whatever the order, with ties to the smaller id", () => {
    const lines = field(30).map((l) => ({ ...l, points: 400 }));
    const one = pickAllStars(lines);
    const two = pickAllStars([...lines].reverse());
    expect(one).toEqual(two);
    expect(one?.captainA).toBe("p00");
  });

  it("is null when there are not enough players for two squads", () => {
    expect(pickAllStars(field(23))).toBeNull();
    expect(pickAllStars([])).toBeNull();
  });
});

describe("allStarMvp", () => {
  const l = (id: string, points: number, rebounds = 0, turnovers = 0) => ({
    playerId: id,
    points,
    rebounds,
    assists: 0,
    steals: 0,
    blocks: 0,
    turnovers,
  });

  it("is the best line of the winners, counting more than points", () => {
    expect(allStarMvp([l("a", 20), l("b", 14, 12), l("c", 18, 1, 6)])).toBe(
      "b",
    );
  });

  it("breaks a tie by the smaller id, and is null with nobody", () => {
    expect(allStarMvp([l("z", 10), l("m", 10)])).toBe("m");
    expect(allStarMvp([])).toBeNull();
  });
});

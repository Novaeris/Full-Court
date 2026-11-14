import { describe, expect, it } from "vitest";
import {
  RIVALRY_PLAYOFF_GAMES,
  headToHead,
  isRivalry,
  type FinishedGame,
} from "./headtohead";

const game = (over: Partial<FinishedGame>): FinishedGame => ({
  home: "a",
  away: "b",
  homeScore: 100,
  awayScore: 90,
  playoff: false,
  year: 2030,
  day: 1,
  ...over,
});

describe("headToHead", () => {
  it("counts wins and losses from the team's side, home or away", () => {
    const games = [
      game({}),
      game({ home: "b", away: "a", homeScore: 95, awayScore: 99 }),
      game({ homeScore: 80, awayScore: 85 }),
    ];
    const [vsB] = headToHead(games, "a");
    expect(vsB?.opponentId).toBe("b");
    expect(vsB?.regular).toEqual({ wins: 2, losses: 1 });
    // The same games from the other side are the mirror image.
    expect(headToHead(games, "b")[0]?.regular).toEqual({ wins: 1, losses: 2 });
  });

  it("keeps the playoffs apart from the regular season", () => {
    const [r] = headToHead(
      [
        game({}),
        game({ playoff: true }),
        game({ playoff: true, homeScore: 1 }),
      ],
      "a",
    );
    expect(r?.regular).toEqual({ wins: 1, losses: 0 });
    expect(r?.playoffs).toEqual({ wins: 1, losses: 1 });
  });

  it("remembers the latest meeting, by season and then day", () => {
    const [r] = headToHead(
      [
        game({ year: 2031, day: 3, homeScore: 70, awayScore: 71 }),
        game({ year: 2032, day: 1, homeScore: 101, awayScore: 99 }),
        game({ year: 2032, day: 9, homeScore: 88, awayScore: 90 }),
        game({ year: 2030, day: 50 }),
      ],
      "a",
    );
    expect(r?.last).toEqual({
      year: 2032,
      won: false,
      score: "88-90",
      playoff: false,
    });
  });

  it("lists the opponent met most first, and leaves out games that don't involve the team", () => {
    const games = [
      game({ away: "c" }),
      game({}),
      game({}),
      game({ home: "x", away: "y" }),
    ];
    expect(headToHead(games, "a").map((r) => r.opponentId)).toEqual(["b", "c"]);
  });

  it("is the same whatever order the games come in", () => {
    const games = [
      game({ year: 2030, day: 1 }),
      game({ year: 2031, day: 2, awayScore: 120 }),
      game({ away: "c", year: 2030, day: 5, playoff: true }),
    ];
    expect(headToHead([...games].reverse(), "a")).toEqual(
      headToHead(games, "a"),
    );
  });
});

describe("isRivalry", () => {
  it("takes about a series of playoff games", () => {
    expect(isRivalry(RIVALRY_PLAYOFF_GAMES - 1)).toBe(false);
    expect(isRivalry(RIVALRY_PLAYOFF_GAMES)).toBe(true);
    const games = Array.from({ length: RIVALRY_PLAYOFF_GAMES }, () =>
      game({ playoff: true }),
    );
    expect(headToHead(games, "a")[0]?.rival).toBe(true);
    expect(headToHead(games.slice(1), "a")[0]?.rival).toBe(false);
  });
});

import { DEFAULT_SCHEDULE_TIERS } from "@fullcourt/game-types";
import { describe, expect, it } from "vitest";
import { attacksRight } from "./court";
import { equalStructure } from "../owner-mode/structure";
import {
  gamesForTeam,
  matchupTier,
  opponentCounts,
  schedulePresetLengths,
  seasonLength,
  validateScheduleTiers,
} from "./schedule";
import {
  buildStandings,
  rankStandings,
  type FinalGameResult,
} from "./standings";

const standard = equalStructure(2, 3, 5);

describe("schedule rules", () => {
  it("counts opponents by tier for the standard league", () => {
    expect(opponentCounts(standard, "c-1", "d-1-1")).toEqual({
      division: 4,
      conference: 10,
      interconference: 15,
    });
  });

  it("derives the default season length", () => {
    expect(gamesForTeam(standard, DEFAULT_SCHEDULE_TIERS, "c-1", "d-1-1")).toBe(
      76,
    );
    expect(seasonLength(standard, DEFAULT_SCHEDULE_TIERS)).toBe(76);
  });

  it("returns null when divisions would play different numbers of games", () => {
    const uneven = {
      conferences: [
        {
          id: "a",
          name: "A",
          divisions: [
            { id: "a1", name: "A1", teamCount: 3 },
            { id: "a2", name: "A2", teamCount: 5 },
          ],
        },
      ],
    };
    expect(seasonLength(uneven, DEFAULT_SCHEDULE_TIERS)).toBeNull();
    expect(
      validateScheduleTiers(uneven, DEFAULT_SCHEDULE_TIERS).map((i) => i.code),
    ).toContain("uneven_season");
  });

  it("rejects out-of-range tier counts", () => {
    const issues = validateScheduleTiers(standard, {
      division: 0,
      conference: 2.5,
      interconference: 9,
    });
    expect(issues.map((i) => i.code)).toEqual([
      "invalid_division_games",
      "invalid_conference_games",
      "invalid_interconference_games",
    ]);
    expect(validateScheduleTiers(standard, DEFAULT_SCHEDULE_TIERS)).toEqual([]);
  });

  it("classifies matchups", () => {
    const a = { teamId: "a", conferenceId: "c1", divisionId: "d1" };
    expect(matchupTier(a, { ...a, teamId: "b" })).toBe("division");
    expect(matchupTier(a, { ...a, teamId: "b", divisionId: "d2" })).toBe(
      "conference",
    );
    expect(
      matchupTier(a, {
        teamId: "b",
        conferenceId: "c2",
        divisionId: "d3",
      }),
    ).toBe("interconference");
  });
});

describe("rankStandings", () => {
  const teams = [
    { teamId: "a", conferenceId: "c1", divisionId: "d1" },
    { teamId: "b", conferenceId: "c1", divisionId: "d1" },
    { teamId: "c", conferenceId: "c1", divisionId: "d2" },
    { teamId: "d", conferenceId: "c2", divisionId: "d3" },
  ];
  const game = (
    homeTeamId: string,
    awayTeamId: string,
    homeScore: number,
    awayScore: number,
  ): FinalGameResult => ({ homeTeamId, awayTeamId, homeScore, awayScore });

  it("orders by win percentage and tallies records", () => {
    const rows = rankStandings(teams, [
      game("a", "b", 100, 90),
      game("a", "c", 100, 90),
      game("d", "b", 100, 90),
    ]);
    expect(rows.map((r) => r.teamId)).toEqual(["a", "d", "c", "b"]);
    const a = rows[0]!;
    expect(a).toMatchObject({
      wins: 2,
      losses: 0,
      winPct: 1,
      divisionWins: 1,
      conferenceWins: 2,
      pointsFor: 200,
      pointsAgainst: 180,
    });
  });

  it("breaks a tie by head-to-head record", () => {
    // a and b both 1-1; b beat a.
    const rows = rankStandings(teams.slice(0, 2), [
      game("a", "b", 90, 100),
      game("b", "a", 80, 120),
    ]);
    expect(rows.map((r) => r.teamId)).toEqual(["a", "b"]);
    // now b wins the series
    const flipped = rankStandings(teams.slice(0, 2), [
      game("a", "b", 90, 100),
      game("b", "a", 100, 90),
      game("a", "b", 100, 90),
      game("b", "a", 100, 90),
    ]);
    expect(flipped.map((r) => r.teamId)).toEqual(["b", "a"]);
  });

  it("falls back to point differential, then team id", () => {
    // No games between a and d, both 1-0, a won by more.
    const byDiff = rankStandings(teams, [
      game("a", "c", 110, 90),
      game("d", "c", 100, 95),
    ]);
    expect(byDiff.map((r) => r.teamId)).toEqual(["a", "d", "b", "c"]);

    const noGames = rankStandings([teams[1]!, teams[0]!], []);
    expect(noGames.map((r) => r.teamId)).toEqual(["a", "b"]);
  });

  it("is independent of game order", () => {
    const games = [
      game("a", "b", 100, 90),
      game("b", "c", 100, 90),
      game("c", "a", 100, 90),
      game("d", "a", 100, 99),
    ];
    const forward = rankStandings(teams, games).map((r) => r.teamId);
    const backward = rankStandings(teams, [...games].reverse()).map(
      (r) => r.teamId,
    );
    expect(forward).toEqual(backward);
  });

  it("rejects ties, unknown teams and self-play", () => {
    expect(() => rankStandings(teams, [game("a", "b", 90, 90)])).toThrow(/tie/);
    expect(() => rankStandings(teams, [game("a", "z", 90, 80)])).toThrow(
      /unknown/,
    );
    expect(() => rankStandings(teams, [game("a", "a", 90, 80)])).toThrow(
      /itself/,
    );
  });
});

describe("schedule presets", () => {
  it("gives the standard league 43, 76 and 86 games", () => {
    expect(schedulePresetLengths(standard)).toEqual({
      short: 43,
      standard: 76,
      long: 86,
    });
  });
});

describe("attacksRight", () => {
  it("swaps baskets after the first half and keeps them in overtime", () => {
    expect([1, 2, 3, 4, 5, 6].map((p) => attacksRight(p, true))).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
    for (const period of [1, 2, 3, 4, 5]) {
      expect(attacksRight(period, true)).not.toBe(attacksRight(period, false));
    }
  });
});

describe("buildStandings", () => {
  const teams = [
    { teamId: "a", conferenceId: "c1", divisionId: "d1" },
    { teamId: "b", conferenceId: "c1", divisionId: "d1" },
    { teamId: "c", conferenceId: "c1", divisionId: "d2" },
  ];
  // a beats b (home), a beats c (away), b beats c (home), b beats a (away), a loses to c at home.
  const games = [
    { day: 1, homeTeamId: "a", awayTeamId: "b", homeScore: 100, awayScore: 90 },
    { day: 2, homeTeamId: "c", awayTeamId: "a", homeScore: 80, awayScore: 85 },
    { day: 3, homeTeamId: "b", awayTeamId: "c", homeScore: 99, awayScore: 70 },
    {
      day: 4,
      homeTeamId: "b",
      awayTeamId: "a",
      homeScore: 101,
      awayScore: 100,
    },
    { day: 5, homeTeamId: "a", awayTeamId: "c", homeScore: 90, awayScore: 95 },
  ];
  const rows = buildStandings(teams, games);
  const row = (id: string) => rows.find((r) => r.teamId === id);

  it("ranks teams and adds home and away records", () => {
    expect(rows.map((r) => [r.teamId, r.rank])).toEqual([
      ["b", 1],
      ["a", 2],
      ["c", 3],
    ]);
    // a: 2-2 (wins at home on day 1 and away on day 2; loses on the road on day 4 and at home on day 5)
    expect(row("a")).toMatchObject({
      wins: 2,
      losses: 2,
      homeWins: 1,
      homeLosses: 1,
      awayWins: 1,
      awayLosses: 1,
    });
    expect(row("c")).toMatchObject({
      wins: 1,
      losses: 2,
      homeWins: 0,
      homeLosses: 1,
    });
  });

  it("works out streaks and the last ten games", () => {
    expect(row("a")?.streak).toBe("L2");
    expect(row("c")?.streak).toBe("W1");
    expect(row("b")?.streak).toBe("W2");
    expect(row("a")?.lastTen).toBe("2-2");
  });

  it("copes with a team that hasn't played", () => {
    const fresh = buildStandings(teams, []);
    expect(fresh).toHaveLength(3);
    expect(fresh.every((r) => r.streak === "" && r.lastTen === "0-0")).toBe(
      true,
    );
  });

  it("limits the last ten to ten games", () => {
    const many = Array.from({ length: 14 }, (_, i) => ({
      day: i + 1,
      homeTeamId: "a",
      awayTeamId: "b",
      homeScore: i < 4 ? 80 : 100,
      awayScore: 90,
    }));
    const result = buildStandings(teams, many);
    expect(result.find((r) => r.teamId === "a")?.lastTen).toBe("10-0");
    expect(result.find((r) => r.teamId === "a")?.streak).toBe("W10");
  });
});

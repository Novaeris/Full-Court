import { describe, expect, it } from "vitest";
import {
  SCHEDULE_PRESET_TIERS,
  type PlayoffConfig,
} from "@fullcourt/game-types";
import {
  STANDARD_SCHEDULE,
  samePlayoffs,
  sameSchedule,
  scheduleFor,
  scheduleGames,
  seasonRulesIssues,
} from "./season-rules";
import { defaultPlayoffConfig } from "./playoffs";
import { standardStructure } from "./setup";
import { equalStructure } from "./structure";

const standard = standardStructure();
const small = equalStructure(2, 2, 3);

describe("scheduleFor", () => {
  it("gives each preset its own tiers, and custom what it is given", () => {
    expect(scheduleFor("short").tiers).toEqual(SCHEDULE_PRESET_TIERS.short);
    expect(scheduleFor("long").preset).toBe("long");
    expect(
      scheduleFor("custom", { division: 3, conference: 3, interconference: 1 })
        .tiers,
    ).toEqual({ division: 3, conference: 3, interconference: 1 });
    expect(STANDARD_SCHEDULE).toEqual(scheduleFor("standard"));
  });
});

describe("scheduleGames", () => {
  it("is the season length for the league's shape", () => {
    expect(scheduleGames(standard, scheduleFor("short"))).toBe(43);
    expect(scheduleGames(standard, scheduleFor("standard"))).toBe(76);
    expect(scheduleGames(standard, scheduleFor("long"))).toBe(86);
  });

  it("is null when teams can't all play the same number of games", () => {
    // One division bigger than the others: its teams meet more opponents.
    const uneven = equalStructure(2, 2, 3);
    uneven.conferences[0]!.divisions[0]!.teamCount = 5;
    expect(scheduleGames(uneven, scheduleFor("standard"))).toBeNull();
    expect(
      seasonRulesIssues(
        uneven,
        scheduleFor("standard"),
        defaultPlayoffConfig(uneven),
      ).map((i) => i.code),
    ).toContain("uneven_season");
  });
});

describe("sameSchedule and samePlayoffs", () => {
  it("compare the rules, not the objects", () => {
    expect(sameSchedule(scheduleFor("short"), scheduleFor("short"))).toBe(true);
    expect(sameSchedule(scheduleFor("short"), scheduleFor("long"))).toBe(false);
    const p = defaultPlayoffConfig(standard);
    expect(samePlayoffs(p, { ...p })).toBe(true);
    expect(samePlayoffs(p, { ...p, teams: p.teams === 8 ? 4 : 8 })).toBe(false);
  });
});

describe("seasonRulesIssues", () => {
  const playoffs = defaultPlayoffConfig(standard);

  it("accepts the presets and a good playoff format", () => {
    for (const preset of ["short", "standard", "long"] as const) {
      expect(
        seasonRulesIssues(standard, scheduleFor(preset), playoffs),
      ).toEqual([]);
    }
  });

  it("refuses a named preset carrying other tiers", () => {
    const issues = seasonRulesIssues(
      standard,
      { preset: "short", tiers: SCHEDULE_PRESET_TIERS.long },
      playoffs,
    );
    expect(issues.map((i) => i.code)).toContain("preset_tiers_mismatch");
  });

  it("refuses game counts outside 1 to 8, and an uneven season", () => {
    expect(
      seasonRulesIssues(
        standard,
        scheduleFor("custom", {
          division: 9,
          conference: 2,
          interconference: 1,
        }),
        playoffs,
      ).map((i) => i.code),
    ).toContain("invalid_division_games");
  });

  it("refuses a playoff format the league can't hold", () => {
    const tooMany: PlayoffConfig = { ...playoffs, teams: 32 };
    expect(
      seasonRulesIssues(small, scheduleFor("standard"), tooMany).length,
    ).toBeGreaterThan(0);
    const notPower = { ...playoffs, teams: 6 } as PlayoffConfig;
    expect(
      seasonRulesIssues(standard, scheduleFor("standard"), notPower).map(
        (i) => i.code,
      ),
    ).toContain("playoff_teams_power");
  });
});

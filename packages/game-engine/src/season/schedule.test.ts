import { equalStructure, seasonLength } from "@fullcourt/game-rules";
import {
  DEFAULT_SCHEDULE_TIERS,
  SCHEDULE_PRESET_TIERS,
} from "@fullcourt/game-types";
import { describe, expect, it } from "vitest";
import { createRng, seedState } from "../rng/rng";
import { generateSchedule } from "./schedule";

function league(conferences: number, divisions: number, perDivision: number) {
  const structure = equalStructure(conferences, divisions, perDivision);
  const teams = structure.conferences.flatMap((c) =>
    c.divisions.flatMap((d) =>
      Array.from({ length: d.teamCount }, (_, i) => ({
        teamId: `${d.id}-t${i + 1}`,
        conferenceId: c.id,
        divisionId: d.id,
      })),
    ),
  );
  return { structure, teams };
}

const rng = (seed: string) => createRng(seedState(seed));

describe("generateSchedule", () => {
  const { structure, teams } = league(2, 3, 5);
  const games = generateSchedule(
    { structure, teams, tiers: DEFAULT_SCHEDULE_TIERS },
    rng("schedule"),
  );

  it("gives every team the season length", () => {
    expect(games).toHaveLength((30 * 76) / 2);
    for (const t of teams) {
      const played = games.filter(
        (g) => g.homeTeamId === t.teamId || g.awayTeamId === t.teamId,
      );
      expect(played).toHaveLength(76);
    }
  });

  it("meets each opponent the right number of times", () => {
    const meetings = new Map<string, number>();
    for (const g of games) {
      const key = [g.homeTeamId, g.awayTeamId].sort().join("|");
      meetings.set(key, (meetings.get(key) ?? 0) + 1);
    }
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) {
        const a = teams[i] as (typeof teams)[number];
        const b = teams[j] as (typeof teams)[number];
        const expected =
          a.divisionId === b.divisionId
            ? 4
            : a.conferenceId === b.conferenceId
              ? 3
              : 2;
        expect(meetings.get([a.teamId, b.teamId].sort().join("|"))).toBe(
          expected,
        );
      }
    }
  });

  it("balances home and away within one", () => {
    for (const t of teams) {
      const home = games.filter((g) => g.homeTeamId === t.teamId).length;
      expect(Math.abs(home - (76 - home))).toBeLessThanOrEqual(1);
    }
  });

  it("plays each team at most once a day, in a compact calendar", () => {
    const seen = new Set<string>();
    for (const g of games) {
      for (const id of [g.homeTeamId, g.awayTeamId]) {
        const key = `${g.day}|${id}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
    const lastDay = Math.max(...games.map((g) => g.day));
    expect(lastDay).toBeGreaterThanOrEqual(76);
    expect(lastDay).toBeLessThanOrEqual(95);
    expect(Math.min(...games.map((g) => g.day))).toBe(1);
  });

  it("makes unique ordered ids and scheduled games", () => {
    expect(new Set(games.map((g) => g.id)).size).toBe(games.length);
    expect(games[0]?.id).toBe("g-0001");
    for (let i = 1; i < games.length; i++) {
      expect((games[i - 1]?.day ?? 0) <= (games[i]?.day ?? 0)).toBe(true);
    }
    expect(
      games.every(
        (g) =>
          g.status === "scheduled" &&
          g.homeScore === null &&
          g.awayScore === null &&
          g.overtimes === 0,
      ),
    ).toBe(true);
  });

  it("is deterministic for an RNG state", () => {
    const again = generateSchedule(
      { structure, teams, tiers: DEFAULT_SCHEDULE_TIERS },
      rng("schedule"),
    );
    expect(again).toEqual(games);
    const other = generateSchedule(
      { structure, teams, tiers: DEFAULT_SCHEDULE_TIERS },
      rng("different"),
    );
    expect(other).not.toEqual(games);
  });

  it("supports every preset and other league shapes", () => {
    for (const [conferences, divisions, per] of [
      [2, 3, 5],
      [2, 2, 3],
      [1, 2, 4],
      [4, 2, 2],
    ] as const) {
      const l = league(conferences, divisions, per);
      for (const tiers of Object.values(SCHEDULE_PRESET_TIERS)) {
        const length = seasonLength(l.structure, tiers) as number;
        const built = generateSchedule(
          { structure: l.structure, teams: l.teams, tiers },
          rng(`shape-${conferences}${divisions}${per}`),
        );
        expect(built).toHaveLength((l.teams.length * length) / 2);
        for (const t of l.teams) {
          const home = built.filter((g) => g.homeTeamId === t.teamId).length;
          const away = built.filter((g) => g.awayTeamId === t.teamId).length;
          expect(home + away).toBe(length);
          expect(Math.abs(home - away)).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("rejects bad input", () => {
    const tiers = DEFAULT_SCHEDULE_TIERS;
    expect(() =>
      generateSchedule({ structure, teams: teams.slice(1), tiers }, rng("x")),
    ).toThrow(/should have/);
    expect(() =>
      generateSchedule(
        { structure, teams: [...teams.slice(1), teams[1] as never], tiers },
        rng("x"),
      ),
    ).toThrow(/twice/);
    expect(() =>
      generateSchedule(
        { structure, teams, tiers: { ...tiers, division: 0 } },
        rng("x"),
      ),
    ).toThrow(/build a schedule/);
  });
});

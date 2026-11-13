import { expect, test } from "@playwright/test";
import { startedLeague } from "./support/season";
import { finishJob } from "./support/worker";

/**
 * Several seasons in a row. It runs after every other spec (see the
 * "long-runs" project in playwright.config.ts): a worker claims the oldest
 * queued job of any league, so while it plays seasons it would otherwise take
 * jobs that other specs are watching.
 */
test.describe("several seasons", () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== "long-runs", "runs once, last");
  });

  test("three seasons in a row: every offseason drafts, retires and refills", async () => {
    test.setTimeout(420_000);
    const { api, league } = await startedLeague("threeseasons");
    let first = 0;
    for (let i = 0; i < 3; i++) {
      await api.leagues.simulate(league.id, { kind: "season" });
      if (i === 0) {
        first = (await api.leagues.simulation(league.id)).season?.year ?? 0;
      }
      await finishJob(api, league.id);
      await api.leagues.simulate(league.id, { kind: "season" });
      await finishJob(api, league.id);
      await api.leagues.startNextSeason(league.id);
      const report = await api.leagues.offseason(league.id);
      expect(report.year).toBe(first + i + 1);
      expect(report.draft).toHaveLength(24);
    }
    const { teams } = await api.leagues.teams(league.id);
    for (const t of teams) {
      const detail = await api.leagues.team(league.id, t.id);
      expect(detail.players).toHaveLength(15);
      const numbers = detail.players.map((p) => p.jersey);
      expect(new Set(numbers).size).toBe(numbers.length);
    }
    // The league has aged three years and gained its draft classes.
    const state = await api.leagues.simulation(league.id);
    expect(state.season?.year).toBe(first + 3);
  });
});

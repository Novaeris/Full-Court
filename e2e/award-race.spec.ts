import { expect, test } from "@playwright/test";
import { signInThroughUi } from "./support/auth";
import {
  expectAccessible,
  noOverflow,
  startedLeague,
  touchTargets,
} from "./support/season";
import { finishJob } from "./support/worker";

/**
 * The award race, against the real server and database: nothing before games
 * are played, then the leaders for each award; at the end of the regular season
 * the leader of each race is the player the season's award then goes to.
 */

const RACES = [
  "mvp",
  "defensive-player",
  "sixth-man",
  "rookie-of-the-year",
  "most-improved",
];

test.describe("the award race", () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "runs once, on desktop");
  });

  test("the race ends on the player who wins the award", async () => {
    test.setTimeout(420_000);
    const { api, league } = await startedLeague("race");
    expect((await api.leagues.awardRace(league.id)).races).toEqual([]);

    await api.leagues.simulate(league.id, { kind: "week" });
    await finishJob(api, league.id);
    const early = await api.leagues.awardRace(league.id);
    expect(early.season).not.toBeNull();
    expect(early.games).toBeGreaterThan(0);
    expect(early.races.map((r) => r.award)).toEqual(RACES);
    const mvp = early.races.find((r) => r.award === "mvp")!;
    expect(mvp.candidates.length).toBeGreaterThan(0);
    for (const r of early.races) {
      expect(r.candidates.length).toBeLessThanOrEqual(5);
      r.candidates.forEach((c, i) => {
        expect(c.rank).toBe(i + 1);
        if (i > 0) {
          expect(c.score).toBeLessThanOrEqual(r.candidates[i - 1]!.score);
        }
      });
    }

    // The end of the regular season: take the leaders, then let the season be decided.
    await api.leagues.simulate(league.id, { kind: "season" });
    await finishJob(api, league.id);
    const late = await api.leagues.awardRace(league.id);
    expect(late.games).toBeGreaterThan(early.games);
    const leaders = new Map(
      late.races.map((r) => [r.award, r.candidates[0]?.playerId] as const),
    );

    await api.leagues.simulate(league.id, { kind: "season" });
    await finishJob(api, league.id);
    await api.leagues.startNextSeason(league.id);
    const backup = await api.leagues.exportLeague(league.id);
    const awarded = new Map(
      (backup.tables.season_awards ?? []).map(
        (a) => [a.award as string, a.player_id as string] as const,
      ),
    );
    let compared = 0;
    for (const award of RACES) {
      const leader = leaders.get(award);
      if (leader === undefined) {
        // Nobody qualified for it, so nobody won it either.
        expect(awarded.has(award), award).toBe(false);
        continue;
      }
      expect(awarded.get(award), award).toBe(leader);
      compared += 1;
    }
    expect(compared).toBeGreaterThanOrEqual(3);
  });

  test("the Stats tab shows it, fits the screen and passes axe", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const { user, api, league } = await startedLeague("racepage");
    await api.leagues.simulate(league.id, { kind: "week" });
    await finishJob(api, league.id);
    await signInThroughUi(
      page,
      user.email,
      user.password,
      `/leagues/${league.id}/stats`,
    );
    await page
      .getByRole("navigation", { name: "Statistics" })
      .getByRole("link", { name: "Award race" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Most valuable player" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Rookie of the year" }),
    ).toBeVisible();

    await noOverflow(page);
    await touchTargets(page);
    await expectAccessible(page);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Most valuable player" }),
    ).toBeVisible();
    await noOverflow(page);
  });
});

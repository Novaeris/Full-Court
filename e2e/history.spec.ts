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
 * Awards and history, against the real server: nothing before a season is
 * archived, then the champion, the awards, the all-league teams and the
 * records once the next season begins.
 */

test.describe("awards and history", () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "runs once, on desktop");
  });

  test("a played season gives a champion, awards and records", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const { user, api, league } = await startedLeague("history");
    expect((await api.leagues.history(league.id)).seasons).toEqual([]);

    // A whole season and its playoffs, then the offseason begins (which archives it).
    await api.leagues.simulate(league.id, { kind: "season" });
    await finishJob(api, league.id);
    await api.leagues.simulate(league.id, { kind: "season" });
    await finishJob(api, league.id);
    const season = (await api.leagues.simulation(league.id)).season;
    expect(season?.phase).toBe("complete");
    await api.leagues.startNextSeason(league.id);

    const history = await api.leagues.history(league.id);
    expect(history.seasons).toHaveLength(1);
    const year = history.seasons[0];
    expect(year?.year).toBe(season?.year);
    expect(year?.championId).toBe(season?.championTeamId);
    expect(year?.finalistId).not.toBeNull();

    // Every individual award went to someone, and each all-league team has five.
    const given = year?.awards.map((a) => a.award) ?? [];
    for (const award of [
      "mvp",
      "finals-mvp",
      "defensive-player",
      "scoring-title",
      "rebounding-title",
      "assists-title",
    ]) {
      expect(given).toContain(award);
    }
    expect(year?.allLeague).toHaveLength(3);
    const all = year?.allLeague.flatMap((t) =>
      t.players.map((p) => p.playerId),
    );
    expect(all).toHaveLength(15);
    expect(new Set(all).size).toBe(15);
    for (const t of year?.allLeague ?? []) expect(t.players).toHaveLength(5);

    // The finals MVP played for the champion.
    const finalsMvp = year?.awards.find((a) => a.award === "finals-mvp");
    expect(finalsMvp?.teamId).toBe(year?.championId);

    // Titles and records.
    expect(history.titles[0]).toMatchObject({
      teamId: year?.championId,
      titles: 1,
    });
    expect(history.records.game.length).toBeGreaterThanOrEqual(5);
    expect(history.records.game[0]?.value).toBeGreaterThan(0);
    expect(history.records.teams[0]?.wins).toBeGreaterThan(0);

    // The page shows it, fits the screen and passes axe.
    const path = `/leagues/${league.id}/history`;
    await signInThroughUi(page, user.email, user.password, path);
    await expect(
      page.getByRole("heading", { name: "Record book" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: String(year?.year), exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Most valuable player")).toBeVisible();
    // The winner's own page lists the award and his seasons.
    const mvp = year?.awards.find((x) => x.award === "mvp");
    await page.goto(`/leagues/${league.id}/players/${mvp?.playerId}`);
    await expect(page.getByRole("heading", { name: "Awards" })).toBeVisible();
    await expect(page.getByText("Most valuable player")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Career" })).toBeVisible();
    await page.goto(path);
    await noOverflow(page);
    await touchTargets(page);
    await expectAccessible(page);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Record book" }),
    ).toBeVisible();
    await noOverflow(page);
  });

  test("the history page says so before there is any", async ({ page }) => {
    test.setTimeout(120_000);
    const { user, league } = await startedLeague("historyempty");
    await signInThroughUi(
      page,
      user.email,
      user.password,
      `/leagues/${league.id}/history`,
    );
    await expect(
      page.getByRole("heading", { name: "No history yet" }),
    ).toBeVisible();
    await expectAccessible(page);
  });
});

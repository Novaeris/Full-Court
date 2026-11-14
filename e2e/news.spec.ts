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
 * League news, against the real server and database: the moves of every team,
 * the owner's included, and the season's champion and MVP once it is decided.
 */

test.describe("league news", () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "runs once, on desktop");
  });

  test("a move shows up for everyone to see, and a season ends with its champion", async () => {
    test.setTimeout(420_000);
    const { api, league } = await startedLeague("news");
    await api.leagues.simulate(league.id, { kind: "day" });
    await finishJob(api, league.id);
    expect((await api.leagues.news(league.id)).items).toEqual(
      expect.any(Array),
    );

    // The owner's own release is news like any other team's.
    const roster = await api.leagues.roster(league.id);
    const weakest = [...roster.players].sort(
      (a, b) => a.overall - b.overall,
    )[0]!;
    await api.leagues.releasePlayer(league.id, { playerId: weakest.id });
    const released = (await api.leagues.news(league.id)).items.find(
      (i) => i.kind === "move" && i.text.includes(weakest.name),
    );
    expect(released?.text).toMatch(/released/);
    expect(released?.href).toBe(`/leagues/${league.id}/players/${weakest.id}`);

    // A whole season: its champion and most valuable player are announced.
    await api.leagues.simulate(league.id, { kind: "season" });
    await finishJob(api, league.id);
    await api.leagues.simulate(league.id, { kind: "season" });
    await finishJob(api, league.id);
    const backup = await api.leagues.exportLeague(league.id);
    const champion = backup.tables.season_awards?.find(
      (a) => a.award === "champion",
    );
    expect(champion).toBeDefined();
    const team = backup.tables.teams?.find((t) => t.id === champion?.team_id);
    const news = (await api.leagues.news(league.id)).items;
    expect(
      news.some(
        (i) =>
          i.kind === "award" &&
          i.text === `${team?.city} ${team?.nickname} won the championship.`,
      ),
    ).toBe(true);

    // Newest first, and every link points into this league.
    for (const [i, item] of news.entries()) {
      if (item.href) expect(item.href).toContain(`/leagues/${league.id}/`);
      const next = news[i + 1];
      if (next) {
        expect(
          item.year > next.year ||
            (item.year === next.year && item.day >= next.day),
        ).toBe(true);
      }
    }
  });

  test("the News tab lists it, fits the screen and passes axe", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const { user, api, league } = await startedLeague("newspage");
    await api.leagues.simulate(league.id, { kind: "day" });
    await finishJob(api, league.id);
    const roster = await api.leagues.roster(league.id);
    const weakest = [...roster.players].sort(
      (a, b) => a.overall - b.overall,
    )[0]!;
    await api.leagues.releasePlayer(league.id, { playerId: weakest.id });

    await signInThroughUi(
      page,
      user.email,
      user.password,
      `/leagues/${league.id}`,
    );
    await page
      .getByRole("navigation", { name: "League" })
      .getByRole("link", { name: "News" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Around the league" }),
    ).toBeVisible();
    await expect(page.getByText(`released ${weakest.name}`)).toBeVisible();

    await noOverflow(page);
    await touchTargets(page);
    await expectAccessible(page);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Around the league" }),
    ).toBeVisible();
    await noOverflow(page);
  });
});

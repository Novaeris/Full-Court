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
 * Statistics for the season being played, against the real worker: the
 * leaders are checked against the box scores they are added up from.
 */

test.describe("statistics", () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "runs once, on desktop");
  });

  test("the leaders add up from the box scores, in order", async () => {
    test.setTimeout(240_000);
    const { api, league } = await startedLeague("stats");
    // Before there is a season, nothing to rank.
    expect((await api.leagues.stats(league.id)).boards).toEqual([]);

    await api.leagues.simulate(league.id, { kind: "week" });
    await finishJob(api, league.id);
    const stats = await api.leagues.stats(league.id);
    expect(stats.season?.phase).toBe("regular-season");
    expect(stats.games).toBe(7);
    expect(stats.boards.map((b) => b.id)).toEqual([
      "points",
      "rebounds",
      "assists",
      "steals",
      "blocks",
      "field-goal",
      "three-point",
      "free-throw",
    ]);
    for (const board of stats.boards) {
      expect(board.leaders.length).toBeLessThanOrEqual(10);
      board.leaders.forEach((l, i) => {
        expect(l.rank).toBe(i + 1);
        // Ranked players have played at least half of the most games.
        expect(l.games).toBeGreaterThanOrEqual(4);
        if (i > 0) {
          expect(l.value).toBeLessThanOrEqual(
            board.leaders[i - 1]?.value ?? Infinity,
          );
        }
        if (board.unit === "percent") {
          expect(l.value).toBeGreaterThan(0);
          expect(l.value).toBeLessThanOrEqual(100);
        }
      });
    }
    const scoring = stats.boards[0]!;
    expect(scoring.leaders.length).toBeGreaterThan(0);

    // The scoring leader's total is what the box scores of his games say.
    const top = scoring.leaders[0]!;
    expect(top.value).toBe(Math.round((top.total / top.games) * 10) / 10);
    const { games } = await api.leagues.schedule(league.id, {
      team: top.teamId,
    });
    let points = 0;
    let played = 0;
    for (const g of games.filter((x) => x.status === "final")) {
      const detail = await api.leagues.game(league.id, g.id);
      const line = detail.lines.find((l) => l.playerId === top.playerId);
      if (line) {
        played++;
        points += line.points;
      }
    }
    expect(played).toBe(top.games);
    expect(points).toBe(top.total);

    // No playoff games yet.
    const post = await api.leagues.stats(league.id, true);
    expect(post.playoffs).toBe(true);
    expect(post.games).toBe(0);
  });

  test("the playoffs have their own leaders", async () => {
    test.setTimeout(300_000);
    const { api, league } = await startedLeague("statsplayoffs");
    await api.leagues.simulate(league.id, { kind: "season" });
    await finishJob(api, league.id);
    await api.leagues.simulate(league.id, { kind: "season" });
    await finishJob(api, league.id);
    const regular = await api.leagues.stats(league.id);
    const post = await api.leagues.stats(league.id, true);
    expect(regular.games).toBeGreaterThan(20);
    expect(post.games).toBeGreaterThan(0);
    expect(post.games).toBeLessThan(regular.games);
    expect(post.boards[0]?.leaders.length).toBeGreaterThan(0);
  });

  test("the stats page and a player's season line fit the screen and pass axe", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const { user, api, league } = await startedLeague("statslayout");
    const base = `/leagues/${league.id}`;
    await signInThroughUi(page, user.email, user.password, `${base}/stats`);
    await expect(
      page.getByRole("heading", { name: "No games yet" }),
    ).toBeVisible();
    await expectAccessible(page);

    await api.leagues.simulate(league.id, { kind: "week" });
    await finishJob(api, league.id);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Points per game" }),
    ).toBeVisible();
    await noOverflow(page);
    await touchTargets(page);
    await expectAccessible(page);
    await page
      .getByRole("navigation", { name: "Statistics" })
      .getByRole("link", { name: "Playoffs" })
      .click();
    await expect(
      page.getByRole("heading", { name: "No playoff games yet" }),
    ).toBeVisible();

    // The points leader's page has his season line and latest games.
    const stats = await api.leagues.stats(league.id);
    const top = stats.boards[0]!.leaders[0]!;
    await page.goto(`${base}/players/${top.playerId}`);
    await expect(
      page.getByRole("heading", { name: /\d{4} season/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Latest games" }),
    ).toBeVisible();
    await expect(page.getByText("Regular season").first()).toBeVisible();
    await noOverflow(page);
    await touchTargets(page);
    await expectAccessible(page);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.reload();
    await noOverflow(page);
    await page.goto(`${base}/stats`);
    await noOverflow(page);
  });
});

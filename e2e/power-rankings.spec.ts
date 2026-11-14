import { powerRankings } from "@fullcourt/game-rules";
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
 * Power rankings, against the real worker: the page ranks the teams the way
 * the rule does from the standings' own numbers.
 */

test.describe("power rankings", () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "runs once, on desktop");
  });

  test("rank every team by the rule, and switch back to the standings", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const { user, api, league, teams } = await startedLeague("power");
    const base = `/leagues/${league.id}/standings`;
    await signInThroughUi(page, user.email, user.password, base);
    await api.leagues.simulate(league.id, { kind: "week" });
    await finishJob(api, league.id);

    const { rows } = await api.leagues.standings(league.id);
    const expected = powerRankings(rows);
    expect(expected).toHaveLength(teams.length);

    await page.goto(base);
    // The standings are the default view.
    await expect(
      page.getByRole("link", { name: "Power rankings" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Power rankings" }).click();
    await expect(page).toHaveURL(/view=power/);
    const list = page
      .getByRole("region", { name: "Power rankings" })
      .getByRole("listitem");
    await expect(list).toHaveCount(teams.length);

    const nameOf = (id: string) => {
      const t = teams.find((x) => x.id === id)!;
      return `${t.city} ${t.nickname}`;
    };
    for (let i = 0; i < expected.length; i++) {
      const want = expected[i]!;
      const row = rows.find((r) => r.teamId === want.teamId)!;
      const item = list.nth(i);
      await expect(item).toContainText(nameOf(want.teamId));
      await expect(item).toContainText(want.score.toFixed(1));
      await expect(item).toContainText(`${row.wins}-${row.losses}`);
      await expect(item).toContainText(`standings ${row.rank}`);
    }

    // Better scores come first, and the scores are on a 0 to 100 scale.
    const scores = expected.map((r) => r.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    for (const s of scores) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
    // The team with the best record is not ranked below the middle: the blend is sane.
    const bestRecord = rows.reduce((a, b) => (b.winPct > a.winPct ? b : a));
    const place = expected.find((r) => r.teamId === bestRecord.teamId)!.rank;
    expect(place).toBeLessThanOrEqual(Math.ceil(teams.length / 2));

    // Back to the standings.
    await page
      .getByRole("navigation", { name: "Standings views" })
      .getByRole("link", { name: "Standings", exact: true })
      .click();
    await expect(page).not.toHaveURL(/view=power/);
    await expect(page.getByRole("heading", { name: "East" })).toBeVisible();
  });

  test("the power rankings fit the screen and pass axe", async ({ page }) => {
    test.setTimeout(240_000);
    const { user, api, league } = await startedLeague("powerlayout");
    await api.leagues.simulate(league.id, { kind: "week" });
    await finishJob(api, league.id);
    await signInThroughUi(
      page,
      user.email,
      user.password,
      `/leagues/${league.id}/standings?view=power`,
    );
    await expect(
      page.getByRole("heading", { name: "Power rankings" }),
    ).toBeVisible();
    await noOverflow(page);
    await touchTargets(page);
    await expectAccessible(page);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Power rankings" }),
    ).toBeVisible();
    await noOverflow(page);
  });
});

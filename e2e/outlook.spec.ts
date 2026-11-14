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
 * The cap outlook, against the real server: it is added up from the contracts
 * the team holds, so it is checked against them and the cap figures.
 */

test.describe("the cap outlook", () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "runs once, on desktop");
  });

  test("adds up the contracts, and follows an extension", async () => {
    test.setTimeout(240_000);
    const { api, league } = await startedLeague("outlook");
    // Before there is a season there is nothing to look ahead from.
    expect((await api.leagues.roster(league.id)).outlook).toEqual([]);

    await api.leagues.simulate(league.id, { kind: "day" });
    await finishJob(api, league.id);
    const roster = await api.leagues.roster(league.id);
    const trades = await api.leagues.trades(league.id);
    const year = (await api.leagues.simulation(league.id)).season
      ?.year as number;
    expect(roster.outlook.map((y) => y.year)).toEqual([
      year,
      year + 1,
      year + 2,
      year + 3,
      year + 4,
    ]);

    // This season matches the cap figures the page already shows.
    const now = roster.outlook[0]!;
    expect(now.cap).toBe(roster.figures?.cap);
    expect(now.ceiling).toBe(roster.figures?.ceiling);
    expect(now.committed).toBe(roster.figures?.payroll);
    expect(now.room).toBe(roster.figures?.room);
    expect(now.players).toBe(roster.players.length);

    // Every season is the sum of the salaries still running, counted from the contracts.
    roster.outlook.forEach((y, i) => {
      const under = trades.roster.filter((p) => p.yearsLeft > i);
      expect(y.committed).toBe(under.reduce((s, p) => s + p.salary, 0));
      expect(y.players).toBe(under.length);
      expect(y.expiring).toBe(
        trades.roster.filter((p) => p.yearsLeft === i + 1).length,
      );
      expect(y.room).toBe(y.cap - y.committed);
      if (i > 0) {
        // The cap rises about 3% a year.
        const rise = y.cap / roster.outlook[i - 1]!.cap;
        expect(rise).toBeGreaterThan(1.029);
        expect(rise).toBeLessThan(1.031);
      }
    });
    // Nobody is committed forever: the last year has fewer than the first.
    expect(roster.outlook[4]!.committed).toBeLessThanOrEqual(now.committed);

    // An extension commits money in the later seasons.
    const extendable = (
      await api.leagues.extensions(league.id)
    ).candidates.find((c) => c.maxYears > c.yearsLeft);
    expect(extendable).toBeDefined();
    const c = extendable as NonNullable<typeof extendable>;
    const done = await api.leagues.extendPlayer(league.id, {
      playerId: c.player.id,
      salary: c.minimum,
      years: c.maxYears,
    });
    expect(done.done).toBe(true);
    const after = (await api.leagues.roster(league.id)).outlook;
    after.forEach((y, i) => {
      // He was under contract for yearsLeft seasons, and now for maxYears.
      const before = roster.outlook[i]!;
      const wasUnder = i < c.yearsLeft;
      const isUnder = i < c.maxYears;
      const delta = (isUnder ? c.minimum : 0) - (wasUnder ? c.salary : 0);
      expect(y.committed).toBe(before.committed + delta);
    });
  });

  test("the roster panel shows it, fits the screen and passes axe", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const { user, api, league } = await startedLeague("outlooklayout");
    await api.leagues.simulate(league.id, { kind: "day" });
    await finishJob(api, league.id);

    await signInThroughUi(
      page,
      user.email,
      user.password,
      `/leagues/${league.id}/moves`,
    );
    await expect(
      page.getByRole("heading", { name: "Cap outlook" }),
    ).toBeVisible();
    const outlook = (await api.leagues.roster(league.id)).outlook;
    for (const y of outlook) {
      await expect(
        page.getByText(String(y.year), { exact: true }).first(),
      ).toBeVisible();
    }
    await noOverflow(page);
    await touchTargets(page);
    await expectAccessible(page);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Cap outlook" }),
    ).toBeVisible();
    await noOverflow(page);
  });
});

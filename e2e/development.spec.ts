import { expect, test } from "@playwright/test";
import { startedLeague } from "./support/season";
import { finishJob } from "./support/worker";

/**
 * Development during the season, against the real server, worker and
 * database: the league's players change a little at two points of the season,
 * once each, the young for the better and the old for the worse, and the
 * owner's players are treated like everyone else's.
 */

const mean = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

test.describe("development during the season", () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "runs once, on desktop");
  });

  test("players develop in two steps, the young up and the old down", async () => {
    test.setTimeout(420_000);
    const { api, league } = await startedLeague("develop");
    await api.leagues.simulate(league.id, { kind: "day" });
    await finishJob(api, league.id);

    const start = await api.leagues.exportLeague(league.id);
    expect(start.tables.seasons?.[0]?.development_steps).toBe(0);
    const before = new Map(
      (start.tables.players ?? [])
        .filter((p) => p.status === "active")
        .map((p) => [p.id as string, p] as const),
    );

    // The rest of the regular season.
    await api.leagues.simulate(league.id, { kind: "season" });
    await finishJob(api, league.id);
    const end = await api.leagues.exportLeague(league.id);
    expect(end.tables.seasons?.[0]?.phase).toBe("playoffs");
    expect(end.tables.seasons?.[0]?.development_steps).toBe(2);

    const changes = (end.tables.players ?? [])
      .filter((p) => before.has(p.id as string))
      .map((p) => {
        const was = before.get(p.id as string)!;
        return {
          team: p.team_id,
          age: Number(was.age),
          change: Number(p.overall) - Number(was.overall),
          // Age and potential wait for the offseason.
          sameAge: p.age === was.age,
          samePotential: p.potential === was.potential,
        };
      });
    expect(changes.length).toBeGreaterThan(100);
    expect(changes.every((c) => c.sameAge && c.samePotential)).toBe(true);
    // Some players changed, and none by a wild amount in a season's two small steps.
    expect(changes.filter((c) => c.change !== 0).length).toBeGreaterThan(20);
    expect(Math.max(...changes.map((c) => Math.abs(c.change)))).toBeLessThan(8);

    const young = changes.filter((c) => c.age <= 24).map((c) => c.change);
    const old = changes.filter((c) => c.age >= 30).map((c) => c.change);
    expect(young.length).toBeGreaterThan(10);
    expect(old.length).toBeGreaterThan(10);
    expect(mean(young)).toBeGreaterThan(mean(old));

    // The owner's players change like everyone else's: a share of them moved too.
    const mine = changes.filter((c) => c.team === league.userTeamId);
    expect(mine.length).toBeGreaterThan(5);
    expect(mine.some((c) => c.change !== 0)).toBe(true);

    // The playoffs and what follows take no more steps.
    await api.leagues.simulate(league.id, { kind: "season" });
    await finishJob(api, league.id);
    const done = await api.leagues.exportLeague(league.id);
    expect(done.tables.seasons?.[0]?.development_steps).toBe(2);
    const playersNow = new Map(
      (done.tables.players ?? []).map((p) => [p.id, p.overall] as const),
    );
    for (const p of end.tables.players ?? []) {
      expect(playersNow.get(p.id)).toBe(p.overall);
    }
  });
});

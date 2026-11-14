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
 * The All-Star Game, against the real worker: played once, half way through
 * the regular season, between two squads of the league's best players so far.
 */

test.describe("the All-Star Game", () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "runs once, on desktop");
  });

  test("is played half way through the season, once, between two squads of twelve", async () => {
    test.setTimeout(300_000);
    const { api, league } = await startedLeague("allstar");
    expect((await api.leagues.allStar(league.id)).game).toBeNull();

    // Before the middle of the season there is no game.
    await api.leagues.simulate(league.id, { kind: "week" });
    await finishJob(api, league.id);
    const early = await api.leagues.simulation(league.id);
    const lastDay = early.season?.lastDay ?? 0;
    expect(lastDay).toBeGreaterThan(14);
    expect((await api.leagues.allStar(league.id)).game).toBeNull();

    // The rest of the regular season: the game is played before the middle day.
    await api.leagues.simulate(league.id, { kind: "season" });
    await finishJob(api, league.id);
    const { game } = await api.leagues.allStar(league.id);
    expect(game).not.toBeNull();
    const g = game as NonNullable<typeof game>;
    expect(g.year).toBe(early.season?.year);
    expect(g.day).toBe(Math.floor(lastDay / 2));
    expect(g.squads).toHaveLength(2);

    const all = g.squads.flatMap((s) => s.players);
    expect(all).toHaveLength(24);
    expect(new Set(all.map((p) => p.playerId)).size).toBe(24);
    for (const s of g.squads) {
      expect(s.players).toHaveLength(12);
      expect(s.players.filter((p) => p.starter)).toHaveLength(5);
      expect(s.players.filter((p) => p.captain)).toHaveLength(1);
      expect(s.name).toMatch(/^Team \S/);
      // The lines add up to the score.
      expect(s.players.reduce((n, p) => n + p.points, 0)).toBe(s.score);
      // Starters first.
      expect(s.players.slice(0, 5).every((p) => p.starter)).toBe(true);
    }
    const [a, b] = g.squads as [(typeof g.squads)[0], (typeof g.squads)[0]];
    expect(a.score).not.toBe(b.score);
    expect(g.winner).toBe(a.score > b.score ? "a" : "b");
    // A basketball score, not nonsense.
    expect(Math.min(a.score, b.score)).toBeGreaterThan(70);
    expect(Math.max(a.score, b.score)).toBeLessThan(260);
    // The most valuable player is on the winning squad.
    const winners = g.squads.find((s) => s.squad === g.winner);
    expect(winners?.players.some((p) => p.playerId === g.mvp?.playerId)).toBe(
      true,
    );
    // Every one of them played for a team in the league.
    const teams = new Set(
      (await api.leagues.teams(league.id)).teams.map((t) => t.id),
    );
    for (const p of all) expect(teams.has(p.teamId as string)).toBe(true);

    // The playoffs and the next season don't play another.
    await api.leagues.simulate(league.id, { kind: "season" });
    await finishJob(api, league.id);
    await api.leagues.startNextSeason(league.id);
    const again = await api.leagues.allStar(league.id, g.year);
    expect(again.game).toEqual(g);

    // It is in the history, on a selected player's page, and in the inbox of the owner.
    const history = await api.leagues.history(league.id);
    expect(history.seasons[0]?.allStar).toMatchObject({
      nameA: a.name,
      nameB: b.name,
      scoreA: a.score,
      scoreB: b.score,
    });
    const mine = all.filter((p) => p.teamId === league.userTeamId);
    const inbox = await api.leagues.inbox(league.id);
    expect(
      inbox.items.filter((i) => i.text.includes("was an All-Star")),
    ).toHaveLength(mine.length);
  });

  test("the Stats page and a player's page show it, and fit the screen", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const { user, api, league } = await startedLeague("allstarlayout");
    await api.leagues.simulate(league.id, { kind: "season" });
    await finishJob(api, league.id);
    const g = (await api.leagues.allStar(league.id)).game;
    expect(g).not.toBeNull();
    const game = g as NonNullable<typeof g>;
    const star = game.squads[0]?.players[0];
    expect(star).toBeDefined();

    const base = `/leagues/${league.id}`;
    await signInThroughUi(page, user.email, user.password, `${base}/stats`);
    await expect(
      page.getByRole("heading", { name: `${game.year} All-Star Game` }),
    ).toBeVisible();
    await expect(page.getByText("Most valuable player:")).toBeVisible();
    await noOverflow(page);
    await touchTargets(page);
    await expectAccessible(page);

    await page.goto(`${base}/players/${star?.playerId}`);
    await expect(page.getByRole("heading", { name: "Awards" })).toBeVisible();
    await expect(page.getByText("All-Star", { exact: true })).toBeVisible();
    await noOverflow(page);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.reload();
    await noOverflow(page);
    await page.goto(`${base}/stats`);
    await noOverflow(page);
  });
});

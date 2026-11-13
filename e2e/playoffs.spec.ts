import { expect, test } from "@playwright/test";
import { signInThroughUi } from "./support/auth";
import {
  expectAccessible,
  noOverflow,
  startedLeague,
  touchTargets,
} from "./support/season";
import { runWorker } from "./support/worker";

/**
 * The playoffs, from the end of the regular season to a champion, and the
 * start of the next season. These run the real worker against local Supabase:
 * a whole regular season for a 12-team league takes a few seconds.
 */

test.describe("playoffs", () => {
  test("from the last regular-season game to a champion, then the next season", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop",
      "behaviour: runs on desktop",
    );
    test.setTimeout(240_000);
    const { user, api, league } = await startedLeague("playoffs");

    // The regular season, through the API.
    await api.leagues.simulate(league.id, { kind: "season" });
    runWorker();
    const afterSeason = await api.leagues.simulation(league.id);
    expect(afterSeason.season?.phase).toBe("playoffs");
    // No bracket until the playoffs are first simulated.
    expect((await api.leagues.playoffs(league.id)).series).toEqual([]);

    await signInThroughUi(
      page,
      user.email,
      user.password,
      `/leagues/${league.id}/playoffs`,
    );
    await expect(
      page.getByRole("heading", { name: "The playoffs are about to begin" }),
    ).toBeVisible();

    // The playoffs, from the page.
    await page.getByRole("button", { name: "Sim to end of playoffs" }).click();
    runWorker();
    await expect(page.getByText(/are the \d+ champions\./)).toBeVisible({
      timeout: 90_000,
    });

    // The bracket: every round, the final last.
    await expect(
      page.getByRole("heading", { name: "First round" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Finals" })).toBeVisible();

    // The same facts through the API.
    const bracket = await api.leagues.playoffs(league.id);
    const season = bracket.season;
    expect(season?.phase).toBe("complete");
    expect(season?.championTeamId).not.toBeNull();
    expect(bracket.rounds.length).toBeGreaterThanOrEqual(2);
    expect(bracket.rounds.at(-1)?.label).toBe("Finals");
    const teamsInField = 2 ** bracket.rounds.length;
    expect(bracket.series).toHaveLength(teamsInField - 1);
    for (const s of bracket.series) {
      expect(s.winnerTeamId).not.toBeNull();
      const needed = (s.bestOf + 1) / 2;
      expect(Math.max(s.a.wins, s.b.wins)).toBe(needed);
      expect(s.games.filter((g) => g.status === "final")).toHaveLength(
        s.a.wins + s.b.wins,
      );
      // The better regular-season record hosts game one.
      const better = s.a.rank < s.b.rank ? s.a.teamId : s.b.teamId;
      expect(s.games[0]?.homeTeamId).toBe(better);
    }
    const final = bracket.series.find((s) => s.round === bracket.rounds.length);
    expect(final?.winnerTeamId).toBe(season?.championTeamId);

    // Playoff games appear in the schedule with their round and game number.
    const mine = await api.leagues.schedule(league.id, {
      team: league.userTeamId as string,
    });
    const playoffGames = mine.games.filter((g) => g.round !== null);
    for (const g of playoffGames) expect(g.gameNumber).not.toBeNull();

    // A finished game can still be watched; it says which playoff game it was.
    const some = bracket.series[0]?.games[0] as { id: string };
    await page.goto(`/leagues/${league.id}/games/${some.id}`);
    await expect(page.getByText(/Playoffs · Round \d · Game \d/)).toBeVisible();

    // Standings count the regular season only: 12 teams play 29 games each.
    const standings = await api.leagues.standings(league.id);
    expect(standings.rows.every((r) => r.wins + r.losses === 29)).toBe(true);

    // Start the next season from the page.
    await page.goto(`/leagues/${league.id}/playoffs`);
    const start = page.getByRole("button", { name: /Start the \d+ season/ });
    await expect(start).toBeVisible();
    await start.click();
    await expect(page.getByText(/Started the \d+ season\./)).toBeVisible();
    const next = await api.leagues.simulation(league.id);
    expect(next.season).toMatchObject({
      year: (season?.year ?? 0) + 1,
      phase: "regular-season",
      day: 1,
      championTeamId: null,
    });
    // The new season has a fresh schedule and no playoffs yet.
    expect((await api.leagues.playoffs(league.id)).series).toEqual([]);
    await expect(api.leagues.startNextSeason(league.id)).rejects.toMatchObject({
      status: 409,
      code: "season_not_complete",
    });
  });

  test("the playoff pages fit the screen, pass axe and have big enough targets", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const { user, api, league } = await startedLeague("playofflayout");
    await api.leagues.simulate(league.id, { kind: "season" });
    runWorker();
    await api.leagues.simulate(league.id, { kind: "season" });
    runWorker();
    expect((await api.leagues.simulation(league.id)).season?.phase).toBe(
      "complete",
    );
    const bracket = await api.leagues.playoffs(league.id);
    const gameId = (bracket.series[0]?.games[0] as { id: string }).id;
    const base = `/leagues/${league.id}`;
    await signInThroughUi(page, user.email, user.password, `${base}/playoffs`);

    for (const path of [
      `${base}/playoffs`,
      `${base}/games/${gameId}?tab=box`,
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading").first()).toBeVisible();
      await noOverflow(page);
      await touchTargets(page);
      await expectAccessible(page);
      await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
      await expectAccessible(page);
      await page.emulateMedia({
        colorScheme: "light",
        reducedMotion: "reduce",
      });
      await page.setViewportSize({ width: 320, height: 640 });
      await page.reload();
      await expect(page.getByRole("heading").first()).toBeVisible();
      await noOverflow(page);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.emulateMedia({ colorScheme: null, reducedMotion: null });
    }
  });
});

test.describe("playoffs API", () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "runs once, on desktop");
  });

  test("can't start the next season early, and other users can't see the bracket", async () => {
    test.setTimeout(120_000);
    const { api, league } = await startedLeague("playoffsapi");
    await expect(api.leagues.startNextSeason(league.id)).rejects.toMatchObject({
      status: 404,
      code: "season_not_found",
    });
    await api.leagues.simulate(league.id, { kind: "day" });
    runWorker();
    await expect(api.leagues.startNextSeason(league.id)).rejects.toMatchObject({
      status: 409,
      code: "season_not_complete",
    });
    expect(await api.leagues.playoffs(league.id)).toMatchObject({
      rounds: [],
      series: [],
    });
  });
});

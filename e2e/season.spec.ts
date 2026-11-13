import { createApiClient } from "@fullcourt/api-client";
import { expect, test } from "@playwright/test";
import {
  accessToken,
  createConfirmedUser,
  signInThroughUi,
} from "./support/auth";
import {
  expectAccessible,
  noOverflow,
  startedLeague,
  touchTargets,
} from "./support/season";
import { runWorker } from "./support/worker";

/**
 * The season pages: schedule, standings, a game (watch and box score) and the
 * simulation controls. These tests run the real worker against local Supabase.
 * The flow and the API run on desktop; the layout and accessibility checks run
 * at every size.
 */

test.describe("simulation and season pages", () => {
  test("simulate from the schedule, then watch the game and read the box score", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop",
      "behaviour: runs on desktop",
    );
    test.setTimeout(150_000);
    const { user, api, league } = await startedLeague("seasonui");
    await signInThroughUi(
      page,
      user.email,
      user.password,
      `/leagues/${league.id}/schedule`,
    );

    // No season yet.
    await expect(
      page.getByRole("heading", { name: "No schedule yet" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Sim week" }).click();
    await expect(page.getByRole("status")).toContainText("Queued");

    // A worker picks it up; the page follows along and refreshes.
    runWorker();
    await expect(page.getByText("Simulated 7 days.")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/Regular season: day 8 of/)).toBeVisible();

    // Results appear in the team's schedule.
    const result = page.getByRole("link", { name: /^[WL]\s?\d+–\d+/ }).first();
    await expect(result).toBeVisible();
    await result.click();
    await expect(page).toHaveURL(/\/games\//);
    const gameId = new URL(page.url()).pathname.split("/").pop() as string;
    const detail = await api.leagues.game(league.id, gameId);

    // Watch it. Starts paused; nothing moves until asked.
    // The replay ran on this device and agreed with the stored score, so the
    // server's replay wasn't needed.
    await expect(page.locator("[data-replay-source='device']")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Play", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Press play to start the game.")).toBeVisible();
    await page.getByRole("button", { name: "8×", exact: true }).click();
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect(
      page.locator("section[aria-label='Game viewer'] ol li").first(),
    ).toBeVisible();
    await page.getByRole("button", { name: "Pause" }).click();
    await page.getByRole("button", { name: "Next play" }).click();
    await page.getByRole("button", { name: "Skip to end" }).click();

    // At the end the scoreboard shows the final score.
    const scoreboard = page.getByRole("group", { name: "Scoreboard" });
    await expect(scoreboard).toContainText(String(detail.game.awayScore));
    await expect(scoreboard).toContainText(String(detail.game.homeScore));
    await expect(scoreboard).toContainText("0:00");
    await expect(
      page.getByRole("button", { name: "Watch again" }),
    ).toBeVisible();

    // The full play-by-play lists what happened.
    await page.getByText("Full play-by-play so far").click();
    await expect(
      page.getByRole("region", { name: "Full play-by-play" }),
    ).toContainText("makes");

    // The box score.
    await page.getByRole("link", { name: "Box score" }).click();
    await expect(page).toHaveURL(/tab=box/);
    await expect(page.getByText("Team totals").first()).toBeVisible();

    // Standings.
    await page.goto(`/leagues/${league.id}/standings`);
    await expect(page.getByRole("heading", { name: "East" })).toBeVisible();
    await expect(page.getByText(/\d+ games played/)).toBeVisible();
  });

  test("season pages fit the screen, pass axe and have big enough targets", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const { user, api, league } = await startedLeague("seasonlayout");
    await api.leagues.simulate(league.id, { kind: "week" });
    runWorker();
    const { games } = await api.leagues.schedule(league.id, {
      team: league.userTeamId as string,
    });
    const played = games.find((g) => g.status === "final");
    expect(played).toBeDefined();
    const base = `/leagues/${league.id}`;
    await signInThroughUi(page, user.email, user.password, `${base}/schedule`);

    const pages: { path: string; heading: string | RegExp }[] = [
      { path: `${base}/schedule`, heading: "Season" },
      { path: `${base}/schedule?view=day&day=2`, heading: /Day 2 of/ },
      { path: `${base}/standings`, heading: "East" },
      { path: `${base}/games/${played?.id}`, heading: /at / },
      { path: `${base}/games/${played?.id}?tab=box`, heading: /at / },
      { path: `${base}/games/${played?.id}?tab=box&team=away`, heading: /at / },
      { path: base, heading: /season/i },
    ];
    for (const { path, heading } of pages) {
      await page.goto(path);
      await expect(
        page.getByRole("heading", { name: heading }).first(),
      ).toBeVisible();
      await noOverflow(page);
      await touchTargets(page);
      await expectAccessible(page);
      // Dark mode, with motion off so no colour transition is caught mid-way.
      await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
      await expectAccessible(page);
      await page.emulateMedia({
        colorScheme: "light",
        reducedMotion: "reduce",
      });

      await page.setViewportSize({ width: 320, height: 640 });
      await page.reload();
      await expect(
        page.getByRole("heading", { name: heading }).first(),
      ).toBeVisible();
      await noOverflow(page);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.emulateMedia({ colorScheme: null, reducedMotion: null });
    }
  });
});

test.describe("season API", () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "runs once, on desktop");
  });

  test("schedule, standings, a game and its replay", async () => {
    test.setTimeout(150_000);
    const { user, api, league } = await startedLeague("seasonapi");
    const stranger = await createConfirmedUser("seasonother");
    const asStranger = createApiClient({
      baseUrl:
        process.env.E2E_BASE_URL ??
        `http://localhost:${process.env.E2E_PORT ?? 3100}`,
      fetch,
      getAccessToken: () => accessToken(stranger.email, stranger.password),
    });
    void user;

    // Before any simulation there is nothing.
    expect(await api.leagues.schedule(league.id)).toEqual({
      season: null,
      games: [],
    });
    expect(await api.leagues.standings(league.id)).toEqual({
      season: null,
      rows: [],
    });

    await api.leagues.simulate(league.id, { kind: "week" });
    runWorker();

    // The schedule.
    const mine = await api.leagues.schedule(league.id, {
      team: league.userTeamId as string,
    });
    expect(mine.season?.day).toBe(8);
    expect(mine.games.length).toBeGreaterThan(20);
    const finals = mine.games.filter((g) => g.status === "final");
    expect(finals.length).toBeGreaterThan(0);
    expect(finals.length).toBeLessThanOrEqual(7);
    expect(mine.games.map((g) => g.day)).toEqual(
      [...mine.games.map((g) => g.day)].sort((a, b) => a - b),
    );
    const dayOne = await api.leagues.schedule(league.id, { day: 1 });
    expect(dayOne.games).toHaveLength(6);
    expect(dayOne.games.every((g) => g.status === "final")).toBe(true);
    const today = await api.leagues.schedule(league.id);
    expect(
      today.games.every((g) => g.day === 8 && g.status === "scheduled"),
    ).toBe(true);
    await expect(
      api.leagues.schedule(league.id, { day: 0 }),
    ).rejects.toMatchObject({
      status: 400,
      code: "invalid_query",
    });
    await expect(
      api.leagues.schedule(league.id, { team: "not-a-team" }),
    ).rejects.toMatchObject({ status: 400 });

    // The standings: every game gives one team a win and one a loss.
    const standings = await api.leagues.standings(league.id);
    expect(standings.rows).toHaveLength(12);
    const wins = standings.rows.reduce((n, r) => n + r.wins, 0);
    const losses = standings.rows.reduce((n, r) => n + r.losses, 0);
    expect(wins).toBe(losses);
    expect(wins).toBeGreaterThanOrEqual(6);
    expect(standings.rows.map((r) => r.rank)).toEqual(
      standings.rows.map((_, i) => i + 1),
    );
    expect(
      standings.rows.every((r) => r.homeWins + r.awayWins === r.wins),
    ).toBe(true);

    // A game and its recipe.
    const gameId = (dayOne.games[0] as { id: string }).id;
    const detail = await api.leagues.game(league.id, gameId);
    expect(detail.replayStatus).toBe("available");
    expect(detail.replay?.rngState).toHaveLength(4);
    const home = detail.lines
      .filter((l) => l.teamId === detail.game.homeTeamId)
      .reduce((n, l) => n + l.points, 0);
    const away = detail.lines
      .filter((l) => l.teamId === detail.game.awayTeamId)
      .reduce((n, l) => n + l.points, 0);
    expect([home, away]).toEqual([
      detail.game.homeScore,
      detail.game.awayScore,
    ]);

    // The server's own replay agrees.
    const { plays, starters } = await api.leagues.gamePlays(league.id, gameId);
    expect(plays.length).toBeGreaterThan(100);
    expect(starters.home).toHaveLength(5);
    expect(starters.away).toHaveLength(5);
    const last = plays[plays.length - 1];
    expect([last?.homeScore, last?.awayScore]).toEqual([
      detail.game.homeScore,
      detail.game.awayScore,
    ]);

    // A game not yet played has no box score and no replay.
    const later = today.games[0] as { id: string };
    const scheduled = await api.leagues.game(league.id, later.id);
    expect(scheduled).toMatchObject({
      replayStatus: "missing",
      lines: [],
      replay: null,
    });
    await expect(
      api.leagues.gamePlays(league.id, later.id),
    ).rejects.toMatchObject({
      status: 409,
      code: "replay_unavailable",
    });
    await expect(
      api.leagues.game(league.id, "00000000-0000-4000-8000-000000000000"),
    ).rejects.toMatchObject({ status: 404, code: "game_not_found" });

    // Nobody else can see any of it.
    await expect(asStranger.leagues.schedule(league.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(asStranger.leagues.standings(league.id)).rejects.toMatchObject(
      { status: 404 },
    );
    await expect(
      asStranger.leagues.game(league.id, gameId),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      asStranger.leagues.gamePlays(league.id, gameId),
    ).rejects.toMatchObject({ status: 404 });
  });
});

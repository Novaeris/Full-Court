import { expect, test } from "@playwright/test";
import { signInThroughUi } from "./support/auth";
import {
  expectAccessible,
  makeRosterLegal,
  noOverflow,
  playDraft,
  startedLeague,
  touchTargets,
} from "./support/season";
import { finishJob, runWorker } from "./support/worker";

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
    const diagram = page.getByRole("region", { name: "Playoff bracket" });
    await expect(diagram.getByText("First round").first()).toBeVisible();
    await expect(diagram.getByText("Finals")).toBeVisible();

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
    await page.goto(`/leagues/${league.id}/playoffs`);
    await page
      .getByRole("button", { name: /Show the games/ })
      .first()
      .click();
    const games = page.getByRole("list", { name: "Games" }).first();
    await expect(games).toBeVisible();
    await games.getByRole("link").first().click();
    await expect(page.getByText(/Playoffs · Round \d · Game \d/)).toBeVisible();

    // Standings count the regular season only: 12 teams play 29 games each.
    const standings = await api.leagues.standings(league.id);
    expect(standings.rows.every((r) => r.wins + r.losses === 29)).toBe(true);

    // Start the offseason from the page.
    await page.goto(`/leagues/${league.id}/playoffs`);
    const start = page.getByRole("button", { name: "Start the offseason" });
    await expect(start).toBeVisible();
    await start.click();
    await expect(page.getByText(/The \d+ offseason has begun\./)).toBeVisible();
    const next = await api.leagues.simulation(league.id);
    expect(next.season).toMatchObject({
      year: (season?.year ?? 0) + 1,
      phase: "offseason",
      stage: "draft",
      day: 1,
      championTeamId: null,
    });
    // The offseason begins in the calendar's fixed place, and no playoffs are
    // left over from the season before.
    // The draft is a Thursday in late June.
    const draftDay = new Date(`${next.season?.date}T00:00:00Z`);
    expect(draftDay.getUTCDay()).toBe(4);
    expect(draftDay.getUTCMonth()).toBe(5);
    expect(draftDay.getUTCFullYear()).toBe(next.season?.year);
    expect((await api.leagues.playoffs(league.id)).series).toEqual([]);
    await expect(api.leagues.startNextSeason(league.id)).rejects.toMatchObject({
      status: 409,
      code: "season_not_complete",
    });
    // The simulation can not run in the offseason.
    await expect(
      api.leagues.simulate(league.id, { kind: "day" }),
    ).rejects.toMatchObject({ status: 409 });

    // The draft stage: the offseason page shows the stages.
    await page.goto(`/leagues/${league.id}/offseason`);
    await expect(
      page.getByRole("heading", { name: `${next.season?.year} offseason` }),
    ).toBeVisible();
    await expect(
      page.locator('li[aria-current="step"]').filter({ hasText: "Draft" }),
    ).toBeVisible();
    const staff = await api.leagues.staff(league.id);
    expect(staff.open).toBe(true);
    expect(staff.payroll).toBeLessThanOrEqual(staff.budget);
    // Before the lottery there is already a board to scout, with scouted numbers.
    const before = await api.leagues.draft(league.id);
    expect(before.lotteryHeld).toBe(false);
    expect(before.board.length).toBeGreaterThanOrEqual(24);
    expect(before.order).toEqual([]);
    await page.getByRole("button", { name: "Hold the lottery" }).click();
    await expect(
      page.getByRole("heading", { name: "The draft" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Draft lottery" }),
    ).toBeVisible();
    // Simulate to the owner's pick, then make it from the page.
    await page.getByRole("button", { name: "Sim the draft" }).click();
    await expect(page.getByText("is on the clock: your pick.")).toBeVisible();
    const clock = await api.leagues.draft(league.id);
    expect(clock.onTheClock?.yourPick).toBe(true);
    const firstName = clock.board[0]!.name;
    await page.getByRole("button", { name: `Draft ${firstName}` }).click();
    await expect
      .poll(
        async () =>
          (await api.leagues.draft(league.id)).order.filter((o) => o.player)
            .length,
      )
      .toBeGreaterThan(clock.onTheClock!.pick - 1);
    // Out of turn, or twice, is refused.
    await expect(
      api.leagues.draftPick(league.id, { prospectId: clock.board[1]!.id }),
    ).rejects.toMatchObject({ status: 409 });
    await playDraft(api, league.id);

    const report = await api.leagues.offseason(league.id);
    expect(report.year).toBe(next.season?.year);
    expect(report.stage).toBe("free-agency");
    expect(report.draftStatus).toMatchObject({
      lotteryHeld: true,
      made: 24,
      total: 24,
    });
    expect(report.draft).toHaveLength(24);
    expect(report.draft.every((d) => d.player !== null)).toBe(true);
    expect(report.draft.map((d) => d.pick)).toEqual(
      Array.from({ length: 24 }, (_, i) => i + 1),
    );
    // The lottery covers the teams that missed the playoffs, odds adding to 100%.
    const odds = report.draft
      .filter((d) => d.round === 1 && d.lotteryOdds !== null)
      .map((d) => d.lotteryOdds as number);
    expect(odds.length).toBeGreaterThan(0);
    expect(odds.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 4);

    // Free agency: 21 days of offers. Contracts that ended made free agents,
    // and the owner can offer, simulate a day and watch what happens.
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Free agency", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Sim a day" })).toBeVisible();
    const market = await api.leagues.freeAgency(league.id);
    expect(market.open).toBe(true);
    expect(market).toMatchObject({ day: 0, days: 21 });
    expect(market.figures!.payroll).toBeLessThanOrEqual(
      market.figures!.ceiling,
    );
    expect(market.figures!.ceiling).toBe(Math.round(market.figures!.cap * 1.2));
    expect(market.freeAgents.length).toBeGreaterThan(5);
    expect(market.log.some((e) => e.kind === "contract-ended")).toBe(true);
    // Offer the best free agent we can afford 15% over his asking price.
    const target = market.freeAgents.find(
      (p) => p.askSalary * 1.15 <= market.figures!.room || p.yours,
    );
    if (target) {
      const salary = Math.min(
        market.figures!.maxSalary,
        Math.round((target.askSalary * 1.15) / 10) * 10,
      );
      const made = await api.leagues.makeOffer(league.id, {
        playerId: target.id,
        salary,
        years: target.askYears,
      });
      expect(made.myOffers.map((o) => o.player.id)).toContain(target.id);
    }
    // An offer outside the rules is refused with the reason.
    const star = market.freeAgents[0]!;
    await expect(
      api.leagues.makeOffer(league.id, {
        playerId: star.id,
        salary: market.figures!.maxSalary + 10,
        years: 1,
      }),
    ).rejects.toMatchObject({ status: 422 });
    await page.getByRole("button", { name: "Sim a day" }).click();
    await expect
      .poll(async () => (await api.leagues.freeAgency(league.id)).day)
      .toBe(1);
    // Direct signing of a star is refused while free agency is on.
    await expect(
      api.leagues.signPlayer(league.id, { playerId: star.id }),
    ).rejects.toMatchObject({ status: 409 });
    const done = await api.leagues.simFreeAgency(league.id, { days: "end" });
    expect(done.day).toBe(21);
    expect(done.open).toBe(false);
    // Nothing is left waiting: every offer was accepted, lapsed or voided.
    expect(done.myOffers).toEqual([]);
    expect(done.figures!.payroll).toBeLessThanOrEqual(done.figures!.ceiling);
    // Contracts: everyone on the owner's roster has one.
    const afterDays = await api.leagues.roster(league.id);
    expect(afterDays.players.every((p) => p.salary !== null)).toBe(true);
    await expect(
      api.leagues.makeOffer(league.id, {
        playerId: star.id,
        salary: market.figures!.minSalary,
        years: 1,
      }),
    ).rejects.toMatchObject({ status: 409, code: "wrong_stage" });

    // The roster has to be legal before free agency can end.
    await makeRosterLegal(api, league.id);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Roster moves" }),
    ).toBeVisible();

    // Free agency, then training camp where the owner chooses who goes.
    await page.getByRole("button", { name: "End free agency" }).click();
    await expect(
      page.getByRole("button", { name: "Hold training camp" }),
    ).toBeVisible();
    const camp = await api.leagues.camp(league.id);
    expect(camp.open).toBe(true);
    expect(camp.places).toBeGreaterThanOrEqual(3);
    const youngest = [...camp.roster].sort(
      (a, b) => a.player.age - b.player.age,
    )[0]!;
    await page
      .getByLabel(`Camp program for ${youngest.player.name}`)
      .selectOption("shooting");
    await page.getByRole("button", { name: "Save camp roster" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();
    expect(
      (await api.leagues.camp(league.id)).roster.find(
        (r) => r.player.id === youngest.player.id,
      )?.program,
    ).toBe("shooting");
    await page.getByRole("button", { name: "Hold training camp" }).click();
    await expect(
      page.getByRole("button", { name: "Start the regular season" }),
    ).toBeVisible();
    const afterCamp = await api.leagues.offseason(league.id);
    expect(afterCamp.stage).toBe("preseason");
    expect(
      afterCamp.campReport.some((r) => r.player.id === youngest.player.id),
    ).toBe(true);
    await expect(
      page.getByRole("heading", { name: "Training camp report" }),
    ).toBeVisible();

    // Rosters are 12 to 15 players, anywhere in the range.
    const { teams } = await api.leagues.teams(league.id);
    for (const t of teams) {
      const detail = await api.leagues.team(league.id, t.id);
      expect(detail.players.length).toBeGreaterThanOrEqual(12);
      expect(detail.players.length).toBeLessThanOrEqual(15);
    }

    // The season opens with its schedule ready.
    await page
      .getByRole("button", { name: "Start the regular season" })
      .click();
    await expect
      .poll(async () => (await api.leagues.simulation(league.id)).season?.phase)
      .toBe("regular-season");
    const opened = (await api.leagues.simulation(league.id)).season;
    expect(opened).toMatchObject({ stage: null, day: 1 });
    // Opening night is the second Monday of October.
    const opening = new Date(`${opened?.date}T00:00:00Z`);
    expect(opening.getUTCDay()).toBe(1);
    expect(opening.getUTCMonth()).toBe(9);
    expect(opening.getUTCDate()).toBeGreaterThanOrEqual(8);
    expect(opening.getUTCDate()).toBeLessThanOrEqual(14);
  });

  test("the playoff pages fit the screen, pass axe and have big enough targets", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const { user, api, league } = await startedLeague("playofflayout");
    await api.leagues.simulate(league.id, { kind: "season" });
    await finishJob(api, league.id);
    await api.leagues.simulate(league.id, { kind: "season" });
    await finishJob(api, league.id);
    expect((await api.leagues.simulation(league.id)).season?.phase).toBe(
      "complete",
    );
    const bracket = await api.leagues.playoffs(league.id);
    const gameId = (bracket.series[0]?.games[0] as { id: string }).id;
    const base = `/leagues/${league.id}`;
    await signInThroughUi(page, user.email, user.password, `${base}/playoffs`);

    async function check(path: string) {
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

    await check(`${base}/playoffs`);
    await check(`${base}/games/${gameId}?tab=box`);
    // The offseason page exists once the offseason has begun: check it at the
    // draft, with the staff market, and at training camp.
    await api.leagues.startNextSeason(league.id);
    await check(`${base}/offseason`);
    await api.leagues.holdLottery(league.id);
    await check(`${base}/offseason`);
    await playDraft(api, league.id);
    await makeRosterLegal(api, league.id);
    await check(`${base}/offseason`);
    await api.leagues.advanceOffseason(league.id);
    await check(`${base}/offseason`);
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

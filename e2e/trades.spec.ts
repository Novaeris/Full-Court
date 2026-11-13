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
 * Trades and roster moves in the season, against the real server: contracts,
 * what a computer team will accept, the limits, and the deadline.
 */

test.describe("trades and roster moves", () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "runs once, on desktop");
  });

  test("shop a player, make a trade, and the rules that stop a bad one", async () => {
    test.setTimeout(240_000);
    const { api, league } = await startedLeague("trades");
    await api.leagues.simulate(league.id, { kind: "day" });
    await finishJob(api, league.id);

    const trades = await api.leagues.trades(league.id);
    expect(trades.open).toBe(true);
    expect(trades.deadlineDay).toBeGreaterThan(trades.day);
    // Everyone has a contract by now.
    expect(trades.roster.length).toBe(15);
    expect(trades.roster.every((p) => p.salary > 0 && p.yearsLeft >= 1)).toBe(
      true,
    );
    expect(trades.partners.length).toBe(11);

    // Shop the best player: every offer is one the computer team accepts and that is legal.
    const star = trades.roster[0]!;
    const shop = await api.leagues.shopPlayers(league.id, {
      playerIds: [star.id],
    });
    for (const offer of shop.offers) {
      const check = await api.leagues.evaluateTrade(league.id, {
        partnerId: offer.teamId,
        give: [star.id],
        get: offer.get.map((p) => p.id),
      });
      expect(check).toMatchObject({ legal: true, accepts: true });
    }

    // An unfair trade is declined, with the reason, and nothing changes.
    const partner = trades.partners[0]!;
    const their = await api.leagues.tradePartner(league.id, partner.teamId);
    const worst = trades.roster[trades.roster.length - 1]!;
    const unfair = await api.leagues.proposeTrade(league.id, {
      partnerId: partner.teamId,
      give: [worst.id],
      get: [their.roster[0]!.id],
    });
    expect(unfair.done).toBe(false);
    expect(unfair.evaluation.accepts).toBe(false);
    expect(
      unfair.evaluation.reasons.length + unfair.evaluation.problems.length,
    ).toBeGreaterThan(0);
    expect((await api.leagues.trades(league.id)).history).toEqual([]);

    // A trade they would accept is made, and rosters and payrolls follow.
    const offer = shop.offers[0];
    if (offer) {
      const before = await api.leagues.trades(league.id);
      const result = await api.leagues.proposeTrade(league.id, {
        partnerId: offer.teamId,
        give: [star.id],
        get: offer.get.map((p) => p.id),
      });
      expect(result).toMatchObject({ done: true });
      const after = await api.leagues.trades(league.id);
      const ids = after.roster.map((p) => p.id);
      expect(ids).not.toContain(star.id);
      for (const p of offer.get) expect(ids).toContain(p.id);
      expect(after.roster.length).toBe(15 - 1 + offer.get.length);
      expect(after.payroll).toBe(result.evaluation.payrollAfter.yours);
      expect(after.history).toHaveLength(1);
      expect(before.history).toHaveLength(0);
    }

    // Trading with your own team, or with a player who is not on the team, is refused.
    await expect(
      api.leagues.proposeTrade(league.id, {
        partnerId: league.userTeamId as string,
        give: [],
        get: [],
      }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      api.leagues.proposeTrade(league.id, {
        partnerId: partner.teamId,
        give: [their.roster[0]!.id],
        get: [],
      }),
    ).rejects.toMatchObject({ status: 422, code: "player_not_on_team" });

    // Roster moves: a release is allowed down to 12 players and no further.
    let roster = await api.leagues.roster(league.id);
    expect(roster.open).toBe(true);
    while (roster.players.length > 12) {
      const weakest = [...roster.players].sort(
        (a, b) => a.overall - b.overall,
      )[0]!;
      roster = (await api.leagues.releasePlayer(league.id, {
        playerId: weakest.id,
      })) as typeof roster;
    }
    expect(roster.players).toHaveLength(12);
    expect(roster.players.every((p) => p.salary !== null)).toBe(true);
    await expect(
      api.leagues.releasePlayer(league.id, { playerId: roster.players[0]!.id }),
    ).rejects.toMatchObject({ status: 409, code: "roster_too_small" });
    // The released players are free agents now and can be signed back, for the rest of the season.
    const freed = roster.freeAgents[0];
    if (freed) {
      const signed = await api.leagues.signPlayer(league.id, {
        playerId: freed.id,
      });
      expect(signed.players).toHaveLength(13);
      const contract = signed.players.find((p) => p.id === freed.id);
      expect(contract?.expires).toBe(
        (await api.leagues.simulation(league.id)).season?.year,
      );
    }

    // After the deadline there are no trades.
    await api.leagues.simulate(league.id, { kind: "season" });
    await finishJob(api, league.id);
    const closed = await api.leagues.trades(league.id);
    expect(closed.open).toBe(false);
    expect(closed.closedReason).toBeTruthy();
    await expect(
      api.leagues.proposeTrade(league.id, {
        partnerId: partner.teamId,
        give: [worst.id],
        get: [their.roster[0]!.id],
      }),
    ).rejects.toMatchObject({ status: 409, code: "trades_closed" });
  });

  test("the Moves page fits the screen, passes axe and has big enough targets", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const { user, api, league } = await startedLeague("tradeslayout");
    await api.leagues.simulate(league.id, { kind: "day" });
    await finishJob(api, league.id);
    const path = `/leagues/${league.id}/moves`;
    await signInThroughUi(page, user.email, user.password, path);
    await expect(
      page.getByRole("heading", { name: "Trades", exact: true }),
    ).toBeVisible();
    await page.getByLabel("Trade with").selectOption({ index: 1 });
    await expect(page.getByText("You give")).toBeVisible();
    await noOverflow(page);
    await touchTargets(page);
    await expectAccessible(page);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Trades", exact: true }),
    ).toBeVisible();
    await noOverflow(page);
  });
});

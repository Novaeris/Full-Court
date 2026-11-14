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
 * Strategy and starters, against the real server: what is saved, what the
 * rules refuse, and that the games played afterwards start the five named.
 */

test.describe("strategy and starters", () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "runs once, on desktop");
  });

  test("save a strategy and starters, and the next game starts them", async () => {
    test.setTimeout(240_000);
    const { api, league } = await startedLeague("strategy");
    const fresh = await api.leagues.strategy(league.id);
    expect(fresh.strategy).toEqual({
      pace: "normal",
      threePointFocus: "normal",
      defense: "balanced",
    });
    expect(fresh.starters).toEqual([]);
    expect(fresh.roster).toHaveLength(15);

    // The five weakest players: nobody would choose them by themselves.
    const weakest = [...fresh.roster]
      .sort((a, b) => a.overall - b.overall)
      .slice(0, 5)
      .map((p) => p.id);
    const saved = await api.leagues.updateStrategy(league.id, {
      strategy: { pace: "fast", threePointFocus: "high", defense: "interior" },
      starters: weakest,
    });
    expect(saved.strategy).toEqual({
      pace: "fast",
      threePointFocus: "high",
      defense: "interior",
    });
    expect([...saved.starters].sort()).toEqual([...weakest].sort());

    // The rules refuse starters that aren't five different players of the team.
    const bad = {
      strategy: saved.strategy,
    };
    await expect(
      api.leagues.updateStrategy(league.id, {
        ...bad,
        starters: weakest.slice(0, 4),
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      api.leagues.updateStrategy(league.id, {
        ...bad,
        starters: [
          ...weakest.slice(0, 4),
          "11111111-1111-4111-8111-111111111111",
        ],
      }),
    ).rejects.toMatchObject({ status: 422, code: "invalid_starters" });
    // Nothing changed.
    expect((await api.leagues.strategy(league.id)).starters.length).toBe(5);

    // The next game starts the five that were named.
    await api.leagues.simulate(league.id, { kind: "day" });
    await finishJob(api, league.id);
    const { games } = await api.leagues.schedule(league.id, {
      team: league.userTeamId as string,
    });
    const played = games.find((g) => g.status === "final");
    expect(played).toBeDefined();
    const plays = await api.leagues.gamePlays(
      league.id,
      (played as NonNullable<typeof played>).id,
    );
    const mine =
      played?.homeTeamId === league.userTeamId
        ? plays.starters.home
        : plays.starters.away;
    expect([...mine].sort()).toEqual([...weakest].sort());

    // Back to automatic.
    const reset = await api.leagues.updateStrategy(league.id, {
      strategy: saved.strategy,
      starters: [],
    });
    expect(reset.starters).toEqual([]);
  });

  test("a rotation size limits who plays, and the head coach shows", async () => {
    test.setTimeout(240_000);
    const { api, league } = await startedLeague("rotation");
    // The league's first season, and its staff, are made when it first simulates.
    await api.leagues.simulate(league.id, { kind: "day" });
    await finishJob(api, league.id);
    const fresh = await api.leagues.strategy(league.id);
    expect(fresh.rotation).toBeNull();
    // Every team has a head coach, and his bonus follows his rating.
    expect(fresh.coach).not.toBeNull();
    const coach = fresh.coach as NonNullable<typeof fresh.coach>;
    expect(coach.bonus).toBeGreaterThanOrEqual(-1.7);
    expect(coach.bonus).toBeLessThanOrEqual(2);
    expect(Math.sign(coach.bonus)).toBe(Math.sign(coach.rating - 60));

    const saved = await api.leagues.updateStrategy(league.id, {
      strategy: fresh.strategy,
      starters: [],
      rotation: 7,
    });
    expect(saved.rotation).toBe(7);
    // The game only knows 7 to 12.
    await expect(
      api.leagues.updateStrategy(league.id, {
        strategy: fresh.strategy,
        starters: [],
        rotation: 5,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect((await api.leagues.strategy(league.id)).rotation).toBe(7);

    // A week of games: the team plays seven players (a couple more only when
    // fouls or injuries leave the rotation short).
    await api.leagues.simulate(league.id, { kind: "week" });
    await finishJob(api, league.id);
    const { games } = await api.leagues.schedule(league.id, {
      team: league.userTeamId as string,
    });
    const played = games.filter((g) => g.status === "final");
    expect(played.length).toBeGreaterThan(2);
    let used = 0;
    for (const g of played) {
      const detail = await api.leagues.game(league.id, g.id);
      used += detail.lines.filter(
        (l) => l.teamId === league.userTeamId && l.minutes > 0,
      ).length;
    }
    // Seven in the rotation: on average well under what a full bench would use.
    expect(used / played.length).toBeLessThan(8.6);

    // Back to everyone.
    const reset = await api.leagues.updateStrategy(league.id, {
      strategy: fresh.strategy,
      starters: [],
    });
    expect(reset.rotation).toBeNull();
  });

  test("the strategy panel saves, fits the screen and passes axe", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const { user, api, league } = await startedLeague("strategylayout");
    await api.leagues.simulate(league.id, { kind: "day" });
    await finishJob(api, league.id);
    const path = `/leagues/${league.id}/moves`;
    await signInThroughUi(page, user.email, user.password, path);
    await expect(
      page.getByRole("heading", { name: "Strategy and starters" }),
    ).toBeVisible();
    const panel = page.getByRole("region", { name: "Strategy and starters" });
    await panel.getByRole("combobox").nth(0).selectOption("slow");
    await panel.getByRole("combobox").nth(2).selectOption("perimeter");
    await panel.getByLabel("Choose my starting five").check();
    // Saving makes the page refresh itself (a request for the page's data).
    const refreshed = page.waitForResponse(
      (r) => r.request().headers()["rsc"] === "1" && r.url().includes("/moves"),
    );
    await page.getByRole("button", { name: "Save strategy" }).click();
    await expect(
      page.getByText("Saved. It applies to your next game."),
    ).toBeVisible();
    // The message must outlast that refresh (the panel used to be rebuilt by
    // it, which wiped the message at once).
    await refreshed;
    // The response arrives before the page shows it: let that render happen.
    await page.evaluate(
      () => new Promise((resolve) => setTimeout(resolve, 600)),
    );
    await expect(
      page.getByText("Saved. It applies to your next game."),
    ).toBeVisible();
    const after = await api.leagues.strategy(league.id);
    expect(after.strategy.pace).toBe("slow");
    expect(after.strategy.defense).toBe("perimeter");
    expect(after.starters).toHaveLength(5);

    await noOverflow(page);
    await touchTargets(page);
    await expectAccessible(page);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Strategy and starters" }),
    ).toBeVisible();
    await noOverflow(page);
  });
});

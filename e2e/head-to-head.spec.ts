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
 * Head-to-head records, against the real server and database: they add up to
 * the team's record, agree from both teams' sides, and count playoff games
 * apart from the regular season.
 */

test.describe("head to head", () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "runs once, on desktop");
  });

  test("records add up and agree from both sides", async () => {
    test.setTimeout(420_000);
    const { api, league, teams } = await startedLeague("h2h");
    const mine = league.userTeamId as string;
    expect((await api.leagues.headToHead(league.id, mine)).opponents).toEqual(
      [],
    );

    // A whole season and its playoffs.
    await api.leagues.simulate(league.id, { kind: "season" });
    await finishJob(api, league.id);
    await api.leagues.simulate(league.id, { kind: "season" });
    await finishJob(api, league.id);

    const backup = await api.leagues.exportLeague(league.id);
    const finals = (backup.tables.games ?? []).filter(
      (g) => g.status === "final",
    );
    const involving = (id: string, playoff: boolean) =>
      finals.filter(
        (g) =>
          (g.home_team_id === id || g.away_team_id === id) &&
          (g.series_id !== null) === playoff,
      ).length;

    const h2h = await api.leagues.headToHead(league.id, mine);
    const regular = h2h.opponents.reduce(
      (n, o) => n + o.regular.wins + o.regular.losses,
      0,
    );
    const playoffs = h2h.opponents.reduce(
      (n, o) => n + o.playoffs.wins + o.playoffs.losses,
      0,
    );
    expect(regular).toBe(involving(mine, false));
    expect(playoffs).toBe(involving(mine, true));
    expect(regular).toBeGreaterThan(0);
    // Most meetings first.
    const games = (o: (typeof h2h.opponents)[number]) =>
      o.regular.wins + o.regular.losses + o.playoffs.wins + o.playoffs.losses;
    for (let i = 1; i < h2h.opponents.length; i++) {
      expect(games(h2h.opponents[i]!)).toBeLessThanOrEqual(
        games(h2h.opponents[i - 1]!),
      );
    }

    // The other side of every record is its mirror image.
    for (const o of h2h.opponents.slice(0, 3)) {
      const back = (
        await api.leagues.headToHead(league.id, o.opponentId)
      ).opponents.find((x) => x.opponentId === mine);
      expect(back?.regular).toEqual({
        wins: o.regular.losses,
        losses: o.regular.wins,
      });
      expect(back?.playoffs).toEqual({
        wins: o.playoffs.losses,
        losses: o.playoffs.wins,
      });
      expect(back?.rival).toBe(o.rival);
    }

    // A team that isn't in the league has no record.
    expect(teams.length).toBeGreaterThan(1);
    await expect(
      api.leagues.headToHead(league.id, "00000000-0000-4000-8000-000000000000"),
    ).rejects.toMatchObject({ status: 404 });
  });

  test("the team page lists it, fits the screen and passes axe", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const { user, api, league } = await startedLeague("h2hpage");
    await api.leagues.simulate(league.id, { kind: "week" });
    await finishJob(api, league.id);
    await signInThroughUi(
      page,
      user.email,
      user.password,
      `/leagues/${league.id}/teams/${league.userTeamId}`,
    );
    await expect(
      page.getByRole("heading", { name: "Head to head" }),
    ).toBeVisible();
    await expect(page.getByText("Last: ").first()).toBeVisible();
    await noOverflow(page);
    await touchTargets(page);
    await expectAccessible(page);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.reload();
    await noOverflow(page);
  });
});

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
 * The Hall of Fame, against the real server and database. A league that has
 * played one season has no retired stars yet, so the test plays a season, takes
 * a backup, writes three retired careers into it (a great one that retired long
 * ago, a great one that retired last season, and an ordinary one) and restores
 * it as a new league: the Hall is then worked out from real tables.
 */

test.describe("the Hall of Fame", () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "runs once, on desktop");
  });

  test("inducts great players once their waiting time has passed, and nobody else", async ({
    page,
  }) => {
    test.setTimeout(420_000);
    const { user, api, league } = await startedLeague("hall");
    // Nothing is retired in a new league.
    expect((await api.leagues.hallOfFame(league.id)).members).toEqual([]);

    await api.leagues.simulate(league.id, { kind: "season" });
    await finishJob(api, league.id);
    await api.leagues.simulate(league.id, { kind: "season" });
    await finishJob(api, league.id);
    await api.leagues.startNextSeason(league.id);
    const backup = await api.leagues.exportLeague(league.id);
    const year = Math.max(
      ...(backup.tables.seasons ?? []).map((s) => Number(s.year)),
    );

    // Three different players with a season of regular-season stats in the
    // archive (a traded player has two rows, so take one row per player).
    const seen = new Set<unknown>();
    const stats = (backup.tables.player_season_stats ?? []).filter((s) => {
      if (s.playoffs !== false || seen.has(s.player_id)) return false;
      seen.add(s.player_id);
      return true;
    });
    const [great, recent, ordinary] = stats.slice(0, 3) as [
      (typeof stats)[number],
      (typeof stats)[number],
      (typeof stats)[number],
    ];
    const retire = (id: unknown, retiredYear: number) => {
      const p = backup.tables.players?.find((x) => x.id === id);
      Object.assign(p!, {
        status: "retired",
        retired_year: retiredYear,
        team_id: null,
        rights_team_id: null,
        salary: null,
        contract_expires: null,
      });
    };
    retire(great.player_id, year - 6);
    retire(recent.player_id, year - 1);
    retire(ordinary.player_id, year - 6);
    // One enormous season of rebounding for the stars; the ordinary player stays ordinary.
    Object.assign(great, { games_played: 82, rebounds: 82 * 100 });
    Object.assign(recent, { games_played: 82, rebounds: 82 * 100 });
    Object.assign(ordinary, { games_played: 82, rebounds: 82 * 3 });

    const copy = await api.leagues.importLeague(backup);
    const hall = await api.leagues.hallOfFame(copy.id);
    expect(hall.year).toBe(year);
    expect(hall.retired).toBeGreaterThanOrEqual(3);
    // Restoring replaced every id, so find them by name.
    const named = (id: unknown) => {
      const p = backup.tables.players?.find((x) => x.id === id);
      return `${p?.first_name} ${p?.last_name}`;
    };
    const inducted = hall.members.map((m) => m.name);
    expect(inducted).toContain(named(great.player_id));
    // The one who retired last season is still waiting; the ordinary one never qualifies.
    expect(inducted).not.toContain(named(recent.player_id));
    expect(inducted).not.toContain(named(ordinary.player_id));

    const member = hall.members.find((m) => m.name === named(great.player_id))!;
    expect(member.retiredYear).toBe(year - 6);
    expect(member.inductedYear).toBe(year - 3);
    expect(member.seasons).toBe(1);
    expect(member.games).toBe(82);
    expect(member.rebounds).toBe(100);
    expect(member.score).toBeGreaterThanOrEqual(60);
    // Best first.
    for (let i = 1; i < hall.members.length; i++) {
      expect(hall.members[i]!.score).toBeLessThanOrEqual(
        hall.members[i - 1]!.score,
      );
    }

    // The original league has no such players.
    expect((await api.leagues.hallOfFame(league.id)).members).toEqual([]);

    // The page lists the member, with his career.
    await signInThroughUi(
      page,
      user.email,
      user.password,
      `/leagues/${copy.id}/hall-of-fame`,
    );
    const row = page.getByRole("listitem").filter({ hasText: member.name });
    await expect(row).toContainText(`inducted ${year - 3}`);
    await expect(row).toContainText("100 reb");
    await noOverflow(page);
    await touchTargets(page);
    await expectAccessible(page);
  });

  test("the page lists the Hall, fits the screen and passes axe", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const { user, league } = await startedLeague("hallpage");
    await signInThroughUi(
      page,
      user.email,
      user.password,
      `/leagues/${league.id}/hall-of-fame`,
    );
    await expect(
      page.getByRole("heading", { name: "Hall of Fame" }),
    ).toBeVisible();
    await expect(page.getByText("Nobody inducted yet")).toBeVisible();
    await noOverflow(page);
    await touchTargets(page);
    await expectAccessible(page);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.reload();
    await noOverflow(page);
  });
});

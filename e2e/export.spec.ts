import { readFile } from "node:fs/promises";
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
 * The league backup, against the real server: what is in the file, that only
 * the owner can take it, and that the settings page really hands it over.
 */

test.describe("the league backup", () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "runs once, on desktop");
  });

  test("holds the league as it stands and only the owner can take it", async () => {
    test.setTimeout(240_000);
    const { api, league } = await startedLeague("export");
    const other = await startedLeague("exportother");

    const before = await api.leagues.exportLeague(league.id);
    expect(before.format).toBe(1);
    expect(before.league.id).toBe(league.id);
    expect(before.teams.length).toBeGreaterThan(1);
    expect(before.players.length).toBeGreaterThan(before.teams.length * 10);
    // No season exists until the first day is played, so there are no games yet.
    expect(before.seasons).toEqual([]);
    expect(before.games).toEqual([]);
    // Nothing from another league, and nothing that only repeats the league id.
    for (const row of [...before.teams, ...before.players, ...before.games]) {
      expect(row).not.toHaveProperty("league_id");
    }

    // Games played show up as scores in the file.
    await api.leagues.simulate(league.id, { kind: "week" });
    await finishJob(api, league.id);
    const after = await api.leagues.exportLeague(league.id);
    expect(after.seasons).toHaveLength(1);
    const played = after.games.filter((g) => g.status === "final");
    expect(played.length).toBeGreaterThan(0);
    expect(played[0]?.home_score).toEqual(expect.any(Number));
    expect(after.games.length).toBeGreaterThan(played.length);

    // Somebody else's league is not there to export.
    await expect(
      other.api.leagues.exportLeague(league.id),
    ).rejects.toMatchObject({ status: 404 });
  });

  test("the settings page saves the file and fits the screen", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const { user, league } = await startedLeague("exportpage");
    await signInThroughUi(
      page,
      user.email,
      user.password,
      `/leagues/${league.id}/settings`,
    );
    await expect(
      page.getByRole("heading", { name: "Back up this league" }),
    ).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Download a backup" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("full-court-league.json");
    const file = JSON.parse(await readFile(await download.path(), "utf8"));
    expect(file.league.id).toBe(league.id);
    expect(file.players.length).toBeGreaterThan(100);

    await noOverflow(page);
    await touchTargets(page);
    await expectAccessible(page);
  });
});

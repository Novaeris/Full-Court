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
 * The league backup and its restore, against the real server and database:
 * what is in the file, that only the owner can take it, that restoring it
 * brings back the same league under new ids, and that a bad file changes
 * nothing.
 */

const sum = (rows: Record<string, unknown>[] | undefined, key: string) =>
  (rows ?? []).reduce((total, row) => total + Number(row[key] ?? 0), 0);

test.describe("the league backup", () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "runs once, on desktop");
  });

  test("holds the league as it stands and only the owner can take it", async () => {
    test.setTimeout(240_000);
    const { api, league } = await startedLeague("export");
    const other = await startedLeague("exportother");

    const before = await api.leagues.exportLeague(league.id);
    expect(before.format).toBe(2);
    expect(before.league.id).toBe(league.id);
    expect(before.tables.teams?.length).toBeGreaterThan(1);
    expect(before.tables.players?.length).toBeGreaterThan(
      (before.tables.teams?.length ?? 0) * 10,
    );
    // No season exists until the first day is played, so there are no games yet.
    expect(before.tables.seasons).toEqual([]);
    expect(before.tables.games).toEqual([]);

    // Games played show up as scores in the file, with their replays.
    await api.leagues.simulate(league.id, { kind: "week" });
    await finishJob(api, league.id);
    const after = await api.leagues.exportLeague(league.id);
    expect(after.tables.seasons).toHaveLength(1);
    const played = after.tables.games?.filter((g) => g.status === "final");
    expect(played?.length).toBeGreaterThan(0);
    expect(played?.[0]?.home_score).toEqual(expect.any(Number));
    expect(after.tables.game_replays?.length).toBe(played?.length);
    expect(after.tables.box_score_lines?.length).toBeGreaterThan(0);

    // Somebody else's league is not there to export.
    await expect(
      other.api.leagues.exportLeague(league.id),
    ).rejects.toMatchObject({ status: 404 });
  });

  test("a restored backup is the same league under new ids, and plays on", async () => {
    test.setTimeout(300_000);
    const { api, league } = await startedLeague("restore");
    await api.leagues.simulate(league.id, { kind: "week" });
    await finishJob(api, league.id);
    const backup = await api.leagues.exportLeague(league.id);

    const restored = await api.leagues.importLeague(backup);
    expect(restored.id).not.toBe(league.id);
    expect(restored.name).toContain("(restored)");
    expect(restored.userTeamId).not.toBeNull();
    expect(restored.userTeamId).not.toBe(league.userTeamId);

    // Everything is there, with the same numbers.
    const copy = await api.leagues.exportLeague(restored.id);
    for (const name of Object.keys(backup.tables)) {
      expect(copy.tables[name]?.length, name).toBe(backup.tables[name]?.length);
    }
    expect(sum(copy.tables.players, "overall")).toBe(
      sum(backup.tables.players, "overall"),
    );
    expect(sum(copy.tables.games, "home_score")).toBe(
      sum(backup.tables.games, "home_score"),
    );
    expect(sum(copy.tables.box_score_lines, "points")).toBe(
      sum(backup.tables.box_score_lines, "points"),
    );
    // No id is shared with the league it came from.
    const oldIds = new Set(
      [...(backup.tables.teams ?? []), ...(backup.tables.players ?? [])].map(
        (r) => r.id,
      ),
    );
    for (const row of [
      ...(copy.tables.teams ?? []),
      ...(copy.tables.players ?? []),
    ]) {
      expect(oldIds.has(row.id)).toBe(false);
    }

    // The standings match, game for game.
    const records = async (id: string) =>
      (await api.leagues.standings(id)).rows
        .map((r) => `${r.wins}-${r.losses}`)
        .sort();
    expect(await records(restored.id)).toEqual(await records(league.id));

    // The restored league plays on; the original is untouched by it.
    await api.leagues.simulate(restored.id, { kind: "day" });
    await finishJob(api, restored.id);
    const next = await api.leagues.exportLeague(restored.id);
    expect(
      next.tables.games?.filter((g) => g.status === "final").length,
    ).toBeGreaterThan(
      backup.tables.games?.filter((g) => g.status === "final").length ?? 0,
    );
    const original = await api.leagues.exportLeague(league.id);
    expect(
      original.tables.games?.filter((g) => g.status === "final").length,
    ).toBe(backup.tables.games?.filter((g) => g.status === "final").length);
  });

  test("a damaged backup is refused and leaves nothing behind", async () => {
    test.setTimeout(240_000);
    const { api, league } = await startedLeague("badbackup");
    const backup = await api.leagues.exportLeague(league.id);
    const count = async () => (await api.leagues.list()).leagues.length;
    const start = await count();

    // Players whose teams are gone: the database refuses, and nothing is kept.
    await expect(
      api.leagues.importLeague({
        ...backup,
        tables: { ...backup.tables, teams: [] },
      }),
    ).rejects.toMatchObject({ status: 422, code: "invalid_backup" });
    // Not a backup at all.
    await expect(
      api.leagues.importLeague({ nonsense: true } as never),
    ).rejects.toMatchObject({ status: 422, code: "invalid_backup" });
    expect(await count()).toBe(start);

    // The league limit still applies.
    for (let i = start; i < 5; i++) await api.leagues.importLeague(backup);
    await expect(api.leagues.importLeague(backup)).rejects.toMatchObject({
      status: 409,
      code: "league_limit_reached",
    });
  });

  test("Settings saves the file and the Leagues page restores it", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const { user, api, league } = await startedLeague("exportpage");
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
    const text = await readFile(await download.path(), "utf8");
    expect(JSON.parse(text).league.id).toBe(league.id);
    await noOverflow(page);
    await touchTargets(page);
    await expectAccessible(page);

    await page.goto("/leagues");
    const section = page.getByRole("region", { name: "Restore a backup" });
    await expect(section).toBeVisible();
    await expect(
      section.getByRole("button", { name: "Restore this backup" }),
    ).toBeDisabled();
    await noOverflow(page);
    await touchTargets(page);
    await expectAccessible(page);

    // Until the page has come alive a chosen file is not noticed, so choose it
    // again until the button knows about it (a person does this by looking).
    const restore = section.getByRole("button", {
      name: "Restore this backup",
    });
    await expect(async () => {
      await section.getByLabel("Backup file").setInputFiles({
        name: "full-court-league.json",
        mimeType: "application/json",
        buffer: Buffer.from(text),
      });
      await expect(restore).toBeEnabled({ timeout: 1000 });
    }).toPass();
    await section.getByRole("button", { name: "Restore this backup" }).click();
    await page.waitForURL(/\/leagues\/(?!new)[0-9a-f-]{36}$/);
    expect(page.url()).not.toContain(league.id);
    await expect(
      page.getByRole("heading", { name: /\(restored\)/ }),
    ).toBeVisible();
    expect((await api.leagues.list()).leagues).toHaveLength(2);

    // A file that isn't a backup says so and changes nothing.
    await page.goto("/leagues");
    const again = page.getByRole("button", { name: "Restore this backup" });
    await expect(async () => {
      await page.getByLabel("Backup file").setInputFiles({
        name: "notes.json",
        mimeType: "application/json",
        buffer: Buffer.from('{"hello": "world"}'),
      });
      await expect(again).toBeEnabled({ timeout: 1000 });
    }).toPass();
    await page.getByRole("button", { name: "Restore this backup" }).click();
    await expect(
      page.getByRole("region", { name: "Restore a backup" }).getByRole("alert"),
    ).toContainText("isn't a backup");
    expect((await api.leagues.list()).leagues).toHaveLength(2);
  });

  test("a backup can replace the league it came from, all or nothing", async () => {
    test.setTimeout(300_000);
    const { api, league } = await startedLeague("replace");
    await api.leagues.simulate(league.id, { kind: "week" });
    await finishJob(api, league.id);
    const backup = await api.leagues.exportLeague(league.id);
    const finals = (b: typeof backup) =>
      (b.tables.games ?? []).filter((g) => g.status === "final").length;

    // The league moves on after the backup was taken.
    await api.leagues.simulate(league.id, { kind: "week" });
    await finishJob(api, league.id);
    expect(finals(await api.leagues.exportLeague(league.id))).toBeGreaterThan(
      finals(backup),
    );

    // A broken file changes nothing.
    await expect(
      api.leagues.restoreLeague(league.id, {
        ...backup,
        tables: { ...backup.tables, teams: [] },
      }),
    ).rejects.toMatchObject({ status: 422, code: "invalid_backup" });
    expect((await api.leagues.get(league.id)).id).toBe(league.id);

    // A good one replaces it: the same name, the league as it was in the backup, and no extra league.
    const before = (await api.leagues.get(league.id)).name;
    const restored = await api.leagues.restoreLeague(league.id, backup);
    expect(restored.id).not.toBe(league.id);
    expect(restored.name).toBe(before);
    await expect(api.leagues.get(league.id)).rejects.toMatchObject({
      status: 404,
    });
    expect((await api.leagues.list()).leagues.map((l) => l.id)).toEqual([
      restored.id,
    ]);
    expect(finals(await api.leagues.exportLeague(restored.id))).toBe(
      finals(backup),
    );

    // Somebody else's league can't be replaced.
    const other = await startedLeague("replaceother");
    await expect(
      other.api.leagues.restoreLeague(restored.id, backup),
    ).rejects.toMatchObject({ status: 404 });
  });

  test("Settings replaces the league after the name is typed", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const { user, api, league } = await startedLeague("replacepage");
    const backup = await api.leagues.exportLeague(league.id);
    await signInThroughUi(
      page,
      user.email,
      user.password,
      `/leagues/${league.id}/settings`,
    );
    const card = page.getByRole("region", {
      name: "Restore a backup over this league",
    });
    await expect(card).toBeVisible();
    const replace = card.getByRole("button", { name: "Replace this league" });
    await expect(replace).toBeDisabled();

    // Until a file is chosen and the name typed, it can't be pressed.
    const file = {
      name: "full-court-league.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup)),
    };
    await expect(async () => {
      await card.getByLabel("Backup file").setInputFiles(file);
      await card.getByLabel("Type the league's name to confirm").fill("nope");
      await expect(replace).toBeDisabled({ timeout: 1000 });
    }).toPass();
    await card
      .getByLabel("Type the league's name to confirm")
      .fill((await api.leagues.get(league.id)).name);
    await expect(replace).toBeEnabled();
    await noOverflow(page);
    await touchTargets(page);
    await expectAccessible(page);

    await replace.click();
    await page.waitForURL(/\/leagues\/(?!new)[0-9a-f-]{36}$/);
    expect(page.url()).not.toContain(league.id);
    const lists = (await api.leagues.list()).leagues;
    expect(lists).toHaveLength(1);
    expect(lists[0]?.id).not.toBe(league.id);
  });
});

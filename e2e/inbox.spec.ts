import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { accessToken, signInThroughUi } from "./support/auth";
import {
  expectAccessible,
  noOverflow,
  startedLeague,
  touchTargets,
} from "./support/season";
import { finishJob } from "./support/worker";

/**
 * The inbox, against the real server: it is worked out from the league's own
 * records, so it is checked against what the other APIs say.
 */

test.describe("inbox", () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "runs once, on desktop");
  });

  test("tells you about your contracts and offers, newest first", async () => {
    test.setTimeout(240_000);
    const { api, league, teams } = await startedLeague("inbox");
    // No season yet: nothing has happened.
    const before = await api.leagues.inbox(league.id);
    expect(before.teamId).toBe(league.userTeamId);
    expect(before.items).toEqual([]);

    await api.leagues.simulate(league.id, { kind: "week" });
    await finishJob(api, league.id);
    const inbox = await api.leagues.inbox(league.id);
    const trades = await api.leagues.trades(league.id);

    // A reminder lists exactly the players whose contracts end this season.
    const ending = trades.roster.filter((p) => p.yearsLeft === 1);
    const reminder = inbox.items.find((i) => i.kind === "reminder");
    if (ending.length > 0) {
      expect(reminder).toBeDefined();
      for (const p of ending) expect(reminder?.text).toContain(p.name);
      expect(reminder?.text).toMatch(/^\d+ contracts? ends? after this season/);
      expect(reminder?.href).toBe(`/leagues/${league.id}/roster`);
    } else {
      expect(reminder).toBeUndefined();
    }

    // Every open offer is there, and only those.
    expect(inbox.items.filter((i) => i.kind === "offer")).toHaveLength(
      trades.offers.length,
    );

    // Newest first, with a place to look at each one.
    for (let i = 1; i < inbox.items.length; i++) {
      const a = inbox.items[i - 1]!;
      const b = inbox.items[i]!;
      expect(a.year * 10_000 + a.day).toBeGreaterThanOrEqual(
        b.year * 10_000 + b.day,
      );
    }
    for (const item of inbox.items) {
      expect(item.text.length).toBeGreaterThan(5);
      if (item.href) expect(item.href).toMatch(/^\/leagues\//);
    }
    // The ids are distinct, so a list can key on them.
    expect(new Set(inbox.items.map((i) => i.id)).size).toBe(inbox.items.length);

    // It is only for teams you run.
    const other = teams.find((t) => t.id !== league.userTeamId);
    await expect(api.leagues.inbox(league.id, other?.id)).rejects.toMatchObject(
      { status: 404, code: "team_not_found" },
    );
  });

  test("a whole season: injuries, awards and moves match the records", async () => {
    test.setTimeout(300_000);
    const { user, api, league } = await startedLeague("inboxseason");
    const token = await accessToken(user.email, user.password);
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      },
    );
    const mine = league.userTeamId as string;

    await api.leagues.simulate(league.id, { kind: "season" });
    await finishJob(api, league.id);
    await api.leagues.simulate(league.id, { kind: "season" });
    await finishJob(api, league.id);
    await api.leagues.startNextSeason(league.id);

    const inbox = await api.leagues.inbox(league.id);
    const kinds = (kind: string) => inbox.items.filter((i) => i.kind === kind);

    // Every injury to your team is there (up to what the inbox holds), in words.
    const hurt = await db
      .from("player_injuries")
      .select("id")
      .eq("league_id", league.id)
      .eq("team_id", mine);
    expect(kinds("injury")).toHaveLength(Math.min(hurt.data?.length ?? 0, 60));
    for (const i of kinds("injury"))
      expect(i.text).toMatch(/was hurt: .+\. Out \d+ days?\./);

    // Awards: the team's own (champion, finalist) and its players'.
    const won = await db
      .from("season_awards")
      .select("award, player_id")
      .eq("league_id", league.id)
      .eq("team_id", mine);
    const expected = (won.data ?? []).filter(
      (a) => a.player_id || ["champion", "finalist"].includes(a.award),
    );
    expect(kinds("award")).toHaveLength(expected.length);

    // Roster moves: the draft picks you made are listed.
    const drafted = await db
      .from("player_transactions")
      .select("id")
      .eq("league_id", league.id)
      .eq("team_id", mine)
      .neq("kind", "traded");
    expect(kinds("move")).toHaveLength(Math.min(drafted.data?.length ?? 0, 60));

    // Nothing about a trade you didn't make.
    expect(kinds("trade")).toHaveLength(0);
  });

  test("the inbox page fits the screen and passes axe", async ({ page }) => {
    test.setTimeout(240_000);
    const { user, api, league } = await startedLeague("inboxlayout");
    const path = `/leagues/${league.id}/inbox`;
    await signInThroughUi(page, user.email, user.password, path);
    await expect(
      page.getByRole("heading", { name: "Nothing yet" }),
    ).toBeVisible();
    await expectAccessible(page);

    await api.leagues.simulate(league.id, { kind: "week" });
    await finishJob(api, league.id);
    await page.reload();
    // Either the list or, if nothing has happened yet, the empty state.
    await expect(
      page.getByRole("heading", {
        name: /What has happened to your team|Nothing yet/,
      }),
    ).toBeVisible();
    await noOverflow(page);
    await touchTargets(page);
    await expectAccessible(page);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.reload();
    await noOverflow(page);
  });
});

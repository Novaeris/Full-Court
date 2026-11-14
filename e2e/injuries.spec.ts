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
 * Injuries, against the real worker and database: they happen, hurt players
 * sit out the days they are injured for, the pages say who is out, and the
 * offseason heals everyone. Reads go through the league owner's own session
 * (row-level security), like the app's.
 */

async function asOwner(email: string, password: string) {
  const token = await accessToken(email, password);
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  );
}

test.describe("injuries", () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "runs once, on desktop");
  });

  test("players are hurt, sit out their days, and are fit again for the next season", async () => {
    test.setTimeout(300_000);
    const { user, api, league } = await startedLeague("injuries");
    const db = await asOwner(user.email, user.password);

    // The regular season.
    await api.leagues.simulate(league.id, { kind: "season" });
    await finishJob(api, league.id);

    const injuries = await db
      .from("player_injuries")
      .select("player_id, team_id, day, days, kind")
      .eq("league_id", league.id);
    expect(injuries.error).toBeNull();
    const hurt = injuries.data ?? [];
    // 12 teams over 29 days: a few every week or so.
    expect(hurt.length).toBeGreaterThan(3);
    for (const i of hurt) {
      expect(i.days).toBeGreaterThanOrEqual(1);
      expect(i.kind.length).toBeGreaterThan(0);
    }

    // A hurt player plays no game on the days he is out.
    const games = await db
      .from("games")
      .select("id, day")
      .eq("league_id", league.id)
      .eq("status", "final")
      .limit(1000);
    expect(games.data?.length).toBeGreaterThan(0);
    const dayOf = new Map((games.data ?? []).map((g) => [g.id, g.day]));
    const lines = await db
      .from("box_score_lines")
      .select("player_id, game_id, minutes")
      .eq("league_id", league.id)
      .in("player_id", [...new Set(hurt.map((i) => i.player_id))])
      .gt("minutes", 0)
      .limit(5000);
    expect(lines.data?.length).toBeGreaterThan(0);
    const violations = (lines.data ?? []).filter((l) => {
      const day = dayOf.get(l.game_id) ?? 0;
      return hurt.some(
        (i) =>
          i.player_id === l.player_id && day > i.day && day <= i.day + i.days,
      );
    });
    expect(violations).toEqual([]);

    // The playoffs, then the offseason: everyone is fit again.
    await api.leagues.simulate(league.id, { kind: "season" });
    await finishJob(api, league.id);
    await api.leagues.startNextSeason(league.id);
    const after = await db
      .from("players")
      .select("id")
      .eq("league_id", league.id)
      .gt("injury_days", 0);
    expect(after.data).toEqual([]);
  });

  test("the team page shows who is out, fits the screen and passes axe", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const { user, api, league } = await startedLeague("injurieslayout");
    const db = await asOwner(user.email, user.password);

    // Play days until somebody is hurt (a handful at most).
    let out: {
      id: string;
      team_id: string | null;
      injury_days: number;
      injury_kind: string | null;
    } | null = null;
    for (let day = 0; day < 20 && !out; day++) {
      await api.leagues.simulate(league.id, { kind: "day" });
      await finishJob(api, league.id);
      const found = await db
        .from("players")
        .select("id, team_id, injury_days, injury_kind")
        .eq("league_id", league.id)
        .gt("injury_days", 0)
        .limit(1);
      out = found.data?.[0] ?? null;
    }
    expect(out).not.toBeNull();
    const hurt = out as NonNullable<typeof out>;
    expect(hurt.injury_kind).not.toBeNull();

    const base = `/leagues/${league.id}`;
    const detail = await api.leagues.team(league.id, hurt.team_id as string);
    const seen = detail.players.find((p) => p.id === hurt.id);
    expect(seen?.injuryDays).toBe(hurt.injury_days);
    expect(seen?.injuryKind).toBe(hurt.injury_kind);

    await signInThroughUi(
      page,
      user.email,
      user.password,
      `${base}/teams/${hurt.team_id}`,
    );
    await expect(page.getByText(/^Out \d+ days?/).first()).toBeVisible();
    await noOverflow(page);
    await touchTargets(page);
    await expectAccessible(page);

    await page.goto(`${base}/players/${hurt.id}`);
    await expect(page.getByText(/^Injured: /)).toBeVisible();
    await expectAccessible(page);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.reload();
    await noOverflow(page);
  });
});

import { chooseTeamStrategy, describeStyle } from "@fullcourt/game-rules";
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
 * The team page's overview, against the real worker: it is worked out from the
 * records, so it is checked against standings, the schedule and the box scores.
 */

test.describe("the team overview", () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "runs once, on desktop");
  });

  test("record, results, style and leaders match the records", async () => {
    test.setTimeout(240_000);
    const { api, league, teams } = await startedLeague("overview");
    const mine = league.userTeamId as string;

    // Before there is a season: no record, and the style it would play.
    const first = await api.leagues.teamOverview(league.id, mine);
    expect(first.season).toBeNull();
    expect(first.record).toBeNull();
    expect(first.recent).toEqual([]);
    expect(first.style).toMatchObject({
      pace: "normal",
      threePointFocus: "normal",
      defense: "balanced",
      words: "Plays a balanced game.",
      setByOwner: true,
    });

    // A computer team: the style its roster suits, in words.
    const other = teams.find((t) => t.id !== mine) as (typeof teams)[number];
    const roster = (await api.leagues.team(league.id, other.id)).players;
    const suits = chooseTeamStrategy(
      roster.map((p) => ({
        overall: p.overall,
        threePoint: p.ratings.threePoint,
        speed: p.ratings.speed,
        stamina: p.ratings.stamina,
        perimeterD: p.ratings.perimeterD,
        interiorD: p.ratings.interiorD,
      })),
    );
    const theirs = (await api.leagues.teamOverview(league.id, other.id)).style;
    expect(theirs).toMatchObject({ ...suits, setByOwner: false });
    expect(theirs.words).toBe(describeStyle(suits));

    // A week of games.
    await api.leagues.simulate(league.id, { kind: "week" });
    await finishJob(api, league.id);
    const overview = await api.leagues.teamOverview(league.id, mine);
    const standings = await api.leagues.standings(league.id);
    const row = standings.rows.find((r) => r.teamId === mine)!;
    const played = row.wins + row.losses;
    expect(played).toBe(7);

    expect(overview.season?.phase).toBe("regular-season");
    expect(overview.record).toMatchObject({
      rank: row.rank,
      teams: standings.rows.length,
      wins: row.wins,
      losses: row.losses,
      streak: row.streak,
      lastTen: row.lastTen,
    });
    expect(overview.record?.pointsFor).toBe(
      Math.round((row.pointsFor / played) * 10) / 10,
    );
    expect(overview.record?.pointsAgainst).toBe(
      Math.round((row.pointsAgainst / played) * 10) / 10,
    );

    // Results: the latest five, newest first; next games: in order, still to play.
    const schedule = (await api.leagues.schedule(league.id, { team: mine }))
      .games;
    const finals = schedule.filter((g) => g.status === "final");
    expect(overview.recent.map((g) => g.gameId)).toEqual(
      finals
        .slice(-5)
        .reverse()
        .map((g) => g.id),
    );
    for (const g of overview.recent) {
      const source = finals.find((x) => x.id === g.gameId)!;
      const home = source.homeTeamId === mine;
      const ours = (home ? source.homeScore : source.awayScore) as number;
      const against = (home ? source.awayScore : source.homeScore) as number;
      expect(g.home).toBe(home);
      expect(g.score).toBe(`${ours}-${against}`);
      expect(g.won).toBe(ours > against);
      expect(g.opponentId).toBe(home ? source.awayTeamId : source.homeTeamId);
    }
    expect(overview.upcoming.map((g) => g.gameId)).toEqual(
      schedule
        .filter((g) => g.status === "scheduled")
        .slice(0, 3)
        .map((g) => g.id),
    );
    for (const g of overview.upcoming) {
      expect(g.won).toBeNull();
      expect(g.score).toBeNull();
    }

    // Leaders: each one's per-game number is what the box scores add up to.
    const totals = new Map<
      string,
      {
        name: string;
        points: number;
        rebounds: number;
        assists: number;
        games: number;
      }
    >();
    const names = new Map(
      (await api.leagues.team(league.id, mine)).players.map((p) => [
        p.id,
        `${p.firstName} ${p.lastName}`,
      ]),
    );
    for (const g of finals) {
      const detail = await api.leagues.game(league.id, g.id);
      for (const l of detail.lines.filter((x) => x.teamId === mine)) {
        const t = totals.get(l.playerId) ?? {
          name: names.get(l.playerId) ?? "",
          points: 0,
          rebounds: 0,
          assists: 0,
          games: 0,
        };
        t.points += l.points;
        t.rebounds += l.rebounds;
        t.assists += l.assists;
        t.games++;
        totals.set(l.playerId, t);
      }
    }
    expect(overview.leaders.map((l) => l.category)).toEqual([
      "points",
      "rebounds",
      "assists",
    ]);
    for (const l of overview.leaders) {
      const t = totals.get(l.playerId)!;
      expect(l.name).toBe(t.name);
      expect(l.perGame).toBe(Math.round((t[l.category] / t.games) * 10) / 10);
      // Nobody on the team averages more.
      for (const other of totals.values()) {
        expect(other[l.category] / other.games).toBeLessThanOrEqual(
          t[l.category] / t.games + 1e-9,
        );
      }
    }

    // Another team's page works the same way.
    const it = await api.leagues.teamOverview(league.id, other.id);
    expect(it.record).not.toBeNull();
    await expect(
      api.leagues.teamOverview(
        league.id,
        "11111111-1111-4111-8111-111111111111",
      ),
    ).rejects.toMatchObject({ status: 404, code: "team_not_found" });
  });

  test("the team page shows it, fits the screen and passes axe", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const { user, api, league } = await startedLeague("overviewlayout");
    await api.leagues.simulate(league.id, { kind: "week" });
    await finishJob(api, league.id);
    await api.leagues.updateStrategy(league.id, {
      strategy: { pace: "fast", threePointFocus: "high", defense: "interior" },
      starters: [],
    });

    const path = `/leagues/${league.id}/teams/${league.userTeamId}`;
    await signInThroughUi(page, user.email, user.password, path);
    await expect(
      page.getByRole("heading", { name: /\d{4} season/ }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Runs the floor, shoots a lot of threes and protects the paint.",
      ),
    ).toBeVisible();
    await expect(page.getByText("(set by the owner)")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Latest results" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Next games" }),
    ).toBeVisible();
    await noOverflow(page);
    await touchTargets(page);
    await expectAccessible(page);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.reload();
    await noOverflow(page);
  });
});

test("a link from a team page opens the player page at the top, on a phone", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "runs on the phone project");
  test.setTimeout(180_000);
  const { user, league, teams } = await startedLeague("overviewscroll");
  const other = teams.find(
    (t) => t.id !== league.userTeamId,
  ) as (typeof teams)[number];
  const path = `/leagues/${league.id}/teams/${other.id}`;
  await signInThroughUi(page, user.email, user.password, path);
  const roster = page.getByRole("region", { name: /roster$/ });
  await expect(roster.locator("tbody tr")).toHaveCount(15);

  // Follow the first player's link. Clicking scrolls the page a little to
  // bring the row clear of the bottom tab bar.
  await roster.locator("tbody tr").first().getByRole("link").click();
  await expect(page).toHaveURL(/\/players\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("region", { name: "Player" })).toBeVisible();
  // The new page starts at the top: its header and the way back are in view.
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(
    page.getByRole("link", { name: "All leagues" }),
  ).toBeInViewport();

  // Back goes to the team page.
  await page.goBack();
  await expect(roster.locator("tbody tr")).toHaveCount(15);
});

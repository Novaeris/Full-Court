import { gameRecap } from "@fullcourt/game-rules";
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
 * Game recaps, against the real worker: the page's recap is what the rule
 * writes for the game, and what it says is checked against the box score.
 */

test.describe("game recaps", () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "runs once, on desktop");
  });

  test("a finished game has a recap that matches its box score", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const { user, api, league, teams } = await startedLeague("recap");
    const name = (id: string) => {
      const t = teams.find((x) => x.id === id)!;
      return `${t.city} ${t.nickname}`;
    };

    await api.leagues.simulate(league.id, { kind: "week" });
    await finishJob(api, league.id);
    const { games } = await api.leagues.schedule(league.id, {
      team: league.userTeamId as string,
    });
    const finals = games.filter((g) => g.status === "final");
    expect(finals.length).toBeGreaterThan(3);

    const base = `/leagues/${league.id}`;
    await signInThroughUi(page, user.email, user.password, base);

    for (const g of finals.slice(0, 4)) {
      const detail = await api.leagues.game(league.id, g.id);
      const homeScore = g.homeScore as number;
      const awayScore = g.awayScore as number;
      const expected = gameRecap({
        home: { id: g.homeTeamId, name: name(g.homeTeamId) },
        away: { id: g.awayTeamId, name: name(g.awayTeamId) },
        homeScore,
        awayScore,
        overtimes: g.overtimes,
        lines: detail.lines.map((l) => ({
          playerId: l.playerId,
          name: `${l.firstName} ${l.lastName}`,
          teamId: l.teamId,
          points: l.points,
          rebounds: l.rebounds,
          assists: l.assists,
          steals: l.steals,
          blocks: l.blocks,
          threes: l.tpm,
        })),
      });

      await page.goto(`${base}/games/${g.id}`);
      const recap = page.getByRole("region", { name: "Recap" });
      await expect(
        recap.getByText(expected.headline, { exact: true }),
      ).toBeVisible();
      for (const note of expected.notes) {
        await expect(recap.getByText(note, { exact: true })).toBeVisible();
      }

      // The headline's winner and score are the game's own.
      const winner = homeScore >= awayScore ? g.homeTeamId : g.awayTeamId;
      expect(expected.headline.startsWith(name(winner))).toBe(true);
      expect(expected.headline).toContain(
        `${Math.max(homeScore, awayScore)}-${Math.min(homeScore, awayScore)}`,
      );

      // "X led TEAM with N points" says what the box score says.
      for (const note of expected.notes) {
        const led = note.match(/ led (.+) with (\d+) points?\.$/);
        if (!led) continue;
        const team = teams.find((t) => name(t.id) === led[1]);
        expect(team).toBeDefined();
        const best = Math.max(
          ...detail.lines
            .filter((l) => l.teamId === team?.id)
            .map((l) => l.points),
        );
        expect(Number(led[2])).toBe(best);
      }
    }
  });

  test("a game that hasn't been played has no recap, and the page fits the screen", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const { user, api, league } = await startedLeague("recaplayout");
    await api.leagues.simulate(league.id, { kind: "day" });
    await finishJob(api, league.id);
    const { games } = await api.leagues.schedule(league.id, {
      team: league.userTeamId as string,
    });
    const played = games.find((g) => g.status === "final")!;
    const later = games.find((g) => g.status === "scheduled")!;
    const base = `/leagues/${league.id}/games`;

    await signInThroughUi(
      page,
      user.email,
      user.password,
      `${base}/${later.id}`,
    );
    await expect(
      page.getByRole("heading", { name: "This game hasn't been played yet" }),
    ).toBeVisible();
    await expect(page.getByRole("region", { name: "Recap" })).toHaveCount(0);

    await page.goto(`${base}/${played.id}`);
    await expect(page.getByRole("region", { name: "Recap" })).toBeVisible();
    await noOverflow(page);
    await touchTargets(page);
    await expectAccessible(page);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.reload();
    await expect(page.getByRole("region", { name: "Recap" })).toBeVisible();
    await noOverflow(page);
  });
});

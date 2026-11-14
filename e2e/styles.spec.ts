import { chooseTeamStrategy } from "@fullcourt/game-rules";
import { expect, test } from "@playwright/test";
import { startedLeague } from "./support/season";
import { finishJob } from "./support/worker";

/**
 * How teams play, against the real worker: each computer team plays the style
 * its roster suits (the rule is in game-rules), the owner's team plays the
 * strategy the owner saved, and the league has a mix of styles. The style a
 * team played is in its game's replay recipe.
 */

type Snapshot = {
  home: { id: string; strategy: string[] };
  away: { id: string; strategy: string[] };
};

test.describe("how teams play", () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "runs once, on desktop");
  });

  test("computer teams play to their strengths; the owner's team plays as told", async () => {
    test.setTimeout(240_000);
    const { api, league, teams } = await startedLeague("styles");
    await api.leagues.simulate(league.id, { kind: "day" });
    await finishJob(api, league.id);

    // The style each team played on day 1, from its games' recipes.
    const { games } = await api.leagues.schedule(league.id, { day: 1 });
    const played = new Map<string, string[]>();
    for (const g of games.filter((x) => x.status === "final")) {
      const detail = await api.leagues.game(league.id, g.id);
      expect(detail.replayStatus).toBe("available");
      const snapshot = detail.replay?.snapshot as unknown as Snapshot;
      played.set(snapshot.home.id, snapshot.home.strategy);
      played.set(snapshot.away.id, snapshot.away.strategy);
    }
    expect(played.size).toBe(teams.length);

    // The owner's team plays the usual way: they haven't set anything.
    expect(played.get(league.userTeamId as string)).toEqual([
      "normal",
      "normal",
      "balanced",
    ]);

    // Every computer team plays what the rule says for its roster.
    let different = 0;
    for (const team of teams) {
      if (team.id === league.userTeamId) continue;
      const roster = (await api.leagues.team(league.id, team.id)).players;
      const expected = chooseTeamStrategy(
        roster.map((p) => ({
          overall: p.overall,
          threePoint: p.ratings.threePoint,
          speed: p.ratings.speed,
          stamina: p.ratings.stamina,
          perimeterD: p.ratings.perimeterD,
          interiorD: p.ratings.interiorD,
        })),
      );
      const got = played.get(team.id);
      expect(got).toEqual([
        expected.pace,
        expected.threePointFocus,
        expected.defense,
      ]);
      if (got?.join() !== "normal,normal,balanced") different++;
    }
    // A league of mixed styles, not one default style for all.
    expect(different).toBeGreaterThanOrEqual(4);
    expect(
      new Set([...played.values()].map((s) => s.join())).size,
    ).toBeGreaterThanOrEqual(3);

    // The owner sets their own, and that is what their team plays next.
    const mine = await api.leagues.strategy(league.id);
    await api.leagues.updateStrategy(league.id, {
      strategy: { pace: "fast", threePointFocus: "high", defense: "interior" },
      starters: [],
    });
    expect(mine.teamId).toBe(league.userTeamId);
    await api.leagues.simulate(league.id, { kind: "day" });
    await finishJob(api, league.id);
    const next = (await api.leagues.schedule(league.id, { day: 2 })).games.find(
      (g) =>
        g.status === "final" &&
        (g.homeTeamId === league.userTeamId ||
          g.awayTeamId === league.userTeamId),
    );
    expect(next).toBeDefined();
    const detail = await api.leagues.game(
      league.id,
      (next as NonNullable<typeof next>).id,
    );
    const snap = detail.replay?.snapshot as unknown as Snapshot;
    const side = snap.home.id === league.userTeamId ? snap.home : snap.away;
    expect(side.strategy).toEqual(["fast", "high", "interior"]);
  });
});

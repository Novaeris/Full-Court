import { expect, test } from "@playwright/test";
import { startedLeague } from "./support/season";
import { finishJob } from "./support/worker";

/**
 * Computer teams re-signing their players, against the real server and
 * database: when a season ends, the teams keep some of the players whose
 * contracts end with it, on longer contracts, and never the owner's.
 */

test.describe("computer teams re-sign players", () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "runs once, on desktop");
  });

  test("they keep players whose contracts end, and leave the owner's alone", async () => {
    test.setTimeout(420_000);
    const { api, league } = await startedLeague("resign");
    await api.leagues.simulate(league.id, { kind: "season" });
    await finishJob(api, league.id);
    await api.leagues.simulate(league.id, { kind: "season" });
    await finishJob(api, league.id);
    const year = (await api.leagues.simulation(league.id)).season?.year;
    expect(year).toEqual(expect.any(Number));

    const before = await api.leagues.exportLeague(league.id);
    const endingNow = (before.tables.players ?? []).filter(
      (p) => p.status === "active" && p.contract_expires === year && p.team_id,
    );
    expect(endingNow.length).toBeGreaterThan(0);
    const mine = new Set(
      endingNow.filter((p) => p.team_id === league.userTeamId).map((p) => p.id),
    );

    await api.leagues.startNextSeason(league.id);
    const after = await api.leagues.exportLeague(league.id);

    // The re-signings are recorded before the new season's first day.
    const signed = (after.tables.player_transactions ?? []).filter(
      (t) => t.kind === "extended" && t.season_year === year && t.day === 0,
    );
    expect(signed.length).toBeGreaterThan(0);
    // Not everybody: teams keep the players they want, not their whole bench.
    expect(signed.length).toBeLessThan(endingNow.length);
    const players = new Map(
      (after.tables.players ?? []).map((p) => [p.id, p] as const),
    );
    const wasEnding = new Set(endingNow.map((p) => p.id));
    for (const t of signed) {
      // It was a contract that was about to end, on a computer team, and now runs longer.
      expect(wasEnding.has(t.player_id)).toBe(true);
      expect(mine.has(t.player_id)).toBe(false);
      expect(t.team_id).not.toBe(league.userTeamId);
      expect(t.years).toBeGreaterThanOrEqual(2);
      expect(t.salary).toEqual(expect.any(Number));
      const p = players.get(t.player_id);
      if (p && p.status === "active" && p.team_id) {
        // Still under that contract in the new season (it hasn't been cut or traded since).
        expect(Number(p.contract_expires)).toBeGreaterThanOrEqual(
          Number(year) + 1,
        );
      }
    }
    // The owner's own players whose contracts ended became free agents as before.
    for (const id of mine) {
      expect(signed.some((t) => t.player_id === id)).toBe(false);
    }
  });
});

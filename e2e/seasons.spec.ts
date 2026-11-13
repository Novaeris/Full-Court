import { expect, test } from "@playwright/test";
import { makeRosterLegal, playDraft, startedLeague } from "./support/season";
import { finishJob } from "./support/worker";

type Api = Awaited<ReturnType<typeof startedLeague>>["api"];

/**
 * The first offseason, step by step: staff, the camp's places and rules, the
 * budget, and what the stages refuse. It leaves the league in the preseason.
 */
async function firstOffseason(api: Api, leagueId: string) {
  // Staff: at most one person in each role (a contract may just have ended),
  // a market for every role, and a budget.
  const staff = await api.leagues.staff(leagueId);
  const roles = staff.team.map((s) => s.role);
  expect(new Set(roles).size).toBe(roles.length);
  expect(staff.payroll).toBeLessThanOrEqual(staff.budget);
  for (const role of [
    "head-coach",
    "development-coach",
    "conditioning-coach",
    "scout",
  ]) {
    expect(
      staff.market.filter((m) => m.role === role).length,
    ).toBeGreaterThanOrEqual(4);
  }

  // Let the scout go (if there is one) and hire the best scout on the market
  // that fits the budget.
  let now = staff;
  const scout = staff.team.find((s) => s.role === "scout");
  if (scout) {
    now = await api.leagues.releaseStaff(leagueId, { staffId: scout.id });
    expect(now.team.some((s) => s.role === "scout")).toBe(false);
    expect(now.market.some((m) => m.id === scout.id)).toBe(true);
  }
  const best = now.market
    .filter((m) => m.role === "scout" && now.payroll + m.salary <= now.budget)
    .sort((a, b) => b.rating - a.rating)[0]!;
  const hired = await api.leagues.hireStaff(leagueId, {
    staffId: best.id,
    years: 2,
  });
  expect(hired.team.find((s) => s.role === "scout")?.id).toBe(best.id);
  expect(hired.payroll).toBeLessThanOrEqual(hired.budget);
  // He is not on the market any more, so hiring him again is refused.
  await expect(
    api.leagues.hireStaff(leagueId, { staffId: best.id, years: 2 }),
  ).rejects.toMatchObject({ status: 409 });

  // Camp is not open during the draft.
  await expect(
    api.leagues.setCamp(leagueId, { assignments: [] }),
  ).rejects.toMatchObject({ status: 409, code: "wrong_stage" });

  await playDraft(api, leagueId);
  await makeRosterLegal(api, leagueId);
  await api.leagues.advanceOffseason(leagueId); // free agency
  const camp = await api.leagues.camp(leagueId);
  expect(camp.open).toBe(true);
  // More players than places is refused; exactly the places is fine.
  const players = camp.roster.map((r) => r.player.id);
  await expect(
    api.leagues.setCamp(leagueId, {
      assignments: players
        .slice(0, camp.places + 1)
        .map((playerId) => ({ playerId, program: "shooting" as const })),
    }),
  ).rejects.toMatchObject({ status: 422, code: "camp_full" });
  const set = await api.leagues.setCamp(leagueId, {
    assignments: players
      .slice(0, camp.places)
      .map((playerId) => ({ playerId, program: "athleticism" as const })),
  });
  expect(set.roster.filter((r) => r.program !== null)).toHaveLength(
    camp.places,
  );
  await api.leagues.advanceOffseason(leagueId); // camp
  const report = await api.leagues.offseason(leagueId);
  expect(report.stage).toBe("preseason");
  expect(report.campReport.length).toBeGreaterThanOrEqual(camp.places);
  // Camp only improves ratings, never past potential.
  for (const row of report.campReport) {
    expect(row.after).toBeGreaterThanOrEqual(row.before);
    expect(row.after).toBeLessThanOrEqual(
      Math.max(row.player.potential, row.before),
    );
  }
}

/**
 * Several seasons in a row. It runs after every other spec (see the
 * "long-runs" project in playwright.config.ts): a worker claims the oldest
 * queued job of any league, so while it plays seasons it would otherwise take
 * jobs that other specs are watching.
 */
test.describe("several seasons", () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== "long-runs", "runs once, last");
  });

  test("three seasons in a row: every offseason drafts, retires and refills", async () => {
    test.setTimeout(420_000);
    const { api, league } = await startedLeague("threeseasons");
    let first = 0;
    for (let i = 0; i < 3; i++) {
      await api.leagues.simulate(league.id, { kind: "season" });
      if (i === 0) {
        first = (await api.leagues.simulation(league.id)).season?.year ?? 0;
      }
      await finishJob(api, league.id);
      await api.leagues.simulate(league.id, { kind: "season" });
      await finishJob(api, league.id);
      await api.leagues.startNextSeason(league.id);
      if (i === 0) await firstOffseason(api, league.id);
      if (i === 0) {
        // Opened by hand above: only the season's opening is left.
        await api.leagues.advanceOffseason(league.id);
      } else if (i === 1) {
        // With AI Assist doing the drafting and keeping the roster legal, the
        // owner only presses the buttons.
        await api.leagues.setAiAssist(league.id, {
          aiAssist: { drafting: true, rosterCoverage: true },
        });
        await api.leagues.advanceOffseason(league.id); // the lottery
        await api.leagues.advanceOffseason(league.id); // every pick, the owner's too
        expect((await api.leagues.offseason(league.id)).stage).toBe(
          "free-agency",
        );
        for (let stage = 0; stage < 3; stage++) {
          await api.leagues.advanceOffseason(league.id);
        }
        const roster = await api.leagues.roster(league.id);
        expect(roster.players.length).toBeGreaterThanOrEqual(roster.min);
        expect(roster.players.length).toBeLessThanOrEqual(roster.max);
        await api.leagues.setAiAssist(league.id, {
          aiAssist: { drafting: false, rosterCoverage: false },
        });
      } else {
        await playDraft(api, league.id);
        await makeRosterLegal(api, league.id);
        for (let stage = 0; stage < 3; stage++) {
          await api.leagues.advanceOffseason(league.id);
        }
      }
      const report = await api.leagues.offseason(league.id);
      expect(report.year).toBe(first + i + 1);
      expect(report.draft).toHaveLength(24);
      expect(report.stage).toBeNull();
    }
    const { teams } = await api.leagues.teams(league.id);
    for (const t of teams) {
      const detail = await api.leagues.team(league.id, t.id);
      expect(detail.players.length).toBeGreaterThanOrEqual(12);
      expect(detail.players.length).toBeLessThanOrEqual(15);
      const numbers = detail.players.map((p) => p.jersey);
      expect(new Set(numbers).size).toBe(numbers.length);
    }
    // The league has aged three years and gained its draft classes.
    const state = await api.leagues.simulation(league.id);
    expect(state.season?.year).toBe(first + 3);
  });
});

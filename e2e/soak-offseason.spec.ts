import { test } from "@playwright/test";
import { makeRosterLegal, playDraft, startedLeague } from "./support/season";
import { finishJob } from "./support/worker";

/**
 * A soak test for offseason refusals (temporary, run with SOAK=1): plays leagues
 * through several offseasons and prints exactly what is refused, and where.
 */
const LEAGUES = Number(process.env.SOAK_LEAGUES ?? 6);

test.describe("offseason soak", () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(
      !process.env.SOAK || testInfo.project.name !== "desktop",
      "soak only",
    );
  });

  for (let n = 0; n < LEAGUES; n++) {
    test(`league ${n}`, async () => {
      test.setTimeout(900_000);
      const { api, league } = await startedLeague(`soak${n}`);
      let where = "start";
      try {
        for (let i = 0; i < 4; i++) {
          where = `season ${i}`;
          await api.leagues.simulate(league.id, { kind: "season" });
          await finishJob(api, league.id);
          await api.leagues.simulate(league.id, { kind: "season" });
          await finishJob(api, league.id);
          where = `next season ${i}`;
          await api.leagues.startNextSeason(league.id);
          where = `draft ${i}`;
          await playDraft(api, league.id);
          where = `roster ${i}`;
          await makeRosterLegal(api, league.id);
          for (let stage = 0; stage < 3; stage++) {
            where = `offseason ${i} stage ${stage}`;
            const before = await api.leagues.offseason(league.id);
            try {
              await api.leagues.advanceOffseason(league.id);
            } catch (error) {
              const roster = await api.leagues.roster(league.id);
              const staff = await api.leagues.staff(league.id);
              console.log(
                `SOAK-REFUSED league=${league.id} ${where} stage=${before.stage} error=${String(
                  (error as { code?: string }).code,
                )} roster=${roster.players.length} (min ${roster.min} max ${roster.max}) payroll=${staff.payroll}/${staff.budget}`,
              );
              throw error;
            }
          }
        }
        console.log(`SOAK-OK league=${league.id}`);
      } catch (error) {
        console.log(
          `SOAK-FAILED league=${league.id} at ${where}: ${String(error).slice(0, 300)}`,
        );
        throw error;
      }
    });
  }
});

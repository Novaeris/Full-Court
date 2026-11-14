import { createApiClient } from "@fullcourt/api-client";
import {
  SCHEDULE_PRESET_TIERS,
  type PlayoffConfig,
  type ScheduleRule,
} from "@fullcourt/game-types";
import { scheduleGames } from "@fullcourt/game-rules";
import { expect, test } from "@playwright/test";
import {
  accessToken,
  createConfirmedUser,
  signInThroughUi,
} from "./support/auth";
import {
  expectAccessible,
  makeRosterLegal,
  noOverflow,
  playDraft,
  touchTargets,
} from "./support/season";
import { finishJob } from "./support/worker";

/**
 * Season rules (the schedule and the playoff format), against the real server,
 * worker and database: they are set for the next season, the season being
 * played keeps the rules it began with, and the new season is built with them.
 */

const PLAYOFFS: PlayoffConfig = {
  teams: 4,
  seeding: "conference",
  autoQualifyDivisionLeaders: true,
  divisionLeaderTopSeeds: 2,
  roundSeriesLengths: [7, 7],
};

const SHORT: ScheduleRule = {
  preset: "short",
  tiers: SCHEDULE_PRESET_TIERS.short,
};

/** An eight-team owner league: two conferences of two divisions of two teams. */
async function smallLeague(label: string) {
  const user = await createConfirmedUser(label);
  const api = createApiClient({
    baseUrl:
      process.env.E2E_BASE_URL ??
      `http://localhost:${process.env.E2E_PORT ?? 3100}`,
    fetch,
    getAccessToken: () => accessToken(user.email, user.password),
  });
  const league = await api.leagues.create({
    name: "Rules league",
    setup: {
      config: {
        schemaVersion: 1,
        preset: "custom",
        region: "north-america",
        fantasyDraft: false,
        playoffs: PLAYOFFS,
      },
      shape: { conferences: 2, divisionsPerConference: 2, teamsPerDivision: 2 },
      localPlayers: [{ slot: 1, label: null }],
      franchises: [{ localPlayerSlot: 1, cityId: "na-us-new-york" }],
      identitySeed: `rules-${label}`,
    },
  });
  return { user, api, league };
}

/** Games each team played in the regular season, from a backup. */
async function gamesPerTeam(
  api: Awaited<ReturnType<typeof smallLeague>>["api"],
  leagueId: string,
  year: number,
) {
  const backup = await api.leagues.exportLeague(leagueId);
  const season = backup.tables.seasons?.find((s) => s.year === year);
  const games = (backup.tables.games ?? []).filter(
    (g) => g.season_id === season?.id && g.series_id === null,
  );
  const teams = backup.tables.teams?.length ?? 1;
  return { perTeam: (games.length * 2) / teams, season };
}

test.describe("season rules", () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "runs once, on desktop");
  });

  test("rules set now start with the next season, not this one", async () => {
    test.setTimeout(420_000);
    const { api, league } = await smallLeague("rules");
    const structure = await api.leagues.structure(league.id);
    const standardGames = scheduleGames(structure, {
      preset: "standard",
      tiers: SCHEDULE_PRESET_TIERS.standard,
    });
    const shortGames = scheduleGames(structure, SHORT);
    expect(standardGames).not.toBe(shortGames);

    // The league's first season is created when its first day is played.
    await api.leagues.simulate(league.id, { kind: "day" });
    await finishJob(api, league.id);
    expect((await api.leagues.simulation(league.id)).season).not.toBeNull();
    const start = await api.leagues.settings(league.id);
    expect(start.schedule.preset).toBe("standard");
    expect(start.next).toBeNull();

    // What can't be: a format the league can't hold, counts outside 1 to 8, a
    // named preset with someone else's counts.
    await expect(
      api.leagues.setSeasonRules(league.id, {
        schedule: start.schedule,
        playoffs: { ...PLAYOFFS, teams: 16, roundSeriesLengths: [7, 7, 7, 7] },
      }),
    ).rejects.toMatchObject({ status: 422, code: "invalid_rules" });
    await expect(
      api.leagues.setSeasonRules(league.id, {
        schedule: {
          preset: "custom",
          tiers: { division: 9, conference: 1, interconference: 1 },
        },
        playoffs: PLAYOFFS,
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      api.leagues.setSeasonRules(league.id, {
        schedule: { preset: "short", tiers: SCHEDULE_PRESET_TIERS.long },
        playoffs: PLAYOFFS,
      }),
    ).rejects.toMatchObject({ status: 422, code: "invalid_rules" });
    expect((await api.leagues.settings(league.id)).next).toBeNull();

    // Rules equal to those in force are not waiting for anything.
    const same = await api.leagues.setSeasonRules(league.id, {
      schedule: start.schedule,
      playoffs: PLAYOFFS,
    });
    expect(same.next).toBeNull();

    // A shorter season and a two-team playoff of one best-of-three series.
    const twoTeams: PlayoffConfig = {
      teams: 2,
      seeding: "league",
      autoQualifyDivisionLeaders: false,
      divisionLeaderTopSeeds: null,
      roundSeriesLengths: [3],
    };
    const set = await api.leagues.setSeasonRules(league.id, {
      schedule: SHORT,
      playoffs: twoTeams,
    });
    expect(set.next).toEqual({ schedule: SHORT, playoffs: twoTeams });
    // Nothing in force has changed.
    expect(set.schedule.preset).toBe("standard");
    expect(set.playoffs).toEqual(PLAYOFFS);

    // The season being played keeps its rules: the standard length, a four-team bracket.
    await api.leagues.simulate(league.id, { kind: "season" });
    await finishJob(api, league.id);
    const first = (await api.leagues.simulation(league.id)).season?.year;
    expect(first).toEqual(expect.any(Number));
    expect((await gamesPerTeam(api, league.id, first!)).perTeam).toBe(
      standardGames,
    );
    await api.leagues.simulate(league.id, { kind: "season" });
    await finishJob(api, league.id);
    const bracket = await api.leagues.playoffs(league.id);
    expect(bracket.rounds).toHaveLength(2);
    expect(bracket.series.every((s) => s.bestOf === 7)).toBe(true);

    // The next season is built with the new rules, and they are in force from then on.
    await api.leagues.startNextSeason(league.id);
    const now = await api.leagues.settings(league.id);
    expect(now.next).toBeNull();
    expect(now.schedule).toEqual(SHORT);
    expect(now.playoffs).toEqual(twoTeams);
    const second = first! + 1;
    const built = await gamesPerTeam(api, league.id, second);
    expect(built.season?.schedule_preset).toBe("short");
    expect(built.perTeam).toBe(shortGames);

    // ...and its playoffs follow them: two teams, one best-of-three series.
    // (The offseason comes first: the draft, free agency, camp.)
    await playDraft(api, league.id);
    await makeRosterLegal(api, league.id);
    for (let stage = 0; stage < 3; stage++) {
      await api.leagues.advanceOffseason(league.id);
    }
    await api.leagues.simulate(league.id, { kind: "season" });
    await finishJob(api, league.id);
    await api.leagues.simulate(league.id, { kind: "season" });
    await finishJob(api, league.id);
    const finals = await api.leagues.playoffs(league.id);
    expect(finals.rounds).toHaveLength(1);
    expect(finals.series).toHaveLength(1);
    expect(finals.series[0]?.bestOf).toBe(3);
  });

  test("rules set before the first season exists apply to it", async () => {
    test.setTimeout(240_000);
    const { api, league } = await smallLeague("rulesfirst");
    const structure = await api.leagues.structure(league.id);
    const set = await api.leagues.setSeasonRules(league.id, {
      schedule: SHORT,
      playoffs: PLAYOFFS,
    });
    expect(set.next).toEqual({ schedule: SHORT });
    // The first season is built with them, and nothing is left waiting.
    await api.leagues.simulate(league.id, { kind: "day" });
    await finishJob(api, league.id);
    const year = (await api.leagues.simulation(league.id)).season?.year;
    const built = await gamesPerTeam(api, league.id, year!);
    expect(built.season?.schedule_preset).toBe("short");
    expect(built.perTeam).toBe(scheduleGames(structure, SHORT));
    const now = await api.leagues.settings(league.id);
    expect(now.next).toBeNull();
    expect(now.schedule).toEqual(SHORT);
  });

  test("leagues made before league rules existed can't change them", async () => {
    const user = await createConfirmedUser("rulesold");
    const api = createApiClient({
      baseUrl:
        process.env.E2E_BASE_URL ??
        `http://localhost:${process.env.E2E_PORT ?? 3100}`,
      fetch,
      getAccessToken: () => accessToken(user.email, user.password),
    });
    const old = await api.leagues.create({ name: "Old", size: "compact" });
    const settings = await api.leagues.settings(old.id);
    expect(settings.legacy).toBe(true);
    await expect(
      api.leagues.setSeasonRules(old.id, {
        schedule: settings.schedule,
        playoffs: settings.playoffs,
      }),
    ).rejects.toMatchObject({ status: 409, code: "legacy_league" });
    // Another person's league isn't there to change.
    const other = await createConfirmedUser("rulesother");
    const stranger = createApiClient({
      baseUrl:
        process.env.E2E_BASE_URL ??
        `http://localhost:${process.env.E2E_PORT ?? 3100}`,
      fetch,
      getAccessToken: () => accessToken(other.email, other.password),
    });
    await expect(
      stranger.leagues.setSeasonRules(old.id, {
        schedule: settings.schedule,
        playoffs: settings.playoffs,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  test("the Settings form saves them, fits the screen and passes axe", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const { user, api, league } = await smallLeague("rulespage");
    const structure = await api.leagues.structure(league.id);
    const longGames = scheduleGames(structure, {
      preset: "long",
      tiers: SCHEDULE_PRESET_TIERS.long,
    });
    await signInThroughUi(
      page,
      user.email,
      user.password,
      `/leagues/${league.id}/settings`,
    );
    const card = page.getByRole("region", {
      name: "Rules for the next season",
    });
    await expect(card).toBeVisible();
    const save = card.getByRole("button", { name: "Save for the next season" });
    await expect(save).toBeDisabled();

    // Choosing another schedule shows the length, and unlocks saving.
    await card.getByLabel("Schedule", { exact: true }).selectOption("long");
    await expect(
      card.getByText(`Every team plays ${longGames} games.`),
    ).toBeVisible();
    await expect(save).toBeEnabled();
    // Changing a count makes it a custom schedule.
    await card
      .getByLabel("Games against each division rival")
      .selectOption("1");
    await expect(card.getByLabel("Schedule", { exact: true })).toHaveValue(
      "custom",
    );

    await card.getByLabel("Schedule", { exact: true }).selectOption("long");
    await save.click();
    await expect(card.getByRole("status").first()).toContainText(
      "start with the next season",
    );
    await expect
      .poll(
        async () =>
          (await api.leagues.settings(league.id)).next?.schedule?.preset,
      )
      .toBe("long");
    await expect(
      card.getByText("Changes are waiting for the next season"),
    ).toBeVisible();

    await noOverflow(page);
    await touchTargets(page);
    await expectAccessible(page);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.reload();
    await expect(card).toBeVisible();
    await expect(card.getByLabel("Schedule", { exact: true })).toHaveValue(
      "long",
    );
    await noOverflow(page);
  });
});

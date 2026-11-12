import AxeBuilder from "@axe-core/playwright";
import { createApiClient } from "@fullcourt/api-client";
import { expect, test, type Page } from "@playwright/test";
import {
  accessToken,
  createConfirmedUser,
  signInThroughUi,
} from "./support/auth";
import { standardSetup } from "./support/league";

async function expectAccessible(page: Page) {
  // Streamed pages send <title> with the streamed content; wait for it.
  await expect(page).toHaveTitle(/\S/);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.map(
      (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
    ),
  ).toEqual([]);
}

async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
}

test("generate a compact league, scout, choose a team and view players", async ({
  page,
}) => {
  const { email, password } = await createConfirmedUser("world");
  await signInThroughUi(page, email, password);

  // Leagues made through the API without Owner Mode settings start with no
  // team chosen: you scout, then choose.
  const api = createApiClient({
    baseUrl: new URL(page.url()).origin,
    fetch,
    getAccessToken: async () => accessToken(email, password),
  });
  const created = await api.leagues.create({
    name: "Scouting Trip",
    size: "compact",
  });
  await page.goto(`/leagues/${created.id}`);
  const leagueUrl = page.url();

  // 12 teams to choose from, in two conferences.
  await expect(
    page.getByRole("heading", { name: "Choose your team" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Eastern Conference" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Western Conference" }),
  ).toBeVisible();
  const chooseButtons = page.getByRole("button", { name: /^Choose / });
  await expect(chooseButtons).toHaveCount(12);
  await noOverflow(page);
  await expectAccessible(page);

  // Scout a team's roster before choosing.
  const firstTeamLink = page
    .getByRole("region", { name: "Eastern Conference" })
    .getByRole("listitem")
    .first()
    .getByRole("link");
  const firstTeamName = (
    await firstTeamLink.locator("span.font-semibold").innerText()
  ).trim();
  await firstTeamLink.click();
  await expect(
    page.getByRole("heading", { name: firstTeamName }),
  ).toBeVisible();
  const roster = page.getByRole("region", { name: `${firstTeamName} roster` });
  await expect(roster.locator("tbody tr")).toHaveCount(15);
  await noOverflow(page);
  await expectAccessible(page);

  // Open a player.
  await roster.locator("tbody tr").first().getByRole("link").click();
  await expect(page).toHaveURL(/\/players\/[0-9a-f-]{36}$/);
  const profile = page.getByRole("region", { name: "Player" });
  await expect(profile.getByText("Overall", { exact: true })).toBeVisible();
  for (const group of [
    "Scoring",
    "Playmaking",
    "Rebounding",
    "Defense",
    "Athleticism",
  ]) {
    await expect(page.getByRole("heading", { name: group })).toBeVisible();
  }
  await noOverflow(page);
  await expectAccessible(page);

  // Roster tab asks you to choose first.
  await page.goto(`${leagueUrl}/roster`);
  await expect(
    page.getByRole("heading", { name: "Choose your team first" }),
  ).toBeVisible();

  // Choose a team.
  await page.goto(leagueUrl);
  await page.getByRole("button", { name: `Choose ${firstTeamName}` }).click();
  await expect(page.getByRole("status")).toContainText(firstTeamName);
  await expect(page.getByRole("region", { name: "Your team" })).toContainText(
    firstTeamName,
  );
  await expect(page.getByRole("button", { name: /^Choose / })).toHaveCount(0);

  // Roster now goes straight to your team.
  await page
    .getByRole("navigation", { name: "League" })
    .getByRole("link", { name: "Roster" })
    .click();
  await expect(
    page.getByRole("heading", { name: firstTeamName }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Team" })).toContainText(
    "Your team",
  );
});

test.describe("world API", () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "runs once, on desktop");
  });

  test("teams, rosters and choosing a team", async ({ baseURL }) => {
    const user = await createConfirmedUser("worldapi");
    const api = createApiClient({
      baseUrl: baseURL ?? "",
      fetch,
      getAccessToken: async () => accessToken(user.email, user.password),
    });

    const league = await api.leagues.create({ name: "Big One" });
    expect(league).toMatchObject({
      size: "standard",
      status: "setup",
      userTeamId: null,
    });

    const { teams } = await api.leagues.teams(league.id);
    expect(teams).toHaveLength(30);
    expect(new Set(teams.map((t) => t.abbreviation)).size).toBe(30);

    const detail = await api.leagues.team(league.id, teams[0]!.id);
    expect(detail.players).toHaveLength(15);
    expect(detail.players.map((p) => p.overall)).toEqual(
      [...detail.players.map((p) => p.overall)].sort((a, b) => b - a),
    );

    const chosen = await api.leagues.chooseTeam(league.id, {
      teamId: teams[3]!.id,
    });
    expect(chosen).toMatchObject({
      status: "active",
      userTeamId: teams[3]!.id,
    });
    await expect(
      api.leagues.chooseTeam(league.id, { teamId: teams[4]!.id }),
    ).rejects.toMatchObject({ status: 409, code: "team_already_chosen" });
  });

  test("two leagues get different worlds", async ({ baseURL }) => {
    const user = await createConfirmedUser("worlds");
    const api = createApiClient({
      baseUrl: baseURL ?? "",
      fetch,
      getAccessToken: async () => accessToken(user.email, user.password),
    });
    const a = await api.leagues.create({ name: "A", size: "compact" });
    const b = await api.leagues.create({ name: "B", size: "compact" });
    const namesA = (await api.leagues.teams(a.id)).teams
      .map((t) => t.city)
      .sort();
    const namesB = (await api.leagues.teams(b.id)).teams
      .map((t) => t.city)
      .sort();
    expect(namesA).not.toEqual(namesB);
  });

  test("another user can't see or pick in someone else's world", async ({
    baseURL,
  }) => {
    const owner = await createConfirmedUser("worldowner");
    const other = await createConfirmedUser("worldother");
    const asOwner = createApiClient({
      baseUrl: baseURL ?? "",
      fetch,
      getAccessToken: async () => accessToken(owner.email, owner.password),
    });
    const asOther = createApiClient({
      baseUrl: baseURL ?? "",
      fetch,
      getAccessToken: async () => accessToken(other.email, other.password),
    });
    const league = await asOwner.leagues.create({
      name: "Mine",
      size: "compact",
    });
    const { teams } = await asOwner.leagues.teams(league.id);

    await expect(asOther.leagues.teams(league.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      asOther.leagues.team(league.id, teams[0]!.id),
    ).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      asOther.leagues.chooseTeam(league.id, { teamId: teams[0]!.id }),
    ).rejects.toMatchObject({ status: 404 });

    // A team from another league is not a valid choice.
    const otherLeague = await asOther.leagues.create({
      name: "Theirs",
      size: "compact",
    });
    await expect(
      asOther.leagues.chooseTeam(otherLeague.id, { teamId: teams[0]!.id }),
    ).rejects.toMatchObject({ status: 404, code: "team_not_found" });
  });

  test("create an Owner Mode league", async ({ baseURL }) => {
    const user = await createConfirmedUser("ownerapi");
    const api = createApiClient({
      baseUrl: baseURL ?? "",
      fetch,
      getAccessToken: async () => accessToken(user.email, user.password),
    });
    const setup = {
      config: {
        schemaVersion: 1 as const,
        preset: "standard" as const,
        region: "europe" as const,
        fantasyDraft: false,
        playoffs: {
          teams: 16,
          seeding: "conference" as const,
          autoQualifyDivisionLeaders: true,
          divisionLeaderTopSeeds: 4,
          roundSeriesLengths: [7, 7, 7, 7] as (3 | 5 | 7)[],
        },
      },
      shape: { conferences: 2, divisionsPerConference: 3, teamsPerDivision: 5 },
      localPlayers: [
        { slot: 1, label: null },
        { slot: 2, label: "Sam" },
      ],
      franchises: [
        {
          localPlayerSlot: 1,
          cityId: "eu-gb-london",
          aiAssist: {
            trades: true,
            rosterCoverage: false,
            rosterManagement: true,
            scouting: false,
            drafting: false,
          },
        },
        { localPlayerSlot: 1, cityId: "eu-fr-paris" },
        { localPlayerSlot: 2, cityId: "eu-de-berlin" },
      ],
      identitySeed: "test-identity-seed",
    };

    const league = await api.leagues.create({ name: "Euro League", setup });
    expect(league).toMatchObject({ size: "standard", status: "active" });
    expect(league.userTeamId).not.toBeNull();

    const { teams } = await api.leagues.teams(league.id);
    expect(teams).toHaveLength(30);
    const cities = teams.map((t) => t.city);
    expect(new Set(cities).size).toBe(30);
    expect(cities).toEqual(
      expect.arrayContaining(["London", "Paris", "Berlin"]),
    );
    expect(new Set(teams.map((t) => t.conferenceId)).size).toBe(2);
    expect(new Set(teams.map((t) => t.divisionId)).size).toBe(6);
    // Every division has five teams.
    const perDivision = Object.values(
      Object.groupBy(teams, (t) => t.divisionId),
    ).map((group) => group?.length);
    expect(perDivision).toEqual([5, 5, 5, 5, 5, 5]);
    const mine = teams.find((t) => t.id === league.userTeamId);
    expect(["London", "Paris"]).toContain(mine?.city);

    // AI Assist is saved per franchise; AI-run teams never have any.
    const flags = (city: string) => teams.find((t) => t.city === city);
    expect(flags("London")?.aiAssist).toEqual({
      trades: true,
      rosterCoverage: false,
      rosterManagement: true,
      scouting: false,
      drafting: false,
    });
    expect(Object.values(flags("Paris")?.aiAssist ?? {})).not.toContain(true);
    expect(flags("Berlin")?.localPlayerSlot).toBe(2);
    for (const t of teams.filter((t) => t.localPlayerSlot === null)) {
      expect(Object.values(t.aiAssist)).not.toContain(true);
    }

    // The same identity seed gives the same franchises; rosters differ.
    const again = await api.leagues.create({ name: "Euro League 2", setup });
    const second = await api.leagues.teams(again.id);
    expect(
      second.teams.map((t) => [t.city, t.nickname, t.primaryColor]),
    ).toEqual(teams.map((t) => [t.city, t.nickname, t.primaryColor]));
  });

  test("Owner Mode setups are checked by the server", async ({ baseURL }) => {
    const user = await createConfirmedUser("ownerbad");
    const api = createApiClient({
      baseUrl: baseURL ?? "",
      fetch,
      getAccessToken: async () => accessToken(user.email, user.password),
    });
    const good = {
      config: {
        schemaVersion: 1 as const,
        preset: "custom" as const,
        region: "asia" as const,
        fantasyDraft: false,
        playoffs: {
          teams: 4,
          seeding: "conference" as const,
          autoQualifyDivisionLeaders: true,
          divisionLeaderTopSeeds: 2,
          roundSeriesLengths: [7, 7] as (3 | 5 | 7)[],
        },
      },
      shape: { conferences: 2, divisionsPerConference: 2, teamsPerDivision: 3 },
      localPlayers: [{ slot: 1, label: null }],
      franchises: [{ localPlayerSlot: 1, cityId: "as-jp-tokyo" }],
      identitySeed: "another-seed-1",
    };
    const bad = (name: string, setup: typeof good) =>
      expect(api.leagues.create({ name, setup })).rejects.toMatchObject({
        status: 400,
      });

    await bad("Wrong region", {
      ...good,
      franchises: [{ localPlayerSlot: 1, cityId: "eu-fr-paris" }],
    });
    await bad("Same city", {
      ...good,
      localPlayers: [
        { slot: 1, label: null },
        { slot: 2, label: null },
      ],
      franchises: [
        { localPlayerSlot: 1, cityId: "as-jp-tokyo" },
        { localPlayerSlot: 2, cityId: "as-jp-tokyo" },
      ],
    });
    await bad("Idle player", {
      ...good,
      localPlayers: [
        { slot: 1, label: null },
        { slot: 2, label: null },
      ],
    });
    await bad("Odd shape", {
      ...good,
      shape: {
        conferences: 1,
        divisionsPerConference: 1,
        teamsPerDivision: 29,
      },
    });
    await bad("Standard mismatch", {
      ...good,
      config: { ...good.config, preset: "standard" as const },
    });
    await bad("Too few spots", {
      ...good,
      config: {
        ...good.config,
        playoffs: {
          ...good.config.playoffs,
          teams: 2,
          roundSeriesLengths: [7],
        },
      },
    });
    await bad("Pale colour", {
      ...good,
      franchises: [
        { localPlayerSlot: 1, cityId: "as-jp-tokyo", primaryColor: "#ffff00" },
      ] as typeof good.franchises,
    });

    // Nothing was created by the rejected requests.
    expect((await api.leagues.list()).leagues).toHaveLength(0);
    const league = await api.leagues.create({
      name: "Tokyo Nights",
      setup: good,
    });
    expect(league).toMatchObject({ size: "custom", status: "active" });
  });

  test("franchise identity and names are saved, and checked", async ({
    baseURL,
  }) => {
    const user = await createConfirmedUser("identity");
    const api = createApiClient({
      baseUrl: baseURL ?? "",
      fetch,
      getAccessToken: async () => accessToken(user.email, user.password),
    });
    const base = standardSetup();
    const preview = await api.leagues.create({ name: "Probe", setup: base });
    const probe = await api.leagues.structure(preview.id);
    const conference = probe.conferences[0]!;
    const division = conference.divisions[0]!;
    await api.leagues.delete(preview.id);

    // Chosen identity and names are saved.
    const league = await api.leagues.create({
      name: "Identity",
      setup: {
        ...base,
        franchises: [
          {
            localPlayerSlot: 1,
            cityId: "na-us-new-york",
            nickname: "Harbor Hawks",
            primaryColor: "#0b3d91",
            secondaryColor: "#ffd200",
            logoId: "logo-03",
          },
        ],
        names: {
          conferences: { [conference.id]: "Harbor Conference" },
          divisions: { [division.id]: "Lighthouse" },
        },
      } as typeof base,
    });
    const { teams } = await api.leagues.teams(league.id);
    expect(teams.find((t) => t.localPlayerSlot === 1)).toMatchObject({
      city: "New York",
      nickname: "Harbor Hawks",
      primaryColor: "#0b3d91",
      secondaryColor: "#ffd200",
      logoId: "logo-03",
    });
    const structure = await api.leagues.structure(league.id);
    expect(structure.conferences[0]).toMatchObject({
      id: conference.id,
      name: "Harbor Conference",
    });
    expect(structure.conferences[0]!.divisions[0]).toMatchObject({
      id: division.id,
      name: "Lighthouse",
    });
    await api.leagues.delete(league.id);

    const bad = (patch: object) =>
      expect(
        api.leagues.create({
          name: "Bad",
          setup: { ...base, ...patch } as typeof base,
        }),
      ).rejects.toMatchObject({ status: 400 });
    const one = base.franchises[0]!;
    await bad({ franchises: [{ ...one, logoId: "logo-99" }] });
    await bad({
      franchises: [
        { ...one, primaryColor: "#112233", secondaryColor: "#112233" },
      ],
    });
    await bad({
      names: { conferences: { "no-such-conference": "X" }, divisions: {} },
    });
    await bad({
      names: {
        conferences: {
          [conference.id]: "Same",
          [probe.conferences[1]!.id]: "same",
        },
        divisions: {},
      },
    });
    await bad({
      localPlayers: [
        { slot: 1, label: null },
        { slot: 2, label: null },
      ],
      franchises: [
        { ...one, nickname: "Hawks" },
        { localPlayerSlot: 2, cityId: "na-us-boston", nickname: " hawks" },
      ],
    });
    expect((await api.leagues.list()).leagues).toHaveLength(0);
  });
});

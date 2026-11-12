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
  await expect(page).toHaveTitle(/\S/);
  const size = page.viewportSize();
  if (size) await page.setViewportSize({ width: size.width, height: 4000 });
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  if (size) await page.setViewportSize(size);
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

const clientFor = (
  baseURL: string | undefined,
  u: { email: string; password: string },
) =>
  createApiClient({
    baseUrl: baseURL ?? "",
    fetch,
    getAccessToken: async () => accessToken(u.email, u.password),
  });

const next = (page: Page) =>
  page.getByRole("button", { name: /^Next: / }).click();

test.describe("server: every region and shape", () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "runs once, on desktop");
  });

  test("the database accepts each region with several league shapes", async ({
    baseURL,
  }) => {
    test.setTimeout(240_000);
    const user = await createConfirmedUser("sweep");
    const api = clientFor(baseURL, user);
    const cities = {
      "north-america": "na-us-new-york",
      "south-america": "sa-br-sao-paulo",
      europe: "eu-gb-london",
      asia: "as-jp-tokyo",
      australia: "au-au-sydney",
    } as const;
    // Standard, the 32-team maximum, one conference, the 8-team minimum, odd conference count.
    const shapes = [
      { conferences: 2, divisionsPerConference: 3, teamsPerDivision: 5 },
      { conferences: 4, divisionsPerConference: 4, teamsPerDivision: 2 },
      { conferences: 1, divisionsPerConference: 4, teamsPerDivision: 5 },
      { conferences: 2, divisionsPerConference: 2, teamsPerDivision: 2 },
      { conferences: 3, divisionsPerConference: 2, teamsPerDivision: 3 },
    ];
    const base = standardSetup();
    for (const [region, cityId] of Object.entries(cities)) {
      for (const shape of shapes) {
        const total =
          shape.conferences *
          shape.divisionsPerConference *
          shape.teamsPerDivision;
        const standard = total === 30;
        const playoffs =
          total === 8
            ? { teams: 4, roundSeriesLengths: [7, 7] as (3 | 5 | 7)[] }
            : total === 18
              ? { teams: 8, roundSeriesLengths: [7, 7, 7] as (3 | 5 | 7)[] }
              : {
                  teams: 16,
                  roundSeriesLengths: [7, 7, 7, 7] as (3 | 5 | 7)[],
                };
        const league = await api.leagues.create({
          name: `${region} ${total}`,
          setup: {
            ...base,
            config: {
              ...base.config,
              preset: standard ? "standard" : "custom",
              region: region as typeof base.config.region,
              playoffs: {
                ...base.config.playoffs,
                // Leagues without two even conferences seed league-wide.
                seeding:
                  shape.conferences === 2 || shape.conferences === 4
                    ? "conference"
                    : "league",
                divisionLeaderTopSeeds: 2,
                ...playoffs,
              },
            },
            shape,
            franchises: [{ localPlayerSlot: 1, cityId }],
          },
        });
        const { teams } = await api.leagues.teams(league.id);
        expect(teams, `${region} ${total}`).toHaveLength(total);
        expect(new Set(teams.map((t) => t.cityId)).size).toBe(total);
        const settings = await api.leagues.settings(league.id);
        expect(settings).toMatchObject({
          legacy: false,
          region,
          preset: standard ? "standard" : "custom",
        });
        await api.leagues.delete(league.id);
      }
    }
  });

  test("the stored rules are read back exactly, and old leagues get derived ones", async ({
    baseURL,
  }) => {
    const user = await createConfirmedUser("settings");
    const api = clientFor(baseURL, user);
    const base = standardSetup();
    const config = {
      ...base.config,
      region: "south-america" as const,
      fantasyDraft: true,
      playoffs: {
        teams: 8,
        seeding: "league" as const,
        autoQualifyDivisionLeaders: false,
        divisionLeaderTopSeeds: null,
        roundSeriesLengths: [3, 5, 7] as (3 | 5 | 7)[],
      },
    };
    const league = await api.leagues.create({
      name: "Rules",
      setup: {
        ...base,
        config,
        franchises: [{ localPlayerSlot: 1, cityId: "sa-br-sao-paulo" }],
      },
    });
    expect(await api.leagues.settings(league.id)).toEqual({
      legacy: false,
      preset: "standard",
      region: "south-america",
      fantasyDraft: true,
      playoffs: config.playoffs,
    });

    // Leagues made the original way have no stored rules: they get a derived view.
    const old = await api.leagues.create({ name: "Old", size: "compact" });
    expect(await api.leagues.settings(old.id)).toMatchObject({
      legacy: true,
      preset: "custom",
      region: null,
      fantasyDraft: false,
      playoffs: { teams: 4, seeding: "conference" },
    });
    const oldStandard = await api.leagues.create({ name: "Old standard" });
    expect((await api.leagues.settings(oldStandard.id)).playoffs).toMatchObject(
      {
        teams: 16,
        roundSeriesLengths: [7, 7, 7, 7],
      },
    );

    // Another user can't read them.
    const other = clientFor(
      baseURL,
      await createConfirmedUser("settings-other"),
    );
    await expect(other.leagues.settings(league.id)).rejects.toMatchObject({
      status: 404,
    });
  });
});

test("league settings show the stored rules, structure and franchises", async ({
  page,
  baseURL,
}) => {
  const user = await createConfirmedUser("settings-ui");
  const api = clientFor(baseURL, user);
  const base = standardSetup();
  const league = await api.leagues.create({
    name: "Rules UI",
    setup: {
      ...base,
      config: {
        ...base.config,
        region: "europe",
        fantasyDraft: true,
        playoffs: {
          ...base.config.playoffs,
          seeding: "league",
          roundSeriesLengths: [3, 5, 7, 7],
        },
      },
      franchises: [{ localPlayerSlot: 1, cityId: "eu-fr-paris" }],
    },
  });
  await signInThroughUi(page, user.email, user.password);
  await page.goto(`/leagues/${league.id}/settings`);
  const rules = page.getByRole("region", { name: "League rules" });
  await expect(rules).toContainText(
    "Standard: 30 teams in 2 conferences and 6 divisions",
  );
  await expect(rules).toContainText("Europe");
  await expect(rules).toContainText("16 of 30 teams, league-wide seeding");
  await expect(rules).toContainText("Round 1: best of 3");
  await expect(rules).toContainText("Quarterfinals: best of 5");
  await expect(rules).toContainText("Fantasy draft");
  await expect(rules.getByText("On", { exact: true })).toBeVisible();
  await noOverflow(page);
  await expectAccessible(page);
});

test("a league created the original way keeps working and can be renamed", async ({
  page,
  baseURL,
}) => {
  const user = await createConfirmedUser("legacy-ui");
  const api = clientFor(baseURL, user);
  const old = await api.leagues.create({ name: "Old Save", size: "compact" });
  await signInThroughUi(page, user.email, user.password);

  // It still asks you to choose a team, with its original conference names.
  await page.goto(`/leagues/${old.id}`);
  await expect(
    page.getByRole("heading", { name: "Choose your team" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Eastern Conference" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Choose / })).toHaveCount(12);

  // Settings explain the derived rules, and its conferences can be renamed.
  await page.goto(`/leagues/${old.id}/settings`);
  const rules = page.getByRole("region", { name: "League rules" });
  await expect(rules).toContainText(
    "created before league rules could be chosen",
  );
  await expect(rules).toContainText("Fictional cities");
  await expect(
    page.getByRole("region", { name: "Franchises and AI Assist" }),
  ).toHaveCount(0);
  const names = page.getByRole("region", { name: "Conferences and divisions" });
  await names.getByLabel("Conference name").first().fill("Atlantic");
  await names.getByRole("button", { name: "Save names" }).click();
  await expect(names.getByRole("status")).toContainText("Names saved.");
  await noOverflow(page);
  await expectAccessible(page);

  // Choose a team: it becomes Player 1's, and shows up as "Your team".
  await page.goto(`/leagues/${old.id}`);
  await page
    .getByRole("button", { name: /^Choose / })
    .first()
    .click();
  await expect(page.getByRole("region", { name: "Your team" })).toContainText(
    "Atlantic Conference",
  );
  await page.goto(`/leagues/${old.id}/settings`);
  await expect(
    page.getByRole("region", { name: "Franchises and AI Assist" }),
  ).toContainText("Player 1");
});

test.describe("dark theme", () => {
  test.use({ colorScheme: "dark" });

  test("league setup, overview and settings pass axe in dark mode", async ({
    page,
    baseURL,
  }) => {
    // Many pages, each checked by axe.
    test.setTimeout(150_000);
    const user = await createConfirmedUser("dark");
    const api = clientFor(baseURL, user);
    const league = await api.leagues.create({
      name: "Dark League",
      setup: {
        ...standardSetup(),
        localPlayers: [
          { slot: 1, label: null },
          { slot: 2, label: null },
        ],
        franchises: [
          { localPlayerSlot: 1, cityId: "na-us-new-york" },
          { localPlayerSlot: 2, cityId: "na-ca-vancouver" },
        ],
      },
    });
    await signInThroughUi(page, user.email, user.password);

    await page.goto("/leagues/new");
    await expectAccessible(page);
    await page.getByLabel("League name").fill("Dark Setup");
    await page.getByRole("radio", { name: /Custom/ }).check();
    await expectAccessible(page);
    await next(page);
    await expectAccessible(page);
    await page.getByLabel("Local players").selectOption("2");
    await next(page);
    const first = page.getByRole("group", { name: "Franchise 1 · Player 1" });
    await first.getByText("AI Assist: all off").click();
    await expectAccessible(page);
    await next(page);
    await expectAccessible(page);

    for (const path of ["", "/roster", "/teams", "/settings"]) {
      await page.goto(`/leagues/${league.id}${path}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectAccessible(page);
    }
  });
});

test("league pages fit a 320px screen", async ({ page, baseURL }) => {
  const user = await createConfirmedUser("narrow");
  const api = clientFor(baseURL, user);
  const league = await api.leagues.create({
    name: "Narrow League",
    setup: {
      ...standardSetup(),
      localPlayers: [
        { slot: 1, label: null },
        { slot: 2, label: null },
      ],
      franchises: [
        { localPlayerSlot: 1, cityId: "na-us-new-york" },
        { localPlayerSlot: 1, cityId: "na-us-chicago" },
        { localPlayerSlot: 2, cityId: "na-ca-vancouver" },
      ],
    },
  });
  await signInThroughUi(page, user.email, user.password);
  await page.setViewportSize({ width: 320, height: 700 });
  for (const path of ["", "/roster", "/teams", "/settings"]) {
    await page.goto(`/leagues/${league.id}${path}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await noOverflow(page);
  }
  await page.goto(`/leagues/${league.id}/teams`);
  await page
    .getByRole("link", { name: /Vancouver/ })
    .first()
    .click();
  await expect(page.getByRole("region", { name: "Team" })).toBeVisible();
  await noOverflow(page);
});

test("the setup flow works with the keyboard alone", async ({ page }) => {
  const user = await createConfirmedUser("keyboard");
  await signInThroughUi(page, user.email, user.password);
  await page.goto("/leagues/new");
  // Typing before the page has hydrated would be lost, so retry until the
  // typed name is accepted (the Next button only enables with a valid name).
  const name = page.getByLabel("League name");
  await expect(async () => {
    await name.focus();
    await page.keyboard.press("Control+A");
    await page.keyboard.type("Keyboard League");
    await expect(page.getByRole("button", { name: /^Next: / })).toBeEnabled({
      timeout: 1_000,
    });
  }).toPass();
  // Arrow keys move through the structure choices.
  await page.getByRole("radio", { name: /Standard/ }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("radio", { name: /Custom/ })).toBeChecked();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("radio", { name: /Standard/ })).toBeChecked();

  // Tab reaches the Next button and Enter on it moves to the next step,
  // with focus on the new step's heading.
  const nextButton = page.getByRole("button", { name: /^Next: / });
  for (let i = 0; i < 40; i++) {
    if (await nextButton.evaluate((el) => el === document.activeElement)) break;
    await page.keyboard.press("Tab");
  }
  await expect(nextButton).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { level: 2, name: "Playoffs and options" }),
  ).toBeFocused();
});

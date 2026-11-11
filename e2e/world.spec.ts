import AxeBuilder from "@axe-core/playwright";
import { createApiClient } from "@fullcourt/api-client";
import { expect, test, type Page } from "@playwright/test";
import {
  accessToken,
  createConfirmedUser,
  signInThroughUi,
} from "./support/auth";

async function expectAccessible(page: Page) {
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
  await signInThroughUi(page, email, password, "/leagues/new");

  await page.getByLabel("League name").fill("Scouting Trip");
  await page.getByLabel(/Compact/).check();
  await page.getByRole("button", { name: "Create league" }).click();
  await expect(page).toHaveURL(/\/leagues\/[0-9a-f-]{36}$/);
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
});

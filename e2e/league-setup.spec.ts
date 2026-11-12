import AxeBuilder from "@axe-core/playwright";
import { createApiClient } from "@fullcourt/api-client";
import { expect, test, type Page } from "@playwright/test";
import {
  accessToken,
  createConfirmedUser,
  signInThroughUi,
} from "./support/auth";

async function expectAccessible(page: Page) {
  await expect(page).toHaveTitle(/\S/);
  // The phone tab bar is fixed to the bottom of the screen. Check on a tall
  // viewport so a field scrolled under it by the test isn't flagged.
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
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

const nextStep = (page: Page, name: RegExp | string = /^Next: /) =>
  page.getByRole("button", { name }).click();

test("league setup: structure, playoffs, franchises and review at every size", async ({
  page,
}) => {
  const { email, password } = await createConfirmedUser("setup");
  await signInThroughUi(page, email, password);
  await page.goto("/leagues/new");

  // Step 1: the standard league is the default; a name is required to go on.
  await expect(
    page.getByRole("heading", { level: 1, name: "New league" }),
  ).toBeVisible();
  const next = page.getByRole("button", { name: /Next: Playoffs/ });
  await expect(next).toBeDisabled();
  await noOverflow(page);
  await expectAccessible(page);

  await page.getByLabel("League name").fill("Harbor League");
  await expect(next).toBeEnabled();

  // Custom leagues list only team counts that split into equal divisions.
  await page.getByRole("radio", { name: /Custom/ }).check();
  const teams = page.getByLabel("Number of teams");
  await expect(teams.locator("option[value='29']")).toHaveCount(0);
  await expect(teams.locator("option[value='31']")).toHaveCount(0);
  await expect(teams.locator("option[value='24']")).toHaveCount(1);
  await teams.selectOption("24");
  await expect(page.getByLabel("Conferences and divisions")).toBeVisible();
  await noOverflow(page);
  await expectAccessible(page);

  // Step 2: playoffs follow the league size.
  await next.click();
  await expect(
    page.getByRole("heading", { level: 2, name: "Playoffs and options" }),
  ).toBeFocused();
  // Leaving the standard league starts from the compact one: 4 playoff teams.
  await expect(page.getByLabel("Playoff teams")).toHaveValue("4");
  await page.getByLabel("Playoff teams").selectOption("16");
  await expect(page.getByLabel("Finals", { exact: true })).toHaveValue("7");
  await page.getByLabel("Round 1").selectOption("3");
  await page.getByLabel("Semifinals", { exact: true }).selectOption("5");
  await page.getByRole("radio", { name: /League-wide/ }).check();
  await page.getByLabel("Start with a fantasy draft").check();
  await page.getByLabel("Local players").selectOption("2");
  await noOverflow(page);
  await expectAccessible(page);

  // Step 3: a franchise for each player, never in the same city twice.
  await nextStep(page, "Next: Your franchises");
  await expect(
    page.getByRole("heading", { level: 2, name: "Your franchises" }),
  ).toBeFocused();
  const first = page.getByRole("group", { name: "Franchise 1 · Player 1" });
  const second = page.getByRole("group", { name: "Franchise 2 · Player 2" });
  const firstCity = first.getByLabel("City", { exact: true });
  const secondCity = second.getByLabel("City", { exact: true });
  await expect(firstCity).not.toHaveValue(await secondCity.inputValue());
  await firstCity.selectOption("na-ca-vancouver");
  await secondCity.selectOption("na-us-miami");
  // Picking a city another franchise has is refused: the choice stays put.
  await secondCity.selectOption("na-ca-vancouver");
  await expect(secondCity).toHaveValue("na-us-miami");
  await noOverflow(page);
  await expectAccessible(page);

  // Step 4: the review shows what was chosen, and previews the whole league.
  await nextStep(page, "Next: Review");
  const review = page.getByRole("definition");
  await expect(review.filter({ hasText: "Harbor League" })).toBeVisible();
  await expect(review.filter({ hasText: "North America" })).toBeVisible();
  await expect(review.filter({ hasText: "Vancouver" })).toBeVisible();
  await expect(review.filter({ hasText: "Miami" })).toBeVisible();
  await expect(review.filter({ hasText: "Yes" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "League preview" }),
  ).toBeVisible();
  await expect(page.getByText(/^Player [12]$/)).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Create league" }),
  ).toBeVisible();
  await noOverflow(page);
  await expectAccessible(page);
});

test("customise a franchise, shuffle and rename, then create", async ({
  page,
  baseURL,
}) => {
  const { email, password } = await createConfirmedUser("setup-custom");
  await signInThroughUi(page, email, password);
  await page.goto("/leagues/new");

  await page.getByLabel("League name").fill("Orca Cup");
  await nextStep(page); // playoffs
  await nextStep(page); // franchises

  const franchise = page.getByRole("group", { name: "Your franchise" });
  await franchise
    .getByLabel("City", { exact: true })
    .selectOption("na-ca-vancouver");
  // The generated name is offered until you type one.
  await expect(franchise.getByLabel("Team name")).toHaveValue("");
  await franchise.getByLabel("Team name").fill("Orcas");
  await franchise.getByLabel("Primary colour").fill("#0b3d91");
  await franchise.getByLabel("Secondary colour").fill("#ffd200");
  // The radio is visually hidden behind its logo tile, which is what people click.
  await franchise.getByRole("radio", { name: "Anchor" }).check({ force: true });
  await expect(franchise.getByRole("radio", { name: "Anchor" })).toBeChecked();
  await noOverflow(page);
  await expectAccessible(page);

  // A pale primary colour is explained and blocks the step.
  await franchise.getByLabel("Primary colour").fill("#ffee00");
  await expect(page.getByTestId("issues")).toContainText(
    "darker primary colour",
  );
  await expect(
    page.getByRole("button", { name: "Next: Review" }),
  ).toBeDisabled();
  await franchise.getByLabel("Primary colour").fill("#0b3d91");
  await expect(page.getByTestId("issues")).toHaveCount(0);

  // A second franchise for the same player, added and removed.
  await page.getByRole("button", { name: "Add another franchise" }).click();
  await expect(page.getByRole("group", { name: "Franchise 2" })).toBeVisible();
  await page
    .getByRole("button", { name: "Remove this franchise" })
    .last()
    .click();
  await expect(page.getByRole("group", { name: "Franchise 2" })).toHaveCount(0);

  await nextStep(page, "Next: Review");

  // The preview shows the league as it will be created: Orcas are in it.
  const preview = page.getByRole("region", { name: "League preview" });
  await expect(preview.getByText("Vancouver Orcas")).toBeVisible();
  const before = await preview.innerText();
  await page.getByRole("button", { name: "Shuffle league" }).click();
  await expect(page.getByRole("status")).toHaveText("League shuffled.");
  await expect(preview.getByText("Vancouver Orcas")).toBeVisible();
  expect(await preview.innerText()).not.toBe(before);

  // Rename a conference and a division in the preview.
  await preview.getByLabel("Conference name").first().fill("Harbor League");
  await preview
    .getByLabel(/^Division name/)
    .first()
    .fill("Lighthouse");
  await expect(
    preview.getByRole("group", { name: "Harbor League Conference" }),
  ).toBeVisible();
  // Two conferences can't share a name.
  await preview.getByLabel("Conference name").nth(1).fill("harbor league");
  await expect(page.getByTestId("issues")).toContainText("both called");
  await expect(
    page.getByRole("button", { name: "Create league" }),
  ).toBeDisabled();
  await preview.getByLabel("Conference name").nth(1).fill("Bay League");
  await expect(page.getByTestId("issues")).toHaveCount(0);
  await noOverflow(page);
  await expectAccessible(page);

  await page.getByRole("button", { name: "Create league" }).click();
  await expect(page).toHaveURL(/\/leagues\/([0-9a-f-]{36})$/);
  const leagueId = page.url().split("/").pop() as string;
  await expect(page.getByRole("region", { name: "Your team" })).toContainText(
    "Vancouver Orcas",
  );

  // What was previewed is what was created.
  const api = createApiClient({
    baseUrl: baseURL ?? "",
    fetch,
    getAccessToken: async () => accessToken(email, password),
  });
  const { teams } = await api.leagues.teams(leagueId);
  const mine = teams.find((t) => t.localPlayerSlot === 1);
  expect(mine).toMatchObject({
    city: "Vancouver",
    nickname: "Orcas",
    primaryColor: "#0b3d91",
    secondaryColor: "#ffd200",
    logoId: "logo-18",
    cityId: "na-ca-vancouver",
  });
  const structure = await api.leagues.structure(leagueId);
  expect(structure.conferences.map((c) => c.name)).toEqual([
    "Harbor League",
    "Bay League",
  ]);
  expect(structure.conferences[0]?.divisions[0]?.name).toBe("Lighthouse");
  // Every other team was generated, with a city, name, colours and logo.
  const generated = teams.filter((t) => t.localPlayerSlot === null);
  expect(generated).toHaveLength(29);
  expect(generated.every((t) => t.logoId && t.cityId)).toBe(true);

  // The chosen logo shows on the team list.
  await page.goto(`/leagues/${leagueId}/teams`);
  await expect(page.getByText("Vancouver Orcas").first()).toBeVisible();
  await noOverflow(page);
  await expectAccessible(page);
});

test("several franchises for one player and one for another", async ({
  page,
  baseURL,
}) => {
  const { email, password } = await createConfirmedUser("setup-multi");
  await signInThroughUi(page, email, password);
  await page.goto("/leagues/new");
  await page.getByLabel("League name").fill("Couch League");
  await page.getByRole("radio", { name: "Europe" }).check();
  await nextStep(page);
  await page.getByLabel("Local players").selectOption("2");
  await nextStep(page);

  // Player 1 and Player 2 start with one franchise each; Player 1 takes a second.
  await page.getByRole("button", { name: "Add another franchise" }).click();
  const third = page.getByRole("group", { name: "Franchise 3 · Player 1" });
  await expect(third).toBeVisible();
  await third.getByLabel("City", { exact: true }).selectOption("eu-it-rome");
  await page
    .getByRole("group", { name: "Franchise 1 · Player 1" })
    .getByLabel("City", { exact: true })
    .selectOption("eu-fr-paris");
  await page
    .getByRole("group", { name: "Franchise 2 · Player 2" })
    .getByLabel("City", { exact: true })
    .selectOption("eu-es-madrid");
  // A player's only franchise can't be removed.
  await expect(
    page
      .getByRole("group", { name: "Franchise 2 · Player 2" })
      .getByRole("button", { name: "Remove this franchise" }),
  ).toHaveCount(0);
  await nextStep(page, "Next: Review");
  await page.getByRole("button", { name: "Create league" }).click();
  await expect(page).toHaveURL(/\/leagues\/([0-9a-f-]{36})$/);
  const leagueId = page.url().split("/").pop() as string;

  const api = createApiClient({
    baseUrl: baseURL ?? "",
    fetch,
    getAccessToken: async () => accessToken(email, password),
  });
  const { teams } = await api.leagues.teams(leagueId);
  const bySlot = (slot: number) =>
    teams
      .filter((t) => t.localPlayerSlot === slot)
      .map((t) => t.city)
      .sort();
  expect(bySlot(1)).toEqual(["Paris", "Rome"]);
  expect(bySlot(2)).toEqual(["Madrid"]);
});

test("create a custom league and find your franchises in it", async ({
  page,
}) => {
  const { email, password } = await createConfirmedUser("setup-create");
  await signInThroughUi(page, email, password);
  await page.goto("/leagues/new");

  await page.getByLabel("League name").fill("Euro Cup");
  await page.getByRole("radio", { name: /Custom/ }).check();
  await page.getByRole("radio", { name: "Europe" }).check();
  await nextStep(page, /Next: Playoffs/);
  await page.getByLabel("Local players").selectOption("2");
  await nextStep(page, "Next: Your franchises");
  await page
    .getByRole("group", { name: "Franchise 1 · Player 1" })
    .getByLabel("City", { exact: true })
    .selectOption("eu-fr-paris");
  await page
    .getByRole("group", { name: "Franchise 2 · Player 2" })
    .getByLabel("City", { exact: true })
    .selectOption("eu-es-madrid");
  await nextStep(page, "Next: Review");
  await page.getByRole("button", { name: "Create league" }).click();

  // Straight into the league, already running Player 1's team.
  await expect(page).toHaveURL(/\/leagues\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Euro Cup" }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Your team" })).toContainText(
    "Paris",
  );

  // The compact layout has 12 teams in two conferences; both franchises are in it.
  await page.goto(`${page.url()}/teams`);
  await expect(page.getByRole("heading", { name: /Conference$/ })).toHaveCount(
    2,
  );
  await expect(page.getByText("Paris").first()).toBeVisible();
  await expect(page.getByText("Madrid").first()).toBeVisible();
  await noOverflow(page);
  await expectAccessible(page);
});

test("league setup fits a 320px screen", async ({ page }) => {
  const { email, password } = await createConfirmedUser("setup-320");
  await signInThroughUi(page, email, password);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/leagues/new");
  await page.getByLabel("League name").fill("Narrow League");
  await page.getByRole("radio", { name: /Custom/ }).check();
  await noOverflow(page);
  await nextStep(page, /Next: Playoffs/);
  await noOverflow(page);
  await nextStep(page, "Next: Your franchises");
  await noOverflow(page);
  await page.getByRole("button", { name: "Add another franchise" }).click();
  await noOverflow(page);
  await nextStep(page, "Next: Review");
  await noOverflow(page);
});

test("pressing Enter in the name field does not create a league", async ({
  page,
}) => {
  const { email, password } = await createConfirmedUser("setup-enter");
  await signInThroughUi(page, email, password);
  await page.goto("/leagues/new");
  await page.getByLabel("League name").fill("Not Yet");
  await page.getByLabel("League name").press("Enter");
  await expect(page).toHaveURL(/\/leagues\/new$/);
  await expect(
    page.getByRole("heading", { level: 2, name: "Basics" }),
  ).toBeVisible();
});

test("playoff rules block impossible settings with a clear message", async ({
  page,
}) => {
  const { email, password } = await createConfirmedUser("setup-rules");
  await signInThroughUi(page, email, password);
  await page.goto("/leagues/new");
  await page.getByLabel("League name").fill("Rules League");
  await page.getByRole("radio", { name: /Custom/ }).check();
  await page.getByLabel("Number of teams").selectOption("16");
  await page.getByLabel("Conferences and divisions").selectOption({
    label: "2 conferences · 4 divisions each · 2 teams per division",
  });
  await nextStep(page, /Next: Playoffs/);

  // Four playoff teams are two per conference, fewer than the four division
  // leaders who would qualify automatically.
  await page.getByLabel("Playoff teams").selectOption("4");
  await expect(page.getByTestId("issues")).toContainText(
    "only 2 playoff spots are available for 4 leaders",
  );
  await expect(
    page.getByRole("button", { name: /^Next: Your/ }),
  ).toBeDisabled();
  await expectAccessible(page);

  // Turning automatic qualification off resolves it.
  await page.getByLabel("Division leaders qualify automatically").uncheck();
  await expect(page.getByTestId("issues")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Next: Your/ })).toBeEnabled();
});

test("AI Assist is off by default, set per franchise, and saved with it", async ({
  page,
  baseURL,
}) => {
  const { email, password } = await createConfirmedUser("setup-ai");
  await signInThroughUi(page, email, password);
  await page.goto("/leagues/new");
  await page.getByLabel("League name").fill("Assisted League");
  await nextStep(page);
  await page.getByLabel("Local players").selectOption("2");
  await nextStep(page, "Next: Your franchises");

  const player1 = page.getByRole("group", { name: "Franchise 1 · Player 1" });
  const player2 = page.getByRole("group", { name: "Franchise 2 · Player 2" });
  await expect(player1.getByText("AI Assist: all off")).toBeVisible();
  await expect(player2.getByText("AI Assist: all off")).toBeVisible();

  // Open Player 1's AI Assist: five permissions, none on.
  await player1.getByText("AI Assist: all off").click();
  for (const name of [
    "Trades",
    "Roster coverage",
    "Roster and rotation",
    "Scouting",
    "Drafting",
  ]) {
    await expect(player1.getByRole("checkbox", { name })).not.toBeChecked();
  }
  await player1.getByRole("checkbox", { name: "Scouting" }).check();
  await player1.getByRole("checkbox", { name: "Drafting" }).check();
  await expect(player1.getByText("AI Assist: 2 of 5 on")).toBeVisible();
  // Player 2 is unaffected.
  await expect(player2.getByText("AI Assist: all off")).toBeVisible();
  await noOverflow(page);
  await expectAccessible(page);

  await nextStep(page, "Next: Review");
  await expect(
    page.getByRole("definition").filter({ hasText: "Scouting, Drafting" }),
  ).toContainText("all off");
  await page.getByRole("button", { name: "Create league" }).click();
  await expect(page).toHaveURL(/\/leagues\/([0-9a-f-]{36})$/);
  const leagueId = page.url().split("/").pop() as string;

  // Saved with the franchises: visible in the league settings.
  await page.goto(`/leagues/${leagueId}/settings`);
  const section = page.getByRole("region", {
    name: "Franchises and AI Assist",
  });
  await expect(section).toBeVisible();
  const rows = section.getByRole("listitem");
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "Player 1" })).toContainText(
    "Scouting, Drafting",
  );
  await expect(rows.filter({ hasText: "Player 2" })).toContainText("all off");
  await noOverflow(page);
  await expectAccessible(page);

  // And in the API: only those two flags, only on Player 1's team.
  const api = createApiClient({
    baseUrl: baseURL ?? "",
    fetch,
    getAccessToken: async () => accessToken(email, password),
  });
  const { teams } = await api.leagues.teams(leagueId);
  const on = (t: (typeof teams)[number]) =>
    Object.entries(t.aiAssist)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .sort();
  expect(on(teams.find((t) => t.localPlayerSlot === 1)!)).toEqual([
    "drafting",
    "scouting",
  ]);
  expect(on(teams.find((t) => t.localPlayerSlot === 2)!)).toEqual([]);
  for (const t of teams.filter((t) => t.localPlayerSlot === null)) {
    expect(on(t)).toEqual([]);
  }
});

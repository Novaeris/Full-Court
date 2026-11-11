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
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

const desktopOnly = (name: string) =>
  test.skip(name !== "desktop", "behaviour, not layout: runs on desktop");

test("create a league and move between its tabs", async ({ page }) => {
  const { email, password } = await createConfirmedUser("league");
  await signInThroughUi(page, email, password);

  await expect(
    page.getByRole("heading", { name: "No leagues yet" }),
  ).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("link", { name: "Create a league" }).click();
  await expect(page).toHaveURL(/\/leagues\/new$/);

  await page.getByLabel("League name").fill("  Harbor City Dynasty  ");
  await page.getByRole("button", { name: "Create league" }).click();
  await expect(page).toHaveURL(/\/leagues\/[0-9a-f-]{36}$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Harbor City Dynasty" }),
  ).toBeVisible();
  const tabs = page.getByRole("navigation", { name: "League" });
  await expect(tabs.getByRole("link", { name: "Overview" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await noOverflow(page);
  await expectAccessible(page);

  for (const tab of ["Roster", "Teams", "Schedule", "Standings", "Settings"]) {
    await tabs.getByRole("link", { name: tab }).click();
    await expect(tabs.getByRole("link", { name: tab })).toHaveAttribute(
      "aria-current",
      "page",
    );
  }
  await noOverflow(page);

  await page.getByRole("link", { name: "All leagues" }).click();
  await expect(page).toHaveURL(/\/leagues$/);
  await expect(page.getByText("1 of 5 league slots used.")).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Harbor City Dynasty/ }),
  ).toBeVisible();
  await noOverflow(page);
  await expectAccessible(page);
});

test("the create form explains a bad name", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  const { email, password } = await createConfirmedUser("leaguebad");
  await signInThroughUi(page, email, password, "/leagues/new");
  await page.getByLabel("League name").fill("   ");
  await page.getByRole("button", { name: "Create league" }).click();
  await expect(page.getByText("Give your league a name.")).toBeVisible();
});

test("rename and delete a league", async ({ page }, testInfo) => {
  desktopOnly(testInfo.project.name);
  const { email, password } = await createConfirmedUser("leaguerd");
  await signInThroughUi(page, email, password, "/leagues/new");
  await page.getByLabel("League name").fill("First Name");
  await page.getByRole("button", { name: "Create league" }).click();
  await page
    .getByRole("navigation", { name: "League" })
    .getByRole("link", { name: "Settings" })
    .click();

  const nameSection = page.getByRole("region", { name: "Name" });
  await nameSection.getByLabel("League name").fill("Second Name");
  await nameSection.getByRole("button", { name: "Rename league" }).click();
  await expect(nameSection.getByRole("status")).toHaveText("League renamed.");
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Second Name" }),
  ).toBeVisible();

  const deleteSection = page.getByRole("region", { name: "Delete league" });
  await deleteSection.getByLabel("Type Second Name to confirm").fill("nope");
  await deleteSection.getByRole("button", { name: "Delete league" }).click();
  await expect(deleteSection.getByRole("alert")).toContainText(
    "Type the league name",
  );
  await deleteSection
    .getByLabel("Type Second Name to confirm")
    .fill("Second Name");
  await deleteSection.getByRole("button", { name: "Delete league" }).click();
  await expect(page).toHaveURL(/\/leagues\?notice=league-deleted$/);
  await expect(page.getByRole("status")).toHaveText("League deleted.");
  await expect(
    page.getByRole("heading", { name: "No leagues yet" }),
  ).toBeVisible();
});

test("the five-league limit shows in the UI and the API", async ({
  page,
  baseURL,
}, testInfo) => {
  desktopOnly(testInfo.project.name);
  const { email, password } = await createConfirmedUser("leaguelimit");
  const token = await accessToken(email, password);
  const api = createApiClient({
    baseUrl: baseURL ?? "",
    fetch,
    getAccessToken: async () => token,
  });
  for (let i = 1; i <= 5; i++) {
    await api.leagues.create({ name: `League ${i}`, size: "compact" });
  }
  await expect(api.leagues.create({ name: "Six" })).rejects.toMatchObject({
    status: 409,
    code: "league_limit_reached",
  });

  await signInThroughUi(page, email, password);
  await expect(page.getByText("5 of 5 league slots used.")).toBeVisible();
  await expect(page.getByRole("link", { name: "New league" })).toHaveCount(0);
  await expect(page.getByText("You've used all 5 league slots.")).toBeVisible();
  await page.goto("/leagues/new");
  await expect(page.getByText("the most an account can keep")).toBeVisible();
});

test("one user can't see or touch another user's league", async ({
  page,
  baseURL,
}, testInfo) => {
  desktopOnly(testInfo.project.name);
  const owner = await createConfirmedUser("owner");
  const other = await createConfirmedUser("other");
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
  const league = await asOwner.leagues.create({ name: "Private" });

  for (const attempt of [
    () => asOther.leagues.get(league.id),
    () => asOther.leagues.rename(league.id, { name: "Stolen" }),
    () => asOther.leagues.delete(league.id),
  ]) {
    await expect(attempt()).rejects.toMatchObject({
      status: 404,
      code: "league_not_found",
    });
  }
  expect((await asOther.leagues.list()).leagues).toEqual([]);
  await expect(asOwner.leagues.get(league.id)).resolves.toMatchObject({
    name: "Private",
  });

  await signInThroughUi(page, other.email, other.password);
  await page.goto(`/leagues/${league.id}`);
  await expect(
    page.getByRole("heading", { level: 2, name: "League not found" }),
  ).toBeVisible();
  await expect(page.getByText("Private")).toHaveCount(0);
});

test("league API: create, read, rename, delete", async ({
  baseURL,
  request,
}, testInfo) => {
  desktopOnly(testInfo.project.name);
  const user = await createConfirmedUser("leagueapi");
  const token = await accessToken(user.email, user.password);
  const api = createApiClient({
    baseUrl: baseURL ?? "",
    fetch,
    getAccessToken: async () => token,
  });

  const created = await api.leagues.create({ name: "  API League " });
  expect(created).toMatchObject({ name: "API League", status: "setup" });
  await expect(api.leagues.get(created.id)).resolves.toMatchObject({
    id: created.id,
  });
  await expect(
    api.leagues.rename(created.id, { name: "Renamed" }),
  ).resolves.toMatchObject({ name: "Renamed" });
  await expect(api.leagues.create({ name: "" })).rejects.toMatchObject({
    status: 400,
    code: "invalid_request",
  });
  await expect(api.leagues.get("not-a-uuid")).rejects.toMatchObject({
    status: 404,
  });
  await expect(api.leagues.delete(created.id)).resolves.toEqual({
    deleted: true,
  });
  await expect(api.leagues.get(created.id)).rejects.toMatchObject({
    status: 404,
  });

  expect((await request.get("/api/v1/leagues")).status()).toBe(401);
});

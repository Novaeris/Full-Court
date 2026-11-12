import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createConfirmedUser, signInThroughUi } from "./support/auth";

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

test("league setup: structure, playoffs and review at every size", async ({
  page,
}) => {
  const { email, password } = await createConfirmedUser("setup");
  await signInThroughUi(page, email, password);
  await page.goto("/leagues/new/setup");

  // Step 1: the standard league is the default; a name is required to go on.
  await expect(
    page.getByRole("heading", { level: 1, name: "League setup" }),
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

  // Step 3: the review shows what was chosen.
  await page.getByRole("button", { name: "Next: Review" }).click();
  const review = page.getByRole("definition");
  await expect(review.filter({ hasText: "Harbor League" })).toBeVisible();
  await expect(review.filter({ hasText: "North America" })).toBeVisible();
  await expect(review.filter({ hasText: "Yes" })).toBeVisible();
  await expect(page.getByRole("note")).toContainText("Nothing is saved yet");
  await noOverflow(page);
  await expectAccessible(page);
});

test("league setup fits a 320px screen", async ({ page }) => {
  const { email, password } = await createConfirmedUser("setup-320");
  await signInThroughUi(page, email, password);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/leagues/new/setup");
  await page.getByLabel("League name").fill("Narrow League");
  await page.getByRole("radio", { name: /Custom/ }).check();
  await noOverflow(page);
  await page.getByRole("button", { name: /Next: Playoffs/ }).click();
  await noOverflow(page);
  await page.getByRole("button", { name: "Next: Review" }).click();
  await noOverflow(page);
});

test("playoff rules block impossible settings with a clear message", async ({
  page,
}) => {
  const { email, password } = await createConfirmedUser("setup-rules");
  await signInThroughUi(page, email, password);
  await page.goto("/leagues/new/setup");
  await page.getByLabel("League name").fill("Rules League");
  await page.getByRole("radio", { name: /Custom/ }).check();
  await page.getByLabel("Number of teams").selectOption("16");
  await page.getByLabel("Conferences and divisions").selectOption({
    label: "2 conferences · 4 divisions each · 2 teams per division",
  });
  await page.getByRole("button", { name: /Next: Playoffs/ }).click();

  // Four playoff teams are two per conference, fewer than the four division
  // leaders who would qualify automatically.
  await page.getByLabel("Playoff teams").selectOption("4");
  await expect(page.getByTestId("issues")).toContainText(
    "only 2 playoff spots are available for 4 leaders",
  );
  await expect(
    page.getByRole("button", { name: "Next: Review" }),
  ).toBeDisabled();
  await expectAccessible(page);

  // Turning automatic qualification off resolves it.
  await page.getByLabel("Division leaders qualify automatically").uncheck();
  await expect(page.getByTestId("issues")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Next: Review" }),
  ).toBeEnabled();
});

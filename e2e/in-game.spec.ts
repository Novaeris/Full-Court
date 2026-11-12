import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createConfirmedUser, signInThroughUi } from "./support/auth";

/**
 * Signed-in players stay inside the game frame: policy and info pages keep
 * their URLs but render in the app shell, and the landing page leads back to
 * Game Mode Selection (src/server/navigation/member-routes.ts).
 */

/** The app frame: sidebar/rail navigation or the phone tab bar. */
const appNav = (page: Page) => page.getByRole("navigation", { name: "Main" });
/** The public site header. */
const siteNav = (page: Page) => page.getByRole("navigation", { name: "Site" });

async function expectInGame(page: Page, heading: string) {
  await expect(
    page.getByRole("heading", { level: 1, name: heading }),
  ).toBeVisible();
  await expect(appNav(page)).toBeVisible();
  await expect(siteNav(page)).toHaveCount(0);
}

test("policies and help open inside the game", async ({ page }, testInfo) => {
  const { email, password } = await createConfirmedUser("ingame");
  await signInThroughUi(page, email, password, "/modes");

  // From the account menu (desktop, tablet) or the More sheet (phone).
  if (testInfo.project.name === "phone") {
    await page.getByRole("button", { name: "More" }).click();
    await page
      .getByRole("dialog", { name: "More" })
      .getByRole("link", { name: "Privacy Policy" })
      .click();
  } else {
    await page
      .locator("aside")
      .getByRole("button", { name: /^Account: / })
      .click();
    const menu = page.getByLabel("Account menu");
    await menu.locator("summary", { hasText: "Legal" }).click();
    await menu.getByRole("link", { name: "Privacy Policy" }).click();
  }
  await expect(page).toHaveURL(/\/privacy$/);
  await expectInGame(page, "Privacy Policy");

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  // The in-game copy keeps the page's metadata. (Axe also needs the title,
  // which streams in.)
  await expect(page).toHaveTitle(/Privacy Policy/);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);

  // Links between the pages stay in the game too.
  await page
    .locator("#main")
    .getByRole("link", { name: "support form" })
    .first()
    .click();
  await expect(page).toHaveURL(/\/support$/);
  await expectInGame(page, "Contact & Support");

  // So does the alpha badge, a direct visit and a reload.
  await page
    .getByRole("link", { name: /^Alpha/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/alpha$/);
  await expectInGame(page, "Alpha Disclaimer");
  await page.goto("/terms");
  await page.reload();
  await expectInGame(page, "Terms of Service");
});

test("the landing page and error pages lead back into the game", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "behaviour: runs on desktop");
  const { email, password } = await createConfirmedUser("ingame-home");
  await signInThroughUi(page, email, password, "/modes");

  await page.goto("/");
  await expect(page).toHaveURL(/\/modes$/);

  await page.goto("/no-such-page");
  await page.getByRole("link", { name: "Back to home" }).click();
  await expect(page).toHaveURL(/\/modes$/);

  // Signing out is the way out: the public landing page.
  await page
    .locator("aside")
    .getByRole("button", { name: /^Account: / })
    .click();
  await page
    .getByLabel("Account menu")
    .getByRole("button", { name: "Sign out" })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/privacy");
  await expect(siteNav(page)).toBeVisible();
  await expect(appNav(page)).toHaveCount(0);
});

test("visitors get the public pages, never the in-game copies", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "behaviour: runs on desktop");
  await page.goto("/privacy");
  await expect(siteNav(page)).toBeVisible();
  await expect(appNav(page)).toHaveCount(0);

  await page.goto("/in-game/terms");
  await expect(page).toHaveURL(/\/terms$/);
  await expect(siteNav(page)).toBeVisible();
});

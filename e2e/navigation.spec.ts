import { expect, test, type Page } from "@playwright/test";
import { createConfirmedUser, signInThroughUi } from "./support/auth";

/**
 * Navigation changes form with the screen (docs/ARCHITECTURE.md §5):
 * desktop sidebar, tablet rail, phone bottom tabs + "More" sheet.
 */

const tabBar = (page: Page) => page.locator("nav.fixed[aria-label=Main]");
const sidebar = (page: Page) => page.locator("aside nav[aria-label=Main]");

test("app navigation takes the right form for the screen", async ({
  page,
}, testInfo) => {
  const { email, password } = await createConfirmedUser("nav");
  await signInThroughUi(page, email, password);
  const isPhone = testInfo.project.name === "phone";

  if (isPhone) {
    await expect(tabBar(page)).toBeVisible();
    await expect(sidebar(page)).toBeHidden();
  } else {
    await expect(tabBar(page)).toBeHidden();
    await expect(sidebar(page)).toBeVisible();
    // Labels stay visible on the tablet rail too: no hover-only meaning.
    await expect(sidebar(page).getByText("Leagues")).toBeVisible();
  }

  const nav = isPhone ? tabBar(page) : sidebar(page);
  await expect(nav.getByRole("link", { name: "Leagues" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await nav.getByRole("link", { name: "Account" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(nav.getByRole("link", { name: "Account" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("phone: the More sheet opens, links work and Escape closes it", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "phone layout only");
  const { email, password } = await createConfirmedUser("more");
  await signInThroughUi(page, email, password);

  const more = page.getByRole("button", { name: "More" });
  const sheet = page.getByRole("dialog", { name: "More" });

  await more.click();
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  await more.click();
  await sheet.getByRole("link", { name: "About" }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("site header: menu sheet on phones, inline links on larger screens", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const menu = page.getByRole("button", { name: "Menu" });
  if (testInfo.project.name === "phone") {
    await menu.click();
    await page
      .getByRole("dialog", { name: "Menu" })
      .getByRole("link", { name: "About" })
      .click();
  } else {
    await expect(menu).toBeHidden();
    await page
      .getByRole("navigation", { name: "Site" })
      .getByRole("link", { name: "About" })
      .click();
  }
  await expect(page).toHaveURL(/\/about$/);
});

test("skip link jumps to the main content", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "needs a keyboard");
  await page.goto("/about");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await skip.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
});

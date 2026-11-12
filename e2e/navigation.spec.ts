import AxeBuilder from "@axe-core/playwright";
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
    await expect(sidebar(page).getByText("Owner")).toBeVisible();
  }

  // League pages belong to Owner Mode.
  const nav = isPhone ? tabBar(page) : sidebar(page);
  await expect(nav.getByRole("link", { name: "Owner" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await nav.getByRole("link", { name: "Modes" }).click();
  await expect(page).toHaveURL(/\/modes$/);
  await expect(nav.getByRole("link", { name: "Modes" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(nav.getByRole("link", { name: "Owner" })).not.toHaveAttribute(
    "aria-current",
  );
});

test("desktop and tablet: everything else lives in the account menu", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "phones use the More sheet");
  const { email, password } = await createConfirmedUser("menu", "Menu Coach");
  await signInThroughUi(page, email, password, "/modes");

  const trigger = page
    .locator("aside")
    .getByRole("button", { name: "Account: Menu Coach" });
  const menu = page.getByLabel("Account menu");
  await expect(menu).toBeHidden();
  // Nothing but the main sections and the account row in the sidebar.
  await expect(
    page.locator("aside").getByRole("link", { name: "About" }),
  ).toBeHidden();

  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(menu).toBeVisible();
  for (const name of [
    "Account settings",
    "Contact & Support",
    "Changelog",
    "About",
  ]) {
    await expect(menu.getByRole("link", { name })).toBeVisible();
  }
  await expect(menu.getByRole("group", { name: "Color theme" })).toBeVisible();
  await expect(menu.getByRole("button", { name: "Sign out" })).toBeVisible();

  // Every control is a 44px touch target, inside the window.
  const small = await menu
    .locator("a:visible, button:visible, summary")
    .evaluateAll((elements) =>
      elements
        .filter((el) => el.getBoundingClientRect().height < 44)
        .map((el) => el.textContent?.trim()),
    );
  expect(small).toEqual([]);
  const box = (await menu.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);

  // Escape closes it and returns focus to the trigger.
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");

  // Following a link navigates and closes the menu.
  await trigger.click();
  await menu.getByRole("link", { name: "Account settings" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(menu).toBeHidden();
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

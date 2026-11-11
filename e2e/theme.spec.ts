import { expect, test, type Page } from "@playwright/test";

const canvas = (page: Page) =>
  page.evaluate(
    () => getComputedStyle(document.documentElement).backgroundColor,
  );
const themeGroup = (page: Page) =>
  page.getByRole("group", { name: "Color theme" }).first();

const LIGHT = "rgb(246, 244, 241)";
const DARK = "rgb(14, 17, 22)";

test("follows the system theme by default", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  expect(await canvas(page)).toBe(DARK);
  await page.emulateMedia({ colorScheme: "light" });
  expect(await canvas(page)).toBe(LIGHT);
});

test("a chosen theme overrides the system and survives a reload", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");

  await themeGroup(page).getByRole("button", { name: "Dark" }).click();
  expect(await canvas(page)).toBe(DARK);

  await page.reload();
  expect(await canvas(page)).toBe(DARK);
  await expect(
    themeGroup(page).getByRole("button", { name: "Dark" }),
  ).toHaveAttribute("aria-pressed", "true");

  await themeGroup(page).getByRole("button", { name: "System" }).click();
  expect(await canvas(page)).toBe(LIGHT);
});

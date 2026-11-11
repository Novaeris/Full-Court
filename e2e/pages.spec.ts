import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { PAGES } from "./pages";

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
}

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.map(
      (v) =>
        `${v.id}: ${v.help} -> ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
    ),
  ).toEqual([]);
}

for (const { path, heading } of PAGES) {
  test.describe(path, () => {
    test("renders, has no horizontal overflow and passes axe", async ({
      page,
    }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(
        page.getByRole("heading", { level: 1, name: heading }),
      ).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      await expectAccessible(page);
    });

    test("passes axe in dark mode", async ({ page }) => {
      await page.emulateMedia({ colorScheme: "dark" });
      await page.goto(path);
      await expectAccessible(page);
    });

    test("fits a 320px-wide screen", async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await page.goto(path);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    });
  });
}

test("unknown pages show the 404 page", async ({ page }) => {
  const response = await page.goto("/no-such-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Air ball" })).toBeVisible();
  await expectAccessible(page);
});

test("pre-launch pages ask search engines not to index them", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, nofollow",
  );
});

test("visible links and buttons are at least 44px tall", async ({ page }) => {
  for (const { path } of PAGES) {
    await page.goto(path);
    const small = await page
      .locator(
        "header a, header button, nav a, nav button, main button, footer a, footer button",
      )
      .evaluateAll((elements) =>
        elements
          .filter((el) => {
            const box = el.getBoundingClientRect();
            return box.width > 0 && box.height > 0 && box.height < 44;
          })
          .map((el) => `${el.tagName} "${el.textContent?.trim()}"`),
      );
    expect(small, path).toEqual([]);
  }
});

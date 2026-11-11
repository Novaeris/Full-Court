import { expect, test } from "@playwright/test";

/**
 * Visual baselines for review. After an intended UI change, regenerate with
 * `pnpm test:e2e:update` and look at every changed image before committing.
 */
const SHOTS = ["/", "/login", "/styleguide"] as const;

for (const path of SHOTS) {
  for (const scheme of ["light", "dark"] as const) {
    test(`${path} (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);
      const slug = path === "/" ? "home" : path.slice(1);
      await expect(page).toHaveScreenshot(`${slug}-${scheme}.png`, {
        fullPage: true,
        animations: "disabled",
      });
    });
  }
}

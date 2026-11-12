import { expect, type Page } from "@playwright/test";

/**
 * Creates a standard league through the setup flow, accepting every default.
 * Starts on /leagues/new and ends on the new league's page.
 */
export async function createLeagueThroughUi(
  page: Page,
  name: string,
): Promise<void> {
  await page.getByLabel("League name").fill(name);
  await page.getByRole("button", { name: /^Next: / }).click(); // rules
  await page.getByRole("button", { name: /^Next: / }).click(); // franchises
  await page.getByRole("button", { name: /^Next: / }).click(); // review
  await page.getByRole("button", { name: "Create league" }).click();
  await expect(page).toHaveURL(/\/leagues\/[0-9a-f-]{36}$/);
}

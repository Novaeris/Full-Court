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

/** A valid standard North American Owner Mode setup with one franchise (New York). */
export function standardSetup() {
  return {
    config: {
      schemaVersion: 1 as const,
      preset: "standard" as const,
      region: "north-america" as const,
      fantasyDraft: false,
      playoffs: {
        teams: 16,
        seeding: "conference" as const,
        autoQualifyDivisionLeaders: true,
        divisionLeaderTopSeeds: 4,
        roundSeriesLengths: [7, 7, 7, 7] as (3 | 5 | 7)[],
      },
    },
    shape: { conferences: 2, divisionsPerConference: 3, teamsPerDivision: 5 },
    localPlayers: [{ slot: 1, label: null }],
    franchises: [{ localPlayerSlot: 1, cityId: "na-us-new-york" }],
    identitySeed: "structure-test-seed",
  };
}

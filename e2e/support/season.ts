import AxeBuilder from "@axe-core/playwright";
import { createApiClient } from "@fullcourt/api-client";
import { expect, type Page } from "@playwright/test";
import { accessToken, createConfirmedUser } from "./auth";

/** Helpers shared by the season and playoff specs. */

export const baseUrl = () =>
  process.env.E2E_BASE_URL ??
  `http://localhost:${process.env.E2E_PORT ?? 3100}`;

export async function startedLeague(label: string) {
  const user = await createConfirmedUser(label);
  const baseUrl =
    process.env.E2E_BASE_URL ??
    `http://localhost:${process.env.E2E_PORT ?? 3100}`;
  const api = createApiClient({
    baseUrl,
    fetch,
    getAccessToken: () => accessToken(user.email, user.password),
  });
  const created = await api.leagues.create({ name: "Season", size: "compact" });
  const { teams } = await api.leagues.teams(created.id);
  const league = await api.leagues.chooseTeam(created.id, {
    teamId: (teams[0] as { id: string }).id,
  });
  return { user, api, league, teams };
}

export async function expectAccessible(page: Page) {
  await expect(page).toHaveTitle(/\S/);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.map(
      (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
    ),
  ).toEqual([]);
}

export async function noOverflow(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Every button, link and slider is at least 44px tall. */
export async function touchTargets(page: Page) {
  const small = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        "main a, main button, main input[type=range], main summary",
      ),
    ]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        // Links inside a sentence are exempt from the target size rule.
        if (getComputedStyle(el).display === "inline") return false;
        return r.width > 0 && r.height > 0 && r.height < 43.5;
      })
      .map(
        (el) => `${el.tagName} ${(el.textContent ?? "").trim().slice(0, 30)}`,
      ),
  );
  expect(small).toEqual([]);
}

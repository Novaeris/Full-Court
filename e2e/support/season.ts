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
  // Colours still fading in (after a theme change or a hover) fail the contrast
  // check at random: turn transitions off and let a frame pass first.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => resolve(null))),
  );
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

type DraftApi = {
  leagues: {
    simDraft: (
      id: string,
      input?: { autoMine: boolean },
    ) => Promise<{
      onTheClock: { yourPick: boolean } | null;
      suggestion: string | null;
    }>;
    draftPick: (
      id: string,
      input: { prospectId: string },
    ) => Promise<{
      onTheClock: { yourPick: boolean } | null;
      suggestion: string | null;
    }>;
    roster: (id: string) => Promise<{
      players: { id: string; overall: number }[];
      freeAgents: { id: string; overall: number }[];
      min: number;
      max: number;
    }>;
    releasePlayer: (
      id: string,
      input: { playerId: string },
    ) => Promise<unknown>;
    signPlayer: (id: string, input: { playerId: string }) => Promise<unknown>;
  };
};

/**
 * Plays the draft as an owner who picks by hand: the lottery, the computer
 * teams until the owner is on the clock, the owner taking the scouts'
 * suggestion, and so on to the last pick.
 */
export async function playDraft(api: DraftApi, leagueId: string) {
  let draft = await api.leagues.simDraft(leagueId, { autoMine: false });
  for (let i = 0; i < 10 && draft.onTheClock; i++) {
    draft =
      draft.onTheClock.yourPick && draft.suggestion
        ? await api.leagues.draftPick(leagueId, {
            prospectId: draft.suggestion,
          })
        : await api.leagues.simDraft(leagueId, { autoMine: false });
  }
}

/** Releases the weakest or signs the best free agents until the roster is legal. */
export async function makeRosterLegal(api: DraftApi, leagueId: string) {
  let roster = await api.leagues.roster(leagueId);
  while (roster.players.length > roster.max) {
    const weakest = [...roster.players].sort(
      (a, b) => a.overall - b.overall,
    )[0]!;
    await api.leagues.releasePlayer(leagueId, { playerId: weakest.id });
    roster = await api.leagues.roster(leagueId);
  }
  while (roster.players.length < roster.min) {
    const best = roster.freeAgents[0]!;
    await api.leagues.signPlayer(leagueId, { playerId: best.id });
    roster = await api.leagues.roster(leagueId);
  }
}

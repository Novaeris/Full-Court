import { expect, test } from "@playwright/test";
import { signInThroughUi } from "./support/auth";
import {
  expectAccessible,
  noOverflow,
  startedLeague,
  touchTargets,
} from "./support/season";
import { finishJob } from "./support/worker";

/**
 * The trading block, against the real server and worker: what it accepts, and
 * that the offers computer teams make are for the players on it and no others.
 */

test.describe("the trading block", () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "runs once, on desktop");
  });

  test("offers are for the players on the block", async () => {
    test.setTimeout(240_000);
    const { api, league } = await startedLeague("block");
    await api.leagues.simulate(league.id, { kind: "day" });
    await finishJob(api, league.id);

    const start = await api.leagues.trades(league.id);
    expect(start.block).toEqual([]);
    // Five players who are not the very best, so it isn't what offers do anyway.
    const chosen = start.roster.slice(3, 8).map((p) => p.id);
    expect(chosen).toHaveLength(5);

    const set = await api.leagues.setTradingBlock(league.id, {
      playerIds: chosen,
    });
    expect([...set.block].sort()).toEqual([...chosen].sort());
    // Offers made now are for them alone.
    for (const o of set.offers) {
      expect(o.give).toHaveLength(1);
      expect(chosen).toContain(o.give[0]?.id);
    }

    // Days pass and computer teams look again (every fifth day): still only the block.
    await api.leagues.simulate(league.id, { kind: "week" });
    await finishJob(api, league.id);
    const later = await api.leagues.trades(league.id);
    expect([...later.block].sort()).toEqual([...chosen].sort());
    for (const o of later.offers) {
      expect(chosen).toContain(o.give[0]?.id);
    }

    // Changing it replaces it, and an empty list clears it.
    const fewer = await api.leagues.setTradingBlock(league.id, {
      playerIds: chosen.slice(0, 2),
    });
    expect(fewer.block).toHaveLength(2);
    for (const o of fewer.offers) {
      expect(chosen.slice(0, 2)).toContain(o.give[0]?.id);
    }
    const cleared = await api.leagues.setTradingBlock(league.id, {
      playerIds: [],
    });
    expect(cleared.block).toEqual([]);
  });

  test("it holds up to five of your own players, once each", async () => {
    test.setTimeout(240_000);
    const { api, league } = await startedLeague("blockrules");
    await api.leagues.simulate(league.id, { kind: "day" });
    await finishJob(api, league.id);
    const mine = (await api.leagues.trades(league.id)).roster.map((p) => p.id);

    // Six is too many, and a player twice is refused by the request itself.
    await expect(
      api.leagues.setTradingBlock(league.id, { playerIds: mine.slice(0, 6) }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      api.leagues.setTradingBlock(league.id, {
        playerIds: [mine[0]!, mine[0]!],
      }),
    ).rejects.toMatchObject({ status: 400 });

    // Somebody else's player can't be on it.
    const partner = (await api.leagues.trades(league.id)).partners[0]!;
    const theirs = (await api.leagues.tradePartner(league.id, partner.teamId))
      .roster[0]!;
    await expect(
      api.leagues.setTradingBlock(league.id, { playerIds: [theirs.id] }),
    ).rejects.toMatchObject({ status: 422, code: "invalid_block" });
    expect((await api.leagues.trades(league.id)).block).toEqual([]);
  });

  test("the panel saves the block, fits the screen and passes axe", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const { user, api, league } = await startedLeague("blocklayout");
    await api.leagues.simulate(league.id, { kind: "day" });
    await finishJob(api, league.id);
    await signInThroughUi(
      page,
      user.email,
      user.password,
      `/leagues/${league.id}/moves`,
    );
    const panel = page.getByRole("region", { name: "Trading block" });
    await expect(panel).toBeVisible();
    const boxes = panel.getByRole("checkbox");
    await expect(boxes).toHaveCount(15);

    // Five can be chosen; then the rest are off until one is cleared.
    for (let i = 0; i < 5; i++) await boxes.nth(i).check();
    await expect(boxes.nth(5)).toBeDisabled();
    await boxes.nth(4).uncheck();
    await expect(boxes.nth(5)).toBeEnabled();
    await boxes.nth(4).check();

    await panel.getByRole("button", { name: "Save the block" }).click();
    await expect(panel.getByRole("status")).toContainText("5 on the block");
    await expect
      .poll(async () => (await api.leagues.trades(league.id)).block.length)
      .toBe(5);
    // It outlasts the page's own refresh.
    await page.waitForTimeout(600);
    await expect(panel.getByRole("status")).toContainText("5 on the block");

    await noOverflow(page);
    await touchTargets(page);
    await expectAccessible(page);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.reload();
    await expect(panel).toBeVisible();
    // The block is what was saved, not what was last on screen.
    await expect(panel.locator("input[type=checkbox]:checked")).toHaveCount(5);
    await noOverflow(page);
  });
});

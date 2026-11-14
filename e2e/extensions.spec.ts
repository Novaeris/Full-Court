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
 * Contract extensions, against the real server: who can be extended, what a
 * player says to an offer, and that the new contract is the one he plays under.
 */

type Extensions = Awaited<
  ReturnType<
    Awaited<ReturnType<typeof startedLeague>>["api"]["leagues"]["extensions"]
  >
>;

/** A player who can be given a longer contract and offered a little less than his line. */
function suitable(data: Extensions) {
  const floor = data.figures?.minSalary ?? 0;
  return data.candidates.find(
    (c) => c.maxYears > c.yearsLeft && c.minimum - 20 >= floor,
  );
}

/**
 * A league whose owner has a player the scenarios below need. The league is
 * random: now and then every player with a short contract asks about the league
 * minimum, and nothing can be offered "a little under his line". Then start
 * another league, as a person would.
 */
async function leagueWithCandidate(label: string) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    const made = await startedLeague(`${label}${attempt}`);
    await made.api.leagues.simulate(made.league.id, { kind: "day" });
    await finishJob(made.api, made.league.id);
    const before = await made.api.leagues.extensions(made.league.id);
    if (suitable(before)) return { ...made, before };
  }
  throw new Error("No league with a player who can be extended in six tries.");
}

test.describe("contract extensions", () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "runs once, on desktop");
  });

  test("offers below his line are turned down, offers at it are signed", async () => {
    test.setTimeout(240_000);
    const { api, league, before } = await leagueWithCandidate("extend");
    const trades = await api.leagues.trades(league.id);
    expect(before.open).toBe(true);

    // Exactly the players with two years or fewer left can be extended.
    const short = trades.roster.filter((p) => p.yearsLeft <= 2);
    expect(before.candidates.map((c) => c.player.id).sort()).toEqual(
      short.map((p) => p.id).sort(),
    );
    for (const c of before.candidates) {
      expect(c.salary).toBeGreaterThan(0);
      expect(c.minimum).toBeGreaterThan(0);
      expect(["eager", "willing", "reluctant"]).toContain(c.mood);
    }

    // Players with longer contracts can't be extended.
    const long = trades.roster.find((p) => p.yearsLeft > 2);
    if (long) {
      await expect(
        api.leagues.extendPlayer(league.id, {
          playerId: long.id,
          salary: long.salary,
          years: 5,
        }),
      ).rejects.toMatchObject({ status: 422, code: "not_extendable" });
    }

    // Someone whose age lets him sign longer than he has left, and who asks more
    // than the league minimum (so an offer a little under his line is a legal one).
    const target = suitable(before);
    expect(target).toBeDefined();
    const c = target as NonNullable<typeof target>;
    const years = c.maxYears;

    // An extension has to run longer than the contract does now.
    await expect(
      api.leagues.extendPlayer(league.id, {
        playerId: c.player.id,
        salary: c.minimum,
        years: c.yearsLeft,
      }),
    ).rejects.toMatchObject({ status: 422, code: "not_an_extension" });
    // A salary no contract can have.
    await expect(
      api.leagues.extendPlayer(league.id, {
        playerId: c.player.id,
        salary: 9_000_000,
        years,
      }),
    ).rejects.toMatchObject({ status: 422, code: "invalid_contract" });

    // A little under his line: he turns it down, says what he'd sign for, and nothing changes.
    const low = await api.leagues.extendPlayer(league.id, {
      playerId: c.player.id,
      salary: Math.max(1, c.minimum - 20),
      years,
    });
    expect(low.done).toBe(false);
    expect(low.worth).toBeLessThan(1);
    expect(low.reason).toMatch(/at least \$\d/);
    const unchanged = await api.leagues.trades(league.id);
    expect(unchanged.roster.find((p) => p.id === c.player.id)).toMatchObject({
      salary: c.salary,
      yearsLeft: c.yearsLeft,
    });

    // At his line he signs, and the new contract replaces the old one.
    const done = await api.leagues.extendPlayer(league.id, {
      playerId: c.player.id,
      salary: c.minimum,
      years,
    });
    expect(done.done).toBe(true);
    expect(done.worth).toBeGreaterThanOrEqual(1);
    const after = await api.leagues.trades(league.id);
    expect(after.roster.find((p) => p.id === c.player.id)).toMatchObject({
      salary: c.minimum,
      yearsLeft: years,
    });
    // His new contract is long, so he is no longer a candidate (unless it is two years or fewer).
    const stillThere = done.extensions.candidates.some(
      (x) => x.player.id === c.player.id,
    );
    expect(stillThere).toBe(years <= 2);
    // Payroll moved by the difference.
    expect(done.extensions.figures?.payroll).toBe(
      (before.figures?.payroll ?? 0) - c.salary + c.minimum,
    );

    // The inbox says so.
    const inbox = await api.leagues.inbox(league.id);
    expect(
      inbox.items.some(
        (i) =>
          i.kind === "move" &&
          i.text.startsWith(`You extended ${c.player.name}`),
      ),
    ).toBe(true);
  });

  test("the extensions panel offers a contract, fits the screen and passes axe", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const {
      user,
      api,
      league,
      before: data,
    } = await leagueWithCandidate("extendlayout");
    const target = suitable(data);
    expect(target).toBeDefined();
    const c = target as NonNullable<typeof target>;

    await signInThroughUi(
      page,
      user.email,
      user.password,
      `/leagues/${league.id}/moves`,
    );
    const panel = page.getByRole("region", { name: "Contract extensions" });
    await expect(panel).toBeVisible();
    await expect(panel.getByText(c.player.name).first()).toBeVisible();
    await noOverflow(page);
    await touchTargets(page);
    await expectAccessible(page);

    // Offer him the longest contract his age allows, at his line.
    const row = panel.getByRole("listitem").filter({ hasText: c.player.name });
    await row
      .getByLabel(`Years for ${c.player.name}`)
      .selectOption(String(c.maxYears));
    await row.getByRole("button", { name: /Offer extension/ }).click();
    await expect(panel.getByRole("status")).toContainText(
      `${c.player.name} signed`,
    );
    const after = await api.leagues.trades(league.id);
    expect(after.roster.find((p) => p.id === c.player.id)?.yearsLeft).toBe(
      c.maxYears,
    );

    await page.setViewportSize({ width: 320, height: 640 });
    await page.reload();
    await expect(panel).toBeVisible();
    await noOverflow(page);
  });
});

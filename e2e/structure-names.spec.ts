import AxeBuilder from "@axe-core/playwright";
import { createApiClient } from "@fullcourt/api-client";
import { expect, test, type Page } from "@playwright/test";
import {
  accessToken,
  createConfirmedUser,
  signInThroughUi,
} from "./support/auth";
import { standardSetup } from "./support/league";

async function expectAccessible(page: Page) {
  await expect(page).toHaveTitle(/\S/);
  const size = page.viewportSize();
  if (size) await page.setViewportSize({ width: size.width, height: 4000 });
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  if (size) await page.setViewportSize(size);
  expect(
    results.violations.map(
      (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
    ),
  ).toEqual([]);
}

async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
}

test("rename conferences and divisions from league settings", async ({
  page,
  baseURL,
}) => {
  const { email, password } = await createConfirmedUser("rename-ui");
  const api = createApiClient({
    baseUrl: baseURL ?? "",
    fetch,
    getAccessToken: async () => accessToken(email, password),
  });
  const league = await api.leagues.create({
    name: "Names League",
    setup: standardSetup(),
  });
  await signInThroughUi(page, email, password);
  await page.goto(`/leagues/${league.id}/settings`);

  const section = page.getByRole("region", {
    name: "Conferences and divisions",
  });
  await expect(section).toBeVisible();
  await expect(section.getByLabel("Conference name")).toHaveCount(2);
  await expect(section.getByLabel(/^Division name/)).toHaveCount(6);
  await noOverflow(page);
  await expectAccessible(page);

  // A blank name is explained and nothing is saved.
  const firstConference = section.getByLabel("Conference name").first();
  await firstConference.fill("   ");
  await section.getByRole("button", { name: "Save names" }).click();
  await expect(section.getByText("Enter a name.")).toBeVisible();

  // Two conferences can't share a name.
  const secondConference = section.getByLabel("Conference name").nth(1);
  await firstConference.fill("Same Name");
  await secondConference.fill("same name");
  await section.getByRole("button", { name: "Save names" }).click();
  await expect(section.getByRole("alert")).toContainText("can't share a name");

  // Valid names are saved.
  await secondConference.fill("Harbor League");
  await section
    .getByLabel(/^Division name/)
    .first()
    .fill("Lighthouse");
  await section.getByRole("button", { name: "Save names" }).click();
  await expect(section.getByRole("status")).toContainText("Names saved.");

  // They show up across the league, and the ids did not change.
  await page.goto(`/leagues/${league.id}/teams`);
  await expect(
    page.getByRole("heading", { name: "Same Name Conference" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Harbor League Conference" }),
  ).toBeVisible();
  await expect(page.getByText("Lighthouse Division")).toBeVisible();
  const structure = await api.leagues.structure(league.id);
  expect(structure.conferences.map((c) => c.name)).toEqual([
    "Same Name",
    "Harbor League",
  ]);
});

test.describe("structure API", () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "runs once, on desktop");
  });

  test("rename keeps ids and teams, and rejects bad input", async ({
    baseURL,
  }) => {
    const owner = await createConfirmedUser("rename-api");
    const other = await createConfirmedUser("rename-other");
    const client = (u: { email: string; password: string }) =>
      createApiClient({
        baseUrl: baseURL ?? "",
        fetch,
        getAccessToken: async () => accessToken(u.email, u.password),
      });
    const api = client(owner);
    const league = await api.leagues.create({
      name: "Renames",
      setup: standardSetup(),
    });

    const before = await api.leagues.structure(league.id);
    expect(before.conferences).toHaveLength(2);
    const ids = (s: typeof before) =>
      s.conferences.flatMap((c) => [c.id, ...c.divisions.map((d) => d.id)]);
    expect(
      before.conferences.every((c) =>
        c.divisions.every((d) => d.teamCount === 5),
      ),
    ).toBe(true);

    const teamsBefore = (await api.leagues.teams(league.id)).teams;
    const [c1, c2] = before.conferences;
    const renamed = await api.leagues.renameStructure(league.id, {
      conferences: [
        { id: c1!.id, name: c2!.name },
        { id: c2!.id, name: c1!.name },
      ],
      divisions: [{ id: c1!.divisions[0]!.id, name: "  First Division  " }],
    });
    // Names swapped in one request, and trimmed; ids and sizes unchanged.
    expect(renamed.conferences.map((c) => c.name)).toEqual([
      c2!.name,
      c1!.name,
    ]);
    expect(renamed.conferences[0]!.divisions[0]!.name).toBe("First Division");
    expect(ids(renamed)).toEqual(ids(before));
    const teamsAfter = (await api.leagues.teams(league.id)).teams;
    expect(teamsAfter.map((t) => [t.id, t.conferenceId, t.divisionId])).toEqual(
      teamsBefore.map((t) => [t.id, t.conferenceId, t.divisionId]),
    );
    expect(
      teamsAfter.find((t) => t.divisionId === c1!.divisions[0]!.id)!.division,
    ).toBe("First Division");

    // Bad input.
    await expect(
      api.leagues.renameStructure(league.id, {
        conferences: [
          { id: c1!.id, name: "Twin" },
          { id: c2!.id, name: "twin" },
        ],
        divisions: [],
      }),
    ).rejects.toMatchObject({ status: 409, code: "name_taken" });
    await expect(
      api.leagues.renameStructure(league.id, {
        conferences: [{ id: "no-such-conference", name: "X" }],
        divisions: [],
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      api.leagues.renameStructure(league.id, {
        conferences: [{ id: c1!.id, name: "   " }],
        divisions: [],
      }),
    ).rejects.toMatchObject({ status: 400 });
    // Rejected renames changed nothing.
    expect((await api.leagues.structure(league.id)).conferences[0]!.name).toBe(
      c2!.name,
    );

    // Another user sees and changes nothing.
    const intruder = client(other);
    await expect(intruder.leagues.structure(league.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      intruder.leagues.renameStructure(league.id, {
        conferences: [{ id: c1!.id, name: "Hijacked" }],
        divisions: [],
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

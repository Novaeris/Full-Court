import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createConfirmedUser, signInThroughUi } from "./support/auth";
import { createLeagueThroughUi } from "./support/league";

/**
 * Game Mode Selection (/modes) and the three mode entry points
 * (docs/DESIGN.md, "Game modes"). Layout checks run at every project size;
 * behaviour that doesn't depend on layout runs on desktop only.
 */

const MODES = [
  {
    title: "Owner Mode",
    path: "/owner",
    cta: "Enter Owner Mode",
    empty: ["No saves yet"],
    features: ["Roster building", "Finances", "Stadiums", "Championships"],
  },
  {
    title: "Career Mode",
    path: "/career",
    cta: "Enter Career Mode",
    empty: ["No careers yet"],
    features: [
      "Player creation",
      "Training",
      "Progression",
      "Career achievements",
    ],
  },
  {
    title: "Dynasty Mode",
    path: "/dynasty",
    cta: "Enter Dynasty Mode",
    empty: ["Your collection is empty", "No lineups yet"],
    features: [
      "Collections",
      "Rarities",
      "Lineups",
      "Head-to-head competition",
    ],
  },
] as const;

const HEADING = "Choose Your Game Mode";

async function expectAccessible(page: Page) {
  // Streamed pages send <title> with the streamed content; wait for it.
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

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

const desktopOnly = (name: string) =>
  test.skip(name !== "desktop", "behaviour, not layout: runs on desktop");

const card = (page: Page, title: string) =>
  page.getByRole("article", { name: title });

test("signing in lands on Game Mode Selection, which survives a reload", async ({
  page,
}, testInfo) => {
  desktopOnly(testInfo.project.name);
  const { email, password } = await createConfirmedUser("modes-land");
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/modes$/);
  await expect(
    page.getByRole("heading", { level: 1, name: HEADING }),
  ).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/modes$/);
  await expect(
    page.getByRole("heading", { level: 1, name: HEADING }),
  ).toBeVisible();

  // Signed in, the sign-in page and the home page lead back here.
  await page.goto("/login");
  await expect(page).toHaveURL(/\/modes$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/modes$/);
});

test("a requested mode wins over the default landing page", async ({
  page,
}, testInfo) => {
  desktopOnly(testInfo.project.name);
  const { email, password } = await createConfirmedUser("modes-next");
  await signInThroughUi(page, email, password, "/dynasty");
  await expect(
    page.getByRole("heading", { level: 1, name: "Dynasty Mode" }),
  ).toBeVisible();
});

test("shows all three modes, fits the screen and passes axe", async ({
  page,
}, testInfo) => {
  const { email, password } = await createConfirmedUser("modes-layout");
  await signInThroughUi(page, email, password, "/modes");
  await expect(
    page.getByRole("heading", { level: 1, name: HEADING }),
  ).toBeVisible();

  for (const mode of MODES) {
    const item = card(page, mode.title);
    await expect(item).toBeVisible();
    await expect(
      item.getByRole("heading", { level: 2, name: mode.title }),
    ).toBeVisible();
    await expect(
      item
        .getByRole("list", { name: `${mode.title} features` })
        .getByRole("listitem"),
    ).toHaveText([...mode.features]);
    const cta = item.getByRole("link", { name: mode.cta });
    await expect(cta).toHaveAttribute("href", mode.path);
    // Touch targets: at least 44px tall.
    expect((await cta.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  // Only Owner Mode is playable today; the others say so.
  await expect(card(page, "Owner Mode")).toContainText("Open alpha");
  await expect(card(page, "Career Mode")).toContainText("In development");
  await expect(card(page, "Dynasty Mode")).toContainText("In development");

  // Side by side on a wide desktop, stacked on phones. Measure the grid
  // cells: the cards themselves lift on hover.
  const tops = await Promise.all(
    MODES.map(
      async (mode) =>
        (await page
          .getByRole("listitem")
          .filter({ has: card(page, mode.title) })
          .boundingBox())!.y,
    ),
  );
  if (testInfo.project.name === "desktop") {
    expect(new Set(tops).size).toBe(1);
  } else if (testInfo.project.name === "phone") {
    expect(tops[0]).toBeLessThan(tops[1]);
    expect(tops[1]).toBeLessThan(tops[2]);
  }

  await noOverflow(page);
  await expectAccessible(page);
  await page.emulateMedia({ colorScheme: "dark" });
  await expectAccessible(page);

  await page.setViewportSize({ width: 320, height: 640 });
  await page.reload();
  await expect(card(page, "Dynasty Mode")).toBeVisible();
  await noOverflow(page);
});

test("each card leads to its mode, and back to the modes", async ({
  page,
}, testInfo) => {
  desktopOnly(testInfo.project.name);
  const { email, password } = await createConfirmedUser("modes-nav");
  await signInThroughUi(page, email, password, "/modes");

  for (const mode of MODES) {
    await card(page, mode.title).getByRole("link", { name: mode.cta }).click();
    await expect(page).toHaveURL(new RegExp(`${mode.path}$`));
    await expect(
      page.getByRole("heading", { level: 1, name: mode.title }),
    ).toBeVisible();
    await page.getByRole("link", { name: "All game modes" }).click();
    await expect(page).toHaveURL(/\/modes$/);
  }

  // Browser back returns to the selection screen.
  await card(page, "Career Mode")
    .getByRole("link", { name: "Enter Career Mode" })
    .click();
  await expect(page).toHaveURL(/\/career$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/modes$/);
  await expect(
    page.getByRole("heading", { level: 1, name: HEADING }),
  ).toBeVisible();
});

test("keyboard: one visible tab stop per mode, Enter opens it", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "needs a keyboard");
  const { email, password } = await createConfirmedUser("modes-keys");
  await signInThroughUi(page, email, password, "/modes");
  await expect(card(page, "Owner Mode")).toBeVisible();

  // Start from the top of the main content, as the skip link would. (Only the
  // current page's <main> is exposed; a previous route's may still be mounted.)
  await page.getByRole("main").focus();
  for (const mode of MODES) {
    await page.keyboard.press("Tab");
    const cta = card(page, mode.title).getByRole("link", { name: mode.cta });
    await expect(cta).toBeFocused();
    const outline = await cta.evaluate((el) => {
      const style = getComputedStyle(el);
      return { style: style.outlineStyle, width: style.outlineWidth };
    });
    expect(outline.style).not.toBe("none");
    expect(parseFloat(outline.width)).toBeGreaterThan(0);
  }

  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(
    card(page, "Owner Mode").getByRole("link", { name: "Enter Owner Mode" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/owner$/);
});

test("mode pages render on their own, fit the screen and pass axe", async ({
  page,
}) => {
  const { email, password } = await createConfirmedUser("modes-pages");
  await signInThroughUi(page, email, password, "/modes");

  for (const mode of MODES) {
    // Direct navigation and a reload both work.
    await page.goto(mode.path);
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: mode.title }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "All game modes" }),
    ).toBeVisible();
    // A new account has nothing saved in any mode.
    for (const title of mode.empty) {
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
    }
    await noOverflow(page);
    await expectAccessible(page);
  }

  await page.setViewportSize({ width: 320, height: 640 });
  for (const mode of MODES) {
    await page.goto(mode.path);
    await expect(
      page.getByRole("heading", { name: mode.empty[0] }),
    ).toBeVisible();
    await noOverflow(page);
  }
});

test("each mode marks itself in the app navigation", async ({
  page,
}, testInfo) => {
  const { email, password } = await createConfirmedUser("modes-current");
  await signInThroughUi(page, email, password, "/modes");
  const nav =
    testInfo.project.name === "phone"
      ? page.locator("nav.fixed[aria-label=Main]")
      : page.locator("aside nav[aria-label=Main]");

  for (const [path, label] of [
    ["/owner", "Owner"],
    ["/career", "Career"],
    ["/dynasty", "Dynasty"],
    ["/leagues", "Owner"],
  ] as const) {
    await page.goto(path);
    await expect(nav.getByRole("link", { name: label })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(nav.locator("[aria-current=page]")).toHaveCount(1);
  }
});

test("Owner Mode: start a world, then find it among the saves", async ({
  page,
}, testInfo) => {
  desktopOnly(testInfo.project.name);
  const { email, password } = await createConfirmedUser("modes-owner");
  await signInThroughUi(page, email, password, "/owner");

  await page.getByRole("link", { name: "Existing Saves" }).click();
  await expect(page).toHaveURL(/\/owner#saves$/);
  await page.getByRole("link", { name: "Create your first world" }).click();
  await expect(page).toHaveURL(/\/leagues\/new$/);
  await createLeagueThroughUi(page, "Bayside Owners");

  await page.goto("/owner");
  await expect(page.getByText("1 of 5 save slots used.")).toBeVisible();
  await page.getByRole("link", { name: /Bayside Owners/ }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Bayside Owners" }),
  ).toBeVisible();

  // The league list leads back to Owner Mode.
  await page.goto("/leagues");
  await page.getByRole("link", { name: "Owner Mode" }).click();
  await expect(page).toHaveURL(/\/owner$/);
  await expect(page.getByRole("link", { name: "New World" })).toHaveAttribute(
    "href",
    "/leagues/new",
  );
});

test("Career Mode: Create Player is honestly unavailable", async ({
  page,
}, testInfo) => {
  desktopOnly(testInfo.project.name);
  const { email, password } = await createConfirmedUser("modes-career");
  await signInThroughUi(page, email, password, "/career");
  const create = page.getByRole("button", { name: "Create Player" });
  await expect(create).toBeDisabled();
  await expect(create).toHaveAccessibleDescription("In development");
});

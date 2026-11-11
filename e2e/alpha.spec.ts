import { expect, test } from "@playwright/test";
import { createConfirmedUser, signInThroughUi } from "./support/auth";

/** Open-alpha notices, policy links and the first-sign-in introduction. */

test("the home page announces the open alpha", async ({ page }) => {
  await page.goto("/");
  const announcement = page.getByRole("region", {
    name: "Full Court is in open alpha",
  });
  await expect(announcement).toContainText("Saves and leagues may be reset");
  await announcement
    .getByRole("link", { name: "Read the Alpha Disclaimer" })
    .click();
  await expect(page).toHaveURL(/\/alpha$/);
});

test("the site header shows the alpha badge", async ({ page }) => {
  await page.goto("/about");
  await page
    .getByRole("banner")
    .getByRole("link", { name: /^Alpha/ })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Alpha Disclaimer" }),
  ).toBeVisible();
});

test("the footer links to every policy, support and the changelog", async ({
  page,
}) => {
  await page.goto("/");
  const footer = page.getByRole("navigation", { name: "Footer" });
  for (const [name, path] of [
    ["Terms of Service", "/terms"],
    ["Privacy Policy", "/privacy"],
    ["Alpha Disclaimer", "/alpha"],
    ["Acceptable Use", "/acceptable-use"],
    ["Contact & Support", "/support"],
    ["Changelog", "/changelog"],
  ] as const) {
    await expect(
      footer.getByRole("link", { name, exact: true }),
    ).toHaveAttribute("href", path);
  }
});

test("policy pages have a working table of contents", async ({ page }) => {
  await page.goto("/privacy");
  await page
    .getByRole("navigation", { name: "On this page" })
    .getByRole("link", { name: "How long we keep it" })
    .click();
  await expect(page).toHaveURL(/#retention$/);
  await expect(
    page.getByRole("heading", { name: "6. How long we keep it" }),
  ).toBeInViewport();
});

test.describe("signed in", () => {
  test("the app shows the alpha badge and links to the policies", async ({
    page,
  }, testInfo) => {
    const { email, password } = await createConfirmedUser("badge");
    await signInThroughUi(page, email, password);
    await expect(
      page.getByRole("link", { name: /^Alpha/ }).first(),
    ).toBeVisible();

    if (testInfo.project.name === "desktop") {
      await page.locator("summary", { hasText: "Legal" }).click();
      await expect(
        page.getByRole("link", { name: "Privacy Policy" }),
      ).toBeVisible();
    } else {
      await page.getByRole("button", { name: "More" }).click();
      await expect(
        page.getByRole("dialog", { name: "More" }).getByRole("link", {
          name: "Privacy Policy",
        }),
      ).toBeVisible();
    }
  });

  test("accounts that predate the Terms accept them once, with the alpha notice", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "flow runs on desktop");
    const { email, password } = await createConfirmedUser(
      "legacy",
      "Old Timer",
      { acknowledged: false },
    );
    await signInThroughUi(page, email, password);

    const intro = page.getByRole("dialog", {
      name: "Welcome to the Full Court open alpha",
    });
    await expect(intro).toBeVisible();
    const agree = intro.getByRole("checkbox", { name: /I agree to the Terms/ });
    await intro
      .getByRole("button", { name: "I understand, let's play" })
      .click();
    await expect(
      intro.getByText("Agree to the Terms to keep playing."),
    ).toBeVisible();

    await agree.check();
    await intro
      .getByRole("button", { name: "I understand, let's play" })
      .click();
    await expect(intro).toBeHidden();

    await page.goto("/account");
    await expect(
      page.getByRole("heading", { level: 1, name: "Account" }),
    ).toBeVisible();
    await expect(intro).toHaveCount(0);
  });
});

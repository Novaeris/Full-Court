import { expect, test, type Page } from "@playwright/test";
import { createConfirmedUser, signInThroughUi } from "./support/auth";

/** Signing out must be one or two taps away on every screen size. */

async function expectSignedOut(page: Page) {
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/leagues");
  await expect(page).toHaveURL(/\/login\?next=/);
}

test("sign out from the app navigation", async ({ page }, testInfo) => {
  const { email, password } = await createConfirmedUser("signout");
  await signInThroughUi(page, email, password);

  if (testInfo.project.name === "desktop") {
    // Desktop: a button at the foot of the sidebar.
    await page
      .locator("aside")
      .getByRole("button", { name: "Sign out" })
      .click();
  } else {
    // Phone and tablet: inside the More sheet.
    await page.getByRole("button", { name: "More" }).click();
    await page
      .getByRole("dialog", { name: "More" })
      .getByRole("button", { name: "Sign out" })
      .click();
  }
  await expectSignedOut(page);
});

test("sign out from the public site", async ({ page }, testInfo) => {
  const { email, password } = await createConfirmedUser("signoutsite");
  await signInThroughUi(page, email, password);
  await page.goto("/about");

  if (testInfo.project.name === "phone") {
    await page.getByRole("button", { name: "Menu" }).click();
    await page
      .getByRole("dialog", { name: "Menu" })
      .getByRole("button", { name: "Sign out" })
      .click();
  } else {
    await page
      .getByRole("banner")
      .getByRole("button", { name: "Sign out" })
      .click();
  }
  await expectSignedOut(page);
});

test("visitors don't see a sign-out button", async ({ page }) => {
  await page.goto("/about");
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);
});

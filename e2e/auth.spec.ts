import { expect, test } from "@playwright/test";
import {
  createConfirmedUser,
  emailLink,
  PASSWORD,
  signInThroughUi,
  signOutThroughUi,
  uniqueEmail,
} from "./support/auth";

/**
 * Account flows end to end against local Supabase. Screen size doesn't change
 * the logic, so these run once, on desktop; layout is covered elsewhere.
 */
test.beforeEach(({ browserName: _ }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "auth flows run on desktop");
});

test("sign up, confirm by email and land signed in", async ({ page }) => {
  const email = uniqueEmail("signup");
  await page.goto("/signup");
  await page.getByLabel("Display name").fill("Rookie Coach");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("status")).toContainText(email);

  // Not signed in until the email is confirmed.
  await page.goto("/leagues");
  await expect(page).toHaveURL(/\/login\?next=%2Fleagues$/);

  await page.goto(await emailLink(email, "Confirm your Full Court account"));
  await expect(page).toHaveURL(/\/leagues$/);
  await expect(
    page.getByRole("link", { name: "Account: Rookie Coach" }).first(),
  ).toBeVisible();
});

test("sign-up form explains invalid input", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Enter a display name.")).toBeVisible();
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  await expect(page.getByText("Use at least 10 characters.")).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue("not-an-email");
});

test("an unconfirmed account can't sign in and can resend the link", async ({
  page,
}) => {
  const email = uniqueEmail("unconfirmed");
  await page.goto("/signup");
  await page.getByLabel("Display name").fill("Waiting");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("status")).toBeVisible();

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("#main").getByRole("alert")).toContainText(
    "Confirm your email",
  );
  await page
    .getByRole("button", { name: "Send the confirmation link again" })
    .click();
  await expect(page.getByRole("status")).toContainText("new link");
});

test("sign in, return to the requested page, then sign out", async ({
  page,
}) => {
  const { email, password } = await createConfirmedUser("signin", "Ada");

  await page.goto("/account");
  await expect(page).toHaveURL(/\/login\?next=%2Faccount$/);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("wrong password!!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("#main").getByRole("alert")).toHaveText(
    "Email or password is incorrect.",
  );

  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByText(`Signed in as ${email}.`)).toBeVisible();

  // Signed-in visitors skip the sign-in page.
  await page.goto("/login");
  await expect(page).toHaveURL(/\/leagues$/);

  await page.goto("/account");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login/);
});

test("sign-in ignores off-site next= targets", async ({ page }) => {
  const { email, password } = await createConfirmedUser("next");
  await page.goto(`/login?next=${encodeURIComponent("//evil.example")}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/localhost:\d+\/leagues$/);
});

test("reset a forgotten password by email", async ({ page }) => {
  const { email } = await createConfirmedUser("reset");
  const newPassword = "a brand new passphrase";

  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText(email);

  await page.goto(await emailLink(email, "Reset your Full Court password"));
  await expect(page).toHaveURL(/\/reset-password$/);
  await page.getByLabel("New password").fill(newPassword);
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page).toHaveURL(/\/account\?notice=password-reset$/);
  await expect(page.getByRole("status").first()).toContainText(
    "Your new password is saved.",
  );

  await signOutThroughUi(page);
  await signInThroughUi(page, email, newPassword);
});

test("a used or broken email link is rejected", async ({ page }) => {
  await page.goto("/auth/confirm?token_hash=bogus&type=email&next=/leagues");
  await expect(page).toHaveURL(/\/login\?error=link$/);
  await expect(page.locator("#main").getByRole("alert")).toContainText(
    "invalid or has expired",
  );
});

test("the reset page explains itself without a reset link", async ({
  page,
}) => {
  await page.goto("/reset-password");
  await expect(
    page.getByRole("link", { name: "Request a new link" }),
  ).toBeVisible();
});

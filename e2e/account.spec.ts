import AxeBuilder from "@axe-core/playwright";
import { createApiClient, ApiRequestError } from "@fullcourt/api-client";
import { expect, test } from "@playwright/test";
import {
  accessToken,
  createConfirmedUser,
  emailLink,
  PASSWORD,
  signInThroughUi,
  signOutThroughUi,
} from "./support/auth";

test.describe("signed-in account page", () => {
  test("is accessible and fits the screen", async ({ page }) => {
    const { email, password } = await createConfirmedUser("a11y");
    await signInThroughUi(page, email, password, "/account");
    await expect(
      page.getByRole("heading", { name: "Account", exact: true }),
    ).toBeVisible();
    for (const scheme of ["light", "dark"] as const) {
      // Reduced motion turns colour transitions off, so axe sees final colours.
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(
        results.violations.map(
          (v) =>
            `${v.id}: ${v.nodes.map((n) => `${n.target.join(" ")} ${n.failureSummary}`).join(" | ")}`,
        ),
        scheme,
      ).toEqual([]);
    }
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("account settings", () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "runs once, on desktop");
  });

  test("rename yourself", async ({ page }) => {
    const { email, password } = await createConfirmedUser("rename", "Old Name");
    await signInThroughUi(page, email, password, "/account");
    const name = page.getByLabel("Display name");
    await expect(name).toHaveValue("Old Name");
    await name.fill("  New Name  ");
    await page.getByRole("button", { name: "Save name" }).click();
    await expect(page.getByText("Display name saved.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Display name")).toHaveValue("New Name");
    await expect(
      page.getByRole("link", { name: "Account: New Name" }).first(),
    ).toBeVisible();
  });

  test("change password requires the current one", async ({ page }) => {
    const { email, password } = await createConfirmedUser("chpw");
    await signInThroughUi(page, email, password, "/account");
    const section = page.getByRole("region", { name: "Password" });

    await section.getByLabel("Current password").fill("not my password");
    await section.getByLabel("New password").fill("another long passphrase");
    await section.getByRole("button", { name: "Change password" }).click();
    await expect(section.getByRole("alert")).toContainText("incorrect");

    await section.getByLabel("Current password").fill(password);
    await section.getByLabel("New password").fill("another long passphrase");
    await section.getByRole("button", { name: "Change password" }).click();
    await expect(section.getByRole("status")).toContainText("changed");

    await signOutThroughUi(page);
    await signInThroughUi(page, email, "another long passphrase");
  });

  test("change email after confirming from both addresses", async ({
    page,
  }) => {
    const { email, password } = await createConfirmedUser("chmail");
    const newEmail = email.replace("e2e-chmail", "e2e-chmail-new");
    await signInThroughUi(page, email, password, "/account");
    const section = page.getByRole("region", { name: "Email" });
    await section.getByLabel("New email").fill(newEmail);
    await section.getByLabel("Current password").fill(password);
    await section.getByRole("button", { name: "Change email" }).click();
    await expect(section.getByRole("status")).toContainText(newEmail);

    // Secure email change: both the old and the new address must confirm.
    await page.goto(
      await emailLink(email, "Confirm your new Full Court email"),
    );
    await page.goto(
      await emailLink(newEmail, "Confirm your new Full Court email"),
    );
    await expect(page).toHaveURL(/\/account\?notice=email-changed$/);
    await expect(page.getByText(`Signed in as ${newEmail}.`)).toBeVisible();
  });

  test("delete the account after confirming the password", async ({ page }) => {
    const { email, password } = await createConfirmedUser("delete");
    await signInThroughUi(page, email, password, "/account");
    const section = page.getByRole("region", { name: "Delete account" });

    await section.getByLabel("Password").fill(password);
    await section.getByRole("button", { name: "Delete my account" }).click();
    await expect(
      section.getByText("Type DELETE to confirm.").first(),
    ).toBeVisible();

    await section.getByLabel("Type DELETE to confirm").fill("DELETE");
    await section.getByLabel("Password").fill("wrong password");
    await section.getByRole("button", { name: "Delete my account" }).click();
    await expect(section.getByRole("alert")).toContainText("incorrect");

    await section.getByLabel("Type DELETE to confirm").fill("DELETE");
    await section.getByLabel("Password").fill(password);
    await section.getByRole("button", { name: "Delete my account" }).click();
    await expect(page).toHaveURL(/\/account-deleted$/);

    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("#main").getByRole("alert")).toHaveText(
      "Email or password is incorrect.",
    );
  });
});

test.describe("/api/v1/me", () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "runs once, on desktop");
  });

  test("works with a Bearer token, the way mobile and desktop call it", async ({
    baseURL,
  }) => {
    const { email, password } = await createConfirmedUser("bearer", "Mobile");
    const token = await accessToken(email, password);
    const api = createApiClient({
      baseUrl: baseURL ?? "",
      fetch,
      getAccessToken: async () => token,
    });

    const me = await api.me();
    expect(me).toMatchObject({ email, displayName: "Mobile" });

    await expect(
      api.updateMe({ displayName: "  Desktop " }),
    ).resolves.toMatchObject({
      displayName: "Desktop",
    });
    await expect(api.updateMe({ displayName: "" })).rejects.toMatchObject({
      status: 400,
      code: "invalid_request",
    });

    await expect(api.deleteMe({ password: "nope" })).rejects.toMatchObject({
      status: 403,
      code: "wrong_password",
    });
    await expect(api.deleteMe({ password })).resolves.toEqual({
      deleted: true,
    });
    await expect(accessToken(email, password)).rejects.toBeTruthy();
  });

  test("works with the web session cookie", async ({ page }) => {
    const { email, password } = await createConfirmedUser("cookie", "Web");
    await signInThroughUi(page, email, password);
    const response = await page.request.get("/api/v1/me");
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ email, displayName: "Web" });
  });

  test("rejects missing, malformed and forged tokens", async ({
    request,
    baseURL,
  }) => {
    expect((await request.get("/api/v1/me")).status()).toBe(401);
    const malformed = await request.get("/api/v1/me", {
      headers: { authorization: "Token abc" },
    });
    expect(malformed.status()).toBe(401);

    const forged = createApiClient({
      baseUrl: baseURL ?? "",
      fetch,
      getAccessToken: async () =>
        "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMTExIiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQifQ.c2lnbmF0dXJl", // secret-scan:allow (fake, unsigned)
    });
    const error = await forged.me().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: 401, code: "unauthorized" });
  });

  test("one user's token only ever reaches their own profile", async ({
    baseURL,
  }) => {
    const alice = await createConfirmedUser("alice", "Alice");
    const bob = await createConfirmedUser("bob", "Bob");
    const asBob = createApiClient({
      baseUrl: baseURL ?? "",
      fetch,
      getAccessToken: async () => accessToken(bob.email, bob.password),
    });
    const me = await asBob.me();
    expect(me.displayName).toBe("Bob");
    expect(me.email).not.toBe(alice.email);
    expect(PASSWORD).toBe(alice.password);
  });
});

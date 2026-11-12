import { expect, test, type Page } from "@playwright/test";
import { createConfirmedUser, signInThroughUi } from "./support/auth";

/**
 * Contact & Support form. Visitors are rate limited per IP address, so each
 * test claims its own address; signed-in players are limited per account.
 */
test.beforeEach(async ({ page }) => {
  const octet = () => Math.floor(Math.random() * 250) + 1;
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": `198.51.${octet()}.${octet()}`,
  });
});

async function fillForm(
  page: Page,
  overrides: Partial<
    Record<"name" | "email" | "subject" | "message", string>
  > = {},
) {
  const form = page.getByRole("region", { name: "Send a request" });
  await form.getByLabel("Name").fill(overrides.name ?? "Sam Tester");
  await form.getByLabel("Email").fill(overrides.email ?? "sam@example.test");
  await form.getByLabel("Category").selectOption({ label: "Bug report" });
  await form.getByLabel("Subject").fill(overrides.subject ?? "Standings blank");
  await form
    .getByLabel("Message")
    .fill(
      overrides.message ??
        "After creating a league, the standings page shows nothing at all.",
    );
  // Forms sent within two seconds of loading are treated as bots.
  await page.waitForTimeout(2_100);
  return form;
}

test("visitors can send a support request", async ({ page }) => {
  await page.goto("/support");
  const form = await fillForm(page);
  await form.getByRole("button", { name: "Send" }).click();
  await expect(form.getByRole("status")).toContainText(
    "we received your request",
  );
});

test("the form explains invalid input and keeps what was typed", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "validation runs on desktop");
  await page.goto("/support");
  const form = page.getByRole("region", { name: "Send a request" });
  await page.waitForTimeout(2_100);
  await form.getByLabel("Email").fill("not-an-email");
  await form.getByRole("button", { name: "Send" }).click();
  await expect(form.getByText("Enter your name.")).toBeVisible();
  await expect(form.getByText("Enter a valid email address.")).toBeVisible();
  await expect(form.getByText("Choose a category.")).toBeVisible();
  await expect(form.getByLabel("Email")).toHaveValue("not-an-email");
});

test("passwords are turned back", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "validation runs on desktop");
  await page.goto("/support");
  const form = await fillForm(page, {
    message: "I can't sign in. My password is hunter2hunter2, please check.",
  });
  await form.getByRole("button", { name: "Send" }).click();
  await expect(
    form.getByText("Please remove any password or access token."),
  ).toBeVisible();
});

test("signed-in players get their details filled in and are rate limited", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "flow runs on desktop");
  const { email, password } = await createConfirmedUser("support", "Pat Coach");
  await signInThroughUi(page, email, password);

  for (let sent = 0; sent < 3; sent++) {
    await page.goto("/support");
    const form = page.getByRole("region", { name: "Send a request" });
    await expect(form.getByLabel("Name")).toHaveValue("Pat Coach");
    await expect(form.getByLabel("Email")).toHaveValue(email);
    await fillForm(page, { name: "Pat Coach", email });
    await form.getByRole("button", { name: "Send" }).click();
    await expect(form.getByRole("status")).toBeVisible();
  }

  await page.goto("/support");
  const form = await fillForm(page, { name: "Pat Coach", email });
  await form.getByRole("button", { name: "Send" }).click();
  await expect(form.getByRole("alert")).toContainText(
    "sent several requests recently",
  );
});

test("forms sent instantly are treated as bots", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "runs on desktop");
  await page.goto("/support");
  const form = page.getByRole("region", { name: "Send a request" });
  await form.getByLabel("Name").fill("Bot");
  await form.getByRole("button", { name: "Send" }).click();
  await expect(form.getByRole("alert")).toContainText("very quick");
});

test.describe("analytics events API", () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "API runs on desktop");
  });

  test("counts page views and honours opt-out signals", async ({ request }) => {
    const counted = await request.post("/api/v1/events", {
      data: { event: "page_view", path: "/leagues" },
    });
    expect(counted.status()).toBe(200);
    expect(await counted.json()).toEqual({ recorded: true });

    const optedOut = await request.post("/api/v1/events", {
      data: { event: "page_view", path: "/" },
      headers: { "sec-gpc": "1" },
    });
    expect(await optedOut.json()).toEqual({ recorded: false });
  });

  test("rejects events only the server may record", async ({ request }) => {
    const response = await request.post("/api/v1/events", {
      data: { event: "league_created" },
    });
    expect(response.status()).toBe(400);
  });
});

import { createApiClient } from "@fullcourt/api-client";
import { expect, test } from "@playwright/test";

test.describe("application API", () => {
  // eslint-disable-next-line no-empty-pattern -- Playwright requires an object pattern for fixtures
  test.beforeEach(({}, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop",
      "API checks do not depend on screen size",
    );
  });

  test("api-client talks to the live /api/v1", async ({ baseURL }) => {
    const client = createApiClient({ baseUrl: baseURL ?? "", fetch });
    await expect(client.health()).resolves.toMatchObject({ status: "ok" });
  });

  test("health endpoints are never cached", async ({ request }) => {
    for (const path of ["/api/health", "/api/v1/health"]) {
      const response = await request.get(path);
      expect(response.status()).toBe(200);
      expect(response.headers()["cache-control"]).toContain("no-store");
    }
  });

  test("unknown endpoints return the JSON error envelope", async ({
    request,
  }) => {
    for (const method of ["get", "post", "delete"] as const) {
      const response = await request[method]("/api/v1/no-such-thing");
      expect(response.status()).toBe(404);
      expect(await response.json()).toEqual({
        error: { code: "not_found", message: "No such API endpoint." },
      });
    }
  });
});

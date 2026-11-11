import { describe, expect, it } from "vitest";
import { createApiClient } from "./index";

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("api-client", () => {
  it("calls /api/v1/health with the bearer token and validates the response", async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const client = createApiClient({
      baseUrl: "https://example.test/",
      fetch: async (url, init) => {
        calls.push({
          url: String(url),
          headers: init?.headers as Record<string, string>,
        });
        return jsonResponse(200, { status: "ok", version: "1.2.3" });
      },
      getAccessToken: async () => "token-123",
    });

    await expect(client.health()).resolves.toEqual({
      status: "ok",
      version: "1.2.3",
    });
    expect(calls[0]?.url).toBe("https://example.test/api/v1/health");
    expect(calls[0]?.headers.authorization).toBe("Bearer token-123");
  });

  it("raises the server's error envelope", async () => {
    const client = createApiClient({
      baseUrl: "https://example.test",
      fetch: async () =>
        jsonResponse(503, { error: { code: "unavailable", message: "Down" } }),
    });
    await expect(client.health()).rejects.toMatchObject({
      status: 503,
      code: "unavailable",
    });
  });

  it("rejects a malformed success body", async () => {
    const client = createApiClient({
      baseUrl: "https://example.test",
      fetch: async () => jsonResponse(200, { status: "nope" }),
    });
    await expect(client.health()).rejects.toThrow();
  });
});

describe("api-client leagues", () => {
  it("sends method, path and JSON body", async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    const league = {
      id: "6f1d2c3b-4a5e-4f60-8a71-b2c3d4e5f607",
      name: "Dynasty",
      status: "setup",
      size: "standard",
      userTeamId: null,
      createdAt: "2026-11-11T00:00:00Z",
      updatedAt: "2026-11-11T00:00:00Z",
    };
    const client = createApiClient({
      baseUrl: "https://example.test",
      fetch: async (url, init) => {
        calls.push({ url: String(url), init });
        return jsonResponse(201, league);
      },
    });
    await expect(client.leagues.create({ name: "Dynasty" })).resolves.toEqual(
      league,
    );
    expect(calls[0]?.url).toBe("https://example.test/api/v1/leagues");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(calls[0]?.init?.body).toBe(JSON.stringify({ name: "Dynasty" }));
    expect(
      (calls[0]?.init?.headers as Record<string, string>)["content-type"],
    ).toBe("application/json");
  });
});

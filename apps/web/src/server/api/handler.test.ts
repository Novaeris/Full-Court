import { HealthResponseSchema } from "@fullcourt/validation";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ connection: async () => {} }));

const { apiRoute, ApiError } = await import("./handler");

/** Minimal zod-like schema for request bodies in these tests. */
const NameBody = {
  safeParse(value: unknown) {
    if (
      typeof value === "object" &&
      value !== null &&
      "name" in value &&
      typeof value.name === "string" &&
      value.name.length > 0
    ) {
      return { success: true as const, data: { name: value.name } };
    }
    return {
      success: false as const,
      error: { issues: [{ path: ["name"], message: "Required" }] },
    };
  },
};

const post = (body: string) =>
  new Request("http://test/api/v1/x", { method: "POST", body });

describe("apiRoute", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns a validated response with no-store caching", async () => {
    const route = apiRoute({
      response: HealthResponseSchema,
      handler: () => ({ status: "ok" as const, version: "abc" }),
    });
    const response = await route(new Request("http://test/api/v1/health"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ok", version: "abc" });
  });

  it("maps ApiError to the shared error envelope", async () => {
    const route = apiRoute({
      response: HealthResponseSchema,
      handler: () => {
        throw new ApiError(409, "conflict", "Already exists.");
      },
    });
    const response = await route(new Request("http://test"));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: { code: "conflict", message: "Already exists." },
    });
  });

  it("hides unexpected errors behind a generic 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const route = apiRoute({
      response: HealthResponseSchema,
      handler: () => {
        throw new Error("database password is hunter2");
      },
    });
    const response = await route(new Request("http://test"));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({
      error: { code: "internal_error", message: "Something went wrong." },
    });
    expect(JSON.stringify(body)).not.toContain("hunter2");
  });

  it("refuses to send a response that breaks the contract", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const route = apiRoute({
      response: HealthResponseSchema,
      handler: () => ({ status: "down" }) as never,
    });
    const response = await route(new Request("http://test"));
    expect(response.status).toBe(500);
  });

  it("validates the request body", async () => {
    const route = apiRoute({
      body: NameBody,
      response: NameBody,
      status: 201,
      handler: ({ body }) => ({ name: body.name.toUpperCase() }),
    });

    const ok = await route(post(JSON.stringify({ name: "hale" })));
    expect(ok.status).toBe(201);
    expect(await ok.json()).toEqual({ name: "HALE" });

    const invalid = await route(post(JSON.stringify({ name: "" })));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({
      error: { code: "invalid_request", message: "name: Required" },
    });

    const notJson = await route(post("{nope"));
    expect(notJson.status).toBe(400);
    expect((await notJson.json()).error.code).toBe("invalid_json");
  });
});

import { describe, expect, it } from "vitest";
import { ApiErrorSchema, HealthResponseSchema } from "./index";

describe("validation", () => {
  it("accepts a valid health response", () => {
    expect(
      HealthResponseSchema.parse({ status: "ok", version: "0.0.0" }),
    ).toEqual({
      status: "ok",
      version: "0.0.0",
    });
  });

  it("rejects an invalid health response", () => {
    expect(HealthResponseSchema.safeParse({ status: "down" }).success).toBe(
      false,
    );
  });

  it("parses the error envelope", () => {
    expect(
      ApiErrorSchema.safeParse({ error: { code: "x", message: "y" } }).success,
    ).toBe(true);
  });
});

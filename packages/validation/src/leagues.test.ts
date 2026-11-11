import { describe, expect, it } from "vitest";
import {
  CreateLeagueRequestSchema,
  LeagueIdSchema,
  LeagueListSchema,
} from "./leagues";

describe("league schemas", () => {
  it("trims and accepts a league name", () => {
    expect(CreateLeagueRequestSchema.parse({ name: "  Dynasty  " })).toEqual({
      name: "Dynasty",
    });
  });

  it("rejects blank and overlong names", () => {
    expect(CreateLeagueRequestSchema.safeParse({ name: "  " }).success).toBe(
      false,
    );
    expect(
      CreateLeagueRequestSchema.safeParse({ name: "x".repeat(41) }).success,
    ).toBe(false);
  });

  it("only accepts uuid league ids", () => {
    expect(LeagueIdSchema.safeParse("not-a-uuid").success).toBe(false);
    expect(
      LeagueIdSchema.safeParse("6f1d2c3b-4a5e-4f60-8a71-b2c3d4e5f607").success,
    ).toBe(true);
  });

  it("validates a league list", () => {
    expect(
      LeagueListSchema.safeParse({
        limit: 5,
        leagues: [
          {
            id: "6f1d2c3b-4a5e-4f60-8a71-b2c3d4e5f607",
            name: "A",
            status: "setup",
            createdAt: "2026-11-11T00:00:00Z",
            updatedAt: "2026-11-11T00:00:00Z",
          },
        ],
      }).success,
    ).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { isLegalRosterSize, missingPositions } from "./index";

describe("game-rules", () => {
  it("checks roster size", () => {
    expect(isLegalRosterSize(12)).toBe(false);
    expect(isLegalRosterSize(13)).toBe(true);
    expect(isLegalRosterSize(15)).toBe(true);
    expect(isLegalRosterSize(16)).toBe(false);
    expect(isLegalRosterSize(14.5)).toBe(false);
  });

  it("finds missing positions", () => {
    expect(missingPositions(["PG", "SG", "C"])).toEqual(["SF", "PF"]);
  });
});

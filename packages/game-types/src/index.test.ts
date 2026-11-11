import { describe, expect, it } from "vitest";
import { isPosition, POSITIONS } from "./index";

describe("game-types", () => {
  it("lists five positions", () => {
    expect(POSITIONS).toHaveLength(5);
  });

  it("recognises positions", () => {
    expect(isPosition("C")).toBe(true);
    expect(isPosition("QB")).toBe(false);
  });
});

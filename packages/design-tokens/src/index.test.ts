import { describe, expect, it } from "vitest";
import { breakpoints } from "./index";

describe("design-tokens", () => {
  it("orders breakpoints from small to large", () => {
    expect(breakpoints.tablet).toBeLessThan(breakpoints.desktop);
    expect(breakpoints.desktop).toBeLessThan(breakpoints.wide);
  });
});

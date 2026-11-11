import { describe, expect, it } from "vitest";
import { err, invariant, ok } from "./index";

describe("shared", () => {
  it("builds results", () => {
    expect(ok(1)).toEqual({ ok: true, value: 1 });
    expect(err("no")).toEqual({ ok: false, error: "no" });
  });

  it("throws on a failed invariant", () => {
    expect(() => invariant(false, "boom")).toThrow("Invariant failed: boom");
    expect(() => invariant(true, "fine")).not.toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { APP_NAV, isActive } from "./nav-config";

const owner = APP_NAV.find((item) => item.href === "/owner")!;

describe("isActive", () => {
  it("matches the section and its subpages", () => {
    expect(isActive("/modes", { href: "/modes" })).toBe(true);
    expect(isActive("/career/new", { href: "/career" })).toBe(true);
  });

  it("does not match a section that only shares a prefix", () => {
    expect(isActive("/modes-old", { href: "/modes" })).toBe(false);
    expect(isActive("/", { href: "/modes" })).toBe(false);
  });

  it("treats league pages as part of Owner Mode", () => {
    expect(isActive("/owner", owner)).toBe(true);
    expect(isActive("/leagues", owner)).toBe(true);
    expect(isActive("/leagues/abc/roster", owner)).toBe(true);
    expect(isActive("/leagues", { href: "/career" })).toBe(false);
  });
});

describe("APP_NAV", () => {
  it("leads with the mode gateway and fits the phone tab bar", () => {
    expect(APP_NAV.map((item) => item.href)).toEqual([
      "/modes",
      "/owner",
      "/career",
      "/dynasty",
    ]);
    // The tab bar adds "More" as the fifth tab.
    expect(APP_NAV.length).toBeLessThanOrEqual(4);
  });
});

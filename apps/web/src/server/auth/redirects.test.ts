import { afterEach, describe, expect, it, vi } from "vitest";
import { confirmUrl, safeNextPath, siteUrl } from "./redirects";

describe("safeNextPath", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/account")).toBe("/account");
    expect(safeNextPath("/leagues?tab=2#top")).toBe("/leagues?tab=2#top");
  });

  it.each([
    null,
    undefined,
    "",
    "account",
    "https://evil.test/",
    "//evil.test",
    "/\\evil.test",
    "javascript:alert(1)",
    "/\nnext",
  ])("rejects %j", (value) => {
    expect(safeNextPath(value as string)).toBe("/leagues");
  });

  it("uses the given fallback", () => {
    expect(safeNextPath("//x", "/")).toBe("/");
  });
});

describe("siteUrl and confirmUrl", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("prefers SITE_URL, then Render's external URL", () => {
    vi.stubEnv("SITE_URL", "http://localhost:3100/");
    expect(siteUrl()).toBe("http://localhost:3100");
    vi.stubEnv("SITE_URL", undefined as unknown as string);
    vi.stubEnv("RENDER_EXTERNAL_URL", "https://fc.example");
    expect(siteUrl()).toBe("https://fc.example");
  });

  it("builds a confirm link with a safe next path", () => {
    vi.stubEnv("SITE_URL", "https://fc.example");
    expect(confirmUrl("/account")).toBe(
      "https://fc.example/auth/confirm?next=%2Faccount",
    );
    expect(confirmUrl("https://evil.test")).toBe(
      "https://fc.example/auth/confirm?next=%2Fleagues",
    );
  });
});

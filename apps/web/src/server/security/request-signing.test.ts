import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

beforeAll(() => {
  process.env.RATE_LIMIT_SECRET = "test-secret-test-secret-test-secret-1234";
});

const { checkFormToken, issueFormToken, senderKey } =
  await import("./request-signing");

describe("form tokens", () => {
  it("accepts a token after the minimum time", () => {
    const token = issueFormToken(1_000_000);
    expect(checkFormToken(token, 1_000_000 + 5_000)).toBe("ok");
  });

  it("flags forms sent too quickly", () => {
    const token = issueFormToken(1_000_000);
    expect(checkFormToken(token, 1_000_500)).toBe("too_fast");
  });

  it("rejects forged, tampered and expired tokens", () => {
    const token = issueFormToken(1_000_000);
    expect(checkFormToken("1000000.forged", 1_010_000)).toBe("invalid");
    expect(checkFormToken(token.replace("1000000", "999000"), 1_010_000)).toBe(
      "invalid",
    );
    expect(checkFormToken(token, 1_000_000 + 25 * 3600 * 1000)).toBe("invalid");
    expect(checkFormToken("", 0)).toBe("invalid");
  });
});

describe("sender keys", () => {
  it("never contains the raw IP address", () => {
    const key = senderKey({
      userId: null,
      forwardedFor: "203.0.113.9, 10.0.0.1",
    });
    expect(key).not.toContain("203.0.113.9");
    expect(key).toBe(senderKey({ userId: null, forwardedFor: "203.0.113.9" }));
  });

  it("uses the account when signed in", () => {
    const a = senderKey({ userId: "user-a", forwardedFor: "203.0.113.9" });
    const b = senderKey({ userId: "user-b", forwardedFor: "203.0.113.9" });
    expect(a).not.toBe(b);
    expect(a.startsWith("u:")).toBe(true);
  });
});

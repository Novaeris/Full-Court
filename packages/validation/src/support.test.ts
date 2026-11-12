import { describe, expect, it } from "vitest";
import {
  AnalyticsEventRequestSchema,
  looksLikeCredential,
  SupportRequestSchema,
} from "./support";

const VALID = {
  name: " Sam ",
  email: "sam@example.test",
  category: "bug",
  subject: " Standings page is blank ",
  message: "After creating a league the standings page shows nothing.",
};

describe("support request schema", () => {
  it("accepts and trims a valid request", () => {
    const parsed = SupportRequestSchema.parse(VALID);
    expect(parsed.name).toBe("Sam");
    expect(parsed.subject).toBe("Standings page is blank");
  });

  it("requires a known category", () => {
    expect(
      SupportRequestSchema.safeParse({ ...VALID, category: "billing" }).success,
    ).toBe(false);
  });

  it("rejects line breaks in the subject", () => {
    expect(
      SupportRequestSchema.safeParse({
        ...VALID,
        subject: "Hi\r\nBcc: someone@example.test",
      }).success,
    ).toBe(false);
  });

  it("allows line breaks in the message", () => {
    expect(
      SupportRequestSchema.safeParse({
        ...VALID,
        message: "Step one.\nStep two.\r\nStep three.",
      }).success,
    ).toBe(true);
  });

  it("rejects overlong and too-short messages", () => {
    expect(
      SupportRequestSchema.safeParse({ ...VALID, message: "short" }).success,
    ).toBe(false);
    expect(
      SupportRequestSchema.safeParse({ ...VALID, message: "x".repeat(5001) })
        .success,
    ).toBe(false);
  });

  it("rejects messages full of links", () => {
    const links = Array.from({ length: 6 }, (_, i) => `https://e.test/${i}`);
    expect(
      SupportRequestSchema.safeParse({ ...VALID, message: links.join(" ") })
        .success,
    ).toBe(false);
  });

  it("turns back passwords and tokens", () => {
    expect(
      SupportRequestSchema.safeParse({
        ...VALID,
        message: "I can't sign in. My password is hunter22 by the way.",
      }).success,
    ).toBe(false);
  });
});

describe("looksLikeCredential", () => {
  it("spots passwords and tokens", () => {
    expect(looksLikeCredential("password: correct-horse")).toBe(true);
    expect(
      looksLikeCredential(
        `token ${["eyJhbGciOiJIUzI1NiJ9", "eyJzdWIiOiIxMjM0NTY3ODkwIn0", "s".repeat(24)].join(".")}`,
      ),
    ).toBe(true);
    expect(
      looksLikeCredential("Authorization: Bearer abcdefghijklmnopqrstuvwxyz"),
    ).toBe(true);
  });

  it("leaves ordinary messages alone", () => {
    expect(
      looksLikeCredential(
        "I forgot my password and the reset email never came.",
      ),
    ).toBe(false);
    expect(looksLikeCredential("The password reset link expired.")).toBe(false);
  });
});

describe("analytics event schema", () => {
  it("accepts only events a browser may send", () => {
    expect(
      AnalyticsEventRequestSchema.safeParse({ event: "page_view", path: "/" })
        .success,
    ).toBe(true);
    expect(
      AnalyticsEventRequestSchema.safeParse({ event: "league_created" })
        .success,
    ).toBe(false);
  });
});

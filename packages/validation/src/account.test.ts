import { describe, expect, it } from "vitest";
import {
  DeleteAccountRequestSchema,
  ProfileSchema,
  SignUpRequestSchema,
  UpdateProfileRequestSchema,
} from "./account";

describe("account schemas", () => {
  const valid = {
    displayName: "  Coach  ",
    email: " coach@example.test ",
    password: "correct horse",
    acceptTerms: true,
  };

  it("accepts and trims a valid sign-up", () => {
    expect(SignUpRequestSchema.parse(valid)).toEqual({
      displayName: "Coach",
      email: "coach@example.test",
      password: "correct horse",
      acceptTerms: true,
    });
  });

  it("requires the Terms checkbox", () => {
    expect(
      SignUpRequestSchema.safeParse({ ...valid, acceptTerms: false }).success,
    ).toBe(false);
  });

  it("rejects short passwords, bad emails and long names", () => {
    expect(
      SignUpRequestSchema.safeParse({ ...valid, password: "short" }).success,
    ).toBe(false);
    expect(
      SignUpRequestSchema.safeParse({ ...valid, email: "nope" }).success,
    ).toBe(false);
    expect(
      SignUpRequestSchema.safeParse({ ...valid, displayName: "x".repeat(41) })
        .success,
    ).toBe(false);
    expect(
      SignUpRequestSchema.safeParse({ ...valid, password: "x".repeat(73) })
        .success,
    ).toBe(false);
  });

  it("rejects a blank display name after trimming", () => {
    expect(
      UpdateProfileRequestSchema.safeParse({ displayName: "   " }).success,
    ).toBe(false);
  });

  it("requires a password to delete an account", () => {
    expect(DeleteAccountRequestSchema.safeParse({}).success).toBe(false);
    expect(
      DeleteAccountRequestSchema.safeParse({ password: "x" }).success,
    ).toBe(true);
  });

  it("validates profiles", () => {
    expect(
      ProfileSchema.safeParse({
        id: "11111111-1111-4111-8111-111111111111",
        email: "a@b.test",
        displayName: "A",
      }).success,
    ).toBe(true);
  });
});

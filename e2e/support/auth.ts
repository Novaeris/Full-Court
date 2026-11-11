import { createClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";

/**
 * Helpers for auth e2e tests against local Supabase (`supabase start`).
 * Emails are read from Mailpit, the local inbox Supabase runs on port 54324.
 */

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

export const PASSWORD = "correct horse battery";

/** A fresh address per test, so tests never share accounts. */
export function uniqueEmail(label: string): string {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `e2e-${label}-${id}@example.test`;
}

export function supabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Run `supabase start` and create apps/web/.env.local first.",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type MailSummary = { ID: string; Subject: string; Created: string };

/** Waits for an email to `to` whose subject contains `subject`; returns its link. */
export async function emailLink(to: string, subject: string): Promise<string> {
  let link: string | null = null;
  await expect
    .poll(
      async () => {
        const query = encodeURIComponent(`to:"${to}" subject:"${subject}"`);
        const res = await fetch(`${MAILPIT}/api/v1/search?query=${query}`);
        const { messages } = (await res.json()) as { messages: MailSummary[] };
        const newest = messages.sort((a, b) =>
          b.Created.localeCompare(a.Created),
        )[0];
        if (!newest) return null;
        const message = (await (
          await fetch(`${MAILPIT}/api/v1/message/${newest.ID}`)
        ).json()) as { HTML: string };
        const match = /href="([^"]*token_hash=[^"]*)"/.exec(message.HTML);
        link = match?.[1]?.replace(/&amp;/g, "&") ?? null;
        return link;
      },
      { message: `email "${subject}" to ${to}`, timeout: 15_000 },
    )
    .not.toBeNull();
  return link!;
}

/** Creates a confirmed account without going through the UI. */
export async function createConfirmedUser(
  label: string,
  displayName = "Test Coach",
): Promise<{ email: string; password: string }> {
  const email = uniqueEmail(label);
  const client = supabase();
  const { error } = await client.auth.signUp({
    email,
    password: PASSWORD,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: "http://localhost:3100/auth/confirm?next=%2Fleagues",
    },
  });
  if (error) throw error;
  const link = new URL(
    await emailLink(email, "Confirm your Full Court account"),
  );
  const { error: verifyError } = await client.auth.verifyOtp({
    type: "email",
    token_hash: link.searchParams.get("token_hash") ?? "",
  });
  if (verifyError) throw verifyError;
  return { email, password: PASSWORD };
}

/** Access token for API calls made the way mobile and desktop will make them. */
export async function accessToken(
  email: string,
  password: string,
): Promise<string> {
  const { data, error } = await supabase().auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.session) throw error ?? new Error("no session");
  return data.session.access_token;
}

export async function signInThroughUi(
  page: Page,
  email: string,
  password: string,
  next = "/leagues",
): Promise<void> {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new RegExp(`${next.replace(/[?]/g, "\\?")}$`));
}

export async function signOutThroughUi(page: Page): Promise<void> {
  await page.goto("/account");
  await page
    .getByRole("region", { name: "Sign out" })
    .getByRole("button", { name: "Sign out" })
    .click();
  await expect(page).toHaveURL(/\/$/);
}

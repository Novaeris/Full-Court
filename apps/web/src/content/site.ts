/**
 * Facts about who runs Full Court, shown on the legal and support pages.
 * These are the owner's confirmed answers (open alpha readiness, 2026-11-11).
 * Change them here only; every page reads from this file.
 */
export const SITE = {
  name: "Full Court",
  /** The individual developer who operates Full Court (not a registered company). */
  operator: "Novaeris",
  /** Public contact for support and privacy requests. */
  contactEmail: "novaerisfullcourt@gmail.com",
  /** Governing law for the Terms. */
  jurisdiction: "Ontario, Canada",
  minimumAge: 13,
} as const;

/** Where data is processed, for the Privacy Policy (docs/operations.md). */
export const SERVICE_PROVIDERS = [
  {
    name: "Supabase",
    purpose:
      "Database and sign-in. Stores your account, leagues, support requests and usage totals.",
    location: "United States (N. Virginia)",
  },
  {
    name: "Render",
    purpose: "Hosts the website and runs the game's servers.",
    location: "United States (Virginia)",
  },
  {
    name: "Resend",
    purpose:
      "Sends account emails (confirmation, password reset) and delivers support requests to our inbox.",
    location: "United States",
  },
  {
    name: "Google (Gmail)",
    purpose: "Hosts the support inbox that receives support requests.",
    location: "United States and other countries",
  },
] as const;

import { z } from "zod";
import { EmailSchema } from "./account";

/**
 * Contact & Support form. The database enforces the same limits
 * (supabase/migrations/*_alpha_readiness.sql); keep them in step.
 */
export const SUPPORT_CATEGORIES = [
  { value: "bug", label: "Bug report" },
  { value: "account", label: "Account problem" },
  { value: "gameplay", label: "Gameplay feedback" },
  { value: "feature", label: "Feature suggestion" },
  { value: "security", label: "Security concern" },
  { value: "general", label: "General question" },
] as const;

export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number]["value"];

export const SUPPORT_NAME_MAX = 80;
export const SUPPORT_SUBJECT_MAX = 120;
export const SUPPORT_MESSAGE_MAX = 5000;
const SUPPORT_MESSAGE_MIN = 10;
/** More links than this reads as spam, not a support request. */
const SUPPORT_MAX_LINKS = 5;

// Control characters (other than tab and line breaks in the message) never
// belong in these fields, and line breaks in a subject could forge email headers.
// eslint-disable-next-line no-control-regex
const SINGLE_LINE = /^[^\u0000-\u001f\u007f]*$/;
// eslint-disable-next-line no-control-regex
const MULTI_LINE = /^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]*$/;

/**
 * True when text looks like it contains a password or an access token. The
 * form never asks for either, and storing one in a support inbox would be
 * a security risk, so such messages are turned back before they are saved.
 */
export function looksLikeCredential(text: string): boolean {
  return [
    // "password: hunter2", "my password is hunter2"
    /\b(?:password|passwd|pwd)\s*(?:[:=]|is)\s*\S{4,}/i,
    // JSON Web Tokens (Supabase access tokens)
    /\beyJ[\w-]{8,}\.eyJ[\w-]{8,}\.[\w-]{8,}/,
    // "Bearer <token>" headers
    /\bbearer\s+[\w\-.~+/]{20,}/i,
    // Supabase secret keys
    /\bsb_secret_[\w-]{10,}/i,
    // Refresh tokens or session cookies pasted from dev tools
    /\b(?:refresh_token|access_token)\b\s*["':=]+\s*["']?[\w\-.]{16,}/i,
  ].some((pattern) => pattern.test(text));
}

const CREDENTIAL_MESSAGE =
  "Please remove any password or access token. We never need them to help you.";

export const SupportRequestSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter your name.")
    .max(SUPPORT_NAME_MAX, `Use at most ${SUPPORT_NAME_MAX} characters.`)
    .regex(SINGLE_LINE, "Use letters, numbers and punctuation only."),
  email: EmailSchema,
  category: z.enum(
    SUPPORT_CATEGORIES.map((c) => c.value) as [
      SupportCategory,
      ...SupportCategory[],
    ],
    { message: "Choose a category." },
  ),
  subject: z
    .string()
    .trim()
    .min(1, "Enter a subject.")
    .max(SUPPORT_SUBJECT_MAX, `Use at most ${SUPPORT_SUBJECT_MAX} characters.`)
    .regex(SINGLE_LINE, "Keep the subject to one line.")
    .refine((value) => !looksLikeCredential(value), CREDENTIAL_MESSAGE),
  message: z
    .string()
    .trim()
    .min(
      SUPPORT_MESSAGE_MIN,
      `Write at least ${SUPPORT_MESSAGE_MIN} characters.`,
    )
    .max(SUPPORT_MESSAGE_MAX, `Use at most ${SUPPORT_MESSAGE_MAX} characters.`)
    .regex(MULTI_LINE, "Remove unusual control characters.")
    .refine(
      (value) =>
        (value.match(/https?:\/\//gi) ?? []).length <= SUPPORT_MAX_LINKS,
      `Include at most ${SUPPORT_MAX_LINKS} links.`,
    )
    .refine((value) => !looksLikeCredential(value), CREDENTIAL_MESSAGE),
});
export type SupportRequest = z.infer<typeof SupportRequestSchema>;

// Analytics -------------------------------------------------------------------

/**
 * Aggregate usage events (docs/ARCHITECTURE.md, "Analytics"). Only counts are
 * stored: no user id, IP address or free text.
 */
export const ANALYTICS_EVENTS = [
  "page_view",
  "registration_started",
  "registration_completed",
  "league_created",
  "team_selected",
  "simulation_started",
] as const;
export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

/** Events a browser may report. The rest are recorded by the server itself. */
export const CLIENT_ANALYTICS_EVENTS = [
  "page_view",
  "registration_started",
] as const satisfies readonly AnalyticsEvent[];

/** POST /api/v1/events */
export const AnalyticsEventRequestSchema = z.object({
  event: z.enum(CLIENT_ANALYTICS_EVENTS),
  /** A pathname; the server reduces it to a route pattern before counting. */
  path: z.string().max(300).optional(),
});
export type AnalyticsEventRequest = z.infer<typeof AnalyticsEventRequestSchema>;

export const AnalyticsEventResponseSchema = z.object({
  recorded: z.boolean(),
});

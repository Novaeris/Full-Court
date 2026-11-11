import "server-only";
import type { FormState } from "@/components/forms/form";
import { ApiError } from "@/server/api/handler";

/** Helpers shared by the Server Actions behind every form. */

type Issues = {
  issues: readonly { path: readonly PropertyKey[]; message: string }[];
};

/** First message per field, keyed by field name. */
export function fieldErrors(error: Issues): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

/** Form state for input that failed schema validation. */
export function invalid(
  error: Issues,
  values?: Record<string, string>,
): FormState {
  return {
    status: "error",
    message: "Check the highlighted fields.",
    fieldErrors: fieldErrors(error),
    ...(values ? { values } : {}),
  };
}

/** A string field from a form submission ("" when missing). */
export function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

/** Message for a failed service call: expected errors verbatim, others generic. */
export function serviceMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  console.error(error);
  return "Something went wrong. Please try again.";
}

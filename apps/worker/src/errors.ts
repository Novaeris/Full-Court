/**
 * A readable message for anything thrown. Supabase errors are plain objects
 * with `message`, `code`, `details` and `hint`, not `Error` instances.
 */
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    const parts = ["code", "message", "details", "hint"]
      .map((key) => e[key])
      .filter((v): v is string => typeof v === "string" && v !== "");
    if (parts.length > 0) return parts.join(" | ");
    return JSON.stringify(error);
  }
  return String(error);
}

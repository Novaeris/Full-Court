import {
  HealthResponseSchema,
  type HealthResponse,
} from "@fullcourt/validation";

/** Short build identifier: Render's commit SHA in hosted environments, "dev" locally. */
export function buildVersion(): string {
  return process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? "dev";
}

/** The health payload, validated against the shared contract before it is sent. */
export function healthResponse(): HealthResponse {
  return HealthResponseSchema.parse({ status: "ok", version: buildVersion() });
}

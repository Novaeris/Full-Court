import { z } from "zod";

/** Every error response from /api/v1 uses this envelope. */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/** GET /api/v1/health */
export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  version: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export * from "./account";
export * from "./leagues";
export * from "./world";
export * from "./support";
export * from "./owner-mode";

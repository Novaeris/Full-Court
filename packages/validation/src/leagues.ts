import { z } from "zod";

/**
 * League (save slot) rules shared by every client and the server. The
 * database enforces the same limits (supabase/migrations/*_leagues.sql).
 */
export const LEAGUE_NAME_MAX = 40;
export const LEAGUE_LIMIT = 5;

export const LeagueNameSchema = z
  .string()
  .trim()
  .min(1, "Give your league a name.")
  .max(LEAGUE_NAME_MAX, `Use at most ${LEAGUE_NAME_MAX} characters.`);

export const LeagueIdSchema = z.uuid("That league id isn't valid.");

export const LeagueStatusSchema = z.enum(["setup", "active", "archived"]);
export type LeagueStatus = z.infer<typeof LeagueStatusSchema>;

export const LeagueSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  status: LeagueStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type League = z.infer<typeof LeagueSchema>;

/** GET /api/v1/leagues */
export const LeagueListSchema = z.object({
  leagues: z.array(LeagueSchema),
  limit: z.number().int().positive(),
});
export type LeagueList = z.infer<typeof LeagueListSchema>;

/** POST /api/v1/leagues */
export const CreateLeagueRequestSchema = z.object({ name: LeagueNameSchema });
export type CreateLeagueRequest = z.infer<typeof CreateLeagueRequestSchema>;

/** PATCH /api/v1/leagues/:id */
export const RenameLeagueRequestSchema = z.object({ name: LeagueNameSchema });
export type RenameLeagueRequest = z.infer<typeof RenameLeagueRequestSchema>;

/** DELETE /api/v1/leagues/:id */
export const DeleteLeagueResponseSchema = z.object({
  deleted: z.literal(true),
});

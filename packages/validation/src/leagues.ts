import { LEAGUE_SIZES } from "@fullcourt/game-types";
import { z } from "zod";
import { OwnerSetupRequestSchema } from "./owner-mode";

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

/** Sizes a request can ask for: the original layouts. */
export const LeagueSizeSchema = z.enum(LEAGUE_SIZES);
/** Sizes a stored league can have: the original ones, and Owner Mode's custom. */
export const StoredLeagueSizeSchema = z.enum([...LEAGUE_SIZES, "custom"]);

export const LeagueSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  status: LeagueStatusSchema,
  size: StoredLeagueSizeSchema,
  /** The player's own team, once chosen. */
  userTeamId: z.uuid().nullable(),
  /** How many local players share this league; 0 until a team is chosen in a league made the original way. */
  localPlayerCount: z.number().int().min(0),
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
export const CreateLeagueRequestSchema = z.object({
  name: LeagueNameSchema,
  size: LeagueSizeSchema.default("standard"),
  /**
   * Owner Mode settings. Without them the request creates a league of the
   * given size the original way (fictional cities, choose a team afterwards).
   */
  setup: OwnerSetupRequestSchema.optional(),
});
/** What clients send (size is optional and defaults to "standard"). */
export type CreateLeagueRequest = z.input<typeof CreateLeagueRequestSchema>;
/** What the server works with after validation. */
export type CreateLeagueInput = z.output<typeof CreateLeagueRequestSchema>;

/** PATCH /api/v1/leagues/:id */
export const RenameLeagueRequestSchema = z.object({ name: LeagueNameSchema });
export type RenameLeagueRequest = z.infer<typeof RenameLeagueRequestSchema>;

/** DELETE /api/v1/leagues/:id */
export const DeleteLeagueResponseSchema = z.object({
  deleted: z.literal(true),
});

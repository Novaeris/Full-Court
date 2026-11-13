import { SCHEDULE_PRESETS, SEASON_PHASES } from "@fullcourt/game-types";
import { z } from "zod";

/** Simulating time: the request, the queue row and the season it moves. */

export const SIM_KINDS = ["day", "week", "season"] as const;
export const SimKindSchema = z.enum(SIM_KINDS);
export type SimKind = z.infer<typeof SimKindSchema>;

/** POST /api/v1/leagues/:leagueId/sim */
export const StartSimulationRequestSchema = z.object({ kind: SimKindSchema });
export type StartSimulationRequest = z.infer<
  typeof StartSimulationRequestSchema
>;

export const SIM_JOB_STATUSES = [
  "queued",
  "running",
  "done",
  "failed",
  "cancelled",
] as const;

export const SimJobSchema = z.object({
  id: z.uuid(),
  kind: SimKindSchema,
  status: z.enum(SIM_JOB_STATUSES),
  daysRequested: z.number().int().min(1),
  daysDone: z.number().int().min(0),
  /** Why a failed job failed; null otherwise. */
  error: z.string().nullable(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});
export type SimJob = z.infer<typeof SimJobSchema>;

export const SeasonSchema = z.object({
  id: z.uuid(),
  year: z.number().int(),
  phase: z.enum(SEASON_PHASES),
  /** The next game day to simulate, from 1. */
  day: z.number().int().min(1),
  /** The last regular-season game day. */
  lastDay: z.number().int().min(1),
  schedulePreset: z.enum(SCHEDULE_PRESETS),
  /** The playoff winner, once the final is decided. */
  championTeamId: z.uuid().nullable(),
});
export type Season = z.infer<typeof SeasonSchema>;

/**
 * GET /api/v1/leagues/:leagueId/sim: where the league is and what the
 * simulation is doing. `season` is null before the first one is created;
 * `job` is the most recent one, if any.
 */
export const SimulationStatusSchema = z.object({
  season: SeasonSchema.nullable(),
  job: SimJobSchema.nullable(),
});
export type SimulationStatus = z.infer<typeof SimulationStatusSchema>;

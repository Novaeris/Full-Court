import { POSITIONS, RATING_KEYS } from "@fullcourt/game-types";
import { z } from "zod";

/** Teams, players and team selection, as the API returns them. */

const rating = z.number().int().min(25).max(99);

export const RatingsSchema = z.object(
  Object.fromEntries(RATING_KEYS.map((key) => [key, rating])) as Record<
    (typeof RATING_KEYS)[number],
    typeof rating
  >,
);

export const TeamSchema = z.object({
  id: z.uuid(),
  abbreviation: z.string(),
  city: z.string(),
  nickname: z.string(),
  /** Stable ids; display names may change, ids never do. */
  conferenceId: z.string(),
  divisionId: z.string(),
  /** Display names. */
  conference: z.string(),
  division: z.string(),
  primaryColor: z.string(),
  secondaryColor: z.string(),
  /** Average overall of the eight best players: a quick strength guide. */
  strength: z.number().int(),
});
export type Team = z.infer<typeof TeamSchema>;

export const PlayerSchema = z.object({
  id: z.uuid(),
  teamId: z.uuid().nullable(),
  firstName: z.string(),
  lastName: z.string(),
  position: z.enum(POSITIONS),
  age: z.number().int(),
  heightInches: z.number().int(),
  weightPounds: z.number().int(),
  jersey: z.number().int(),
  overall: rating,
  potential: rating,
  ratings: RatingsSchema,
});
export type Player = z.infer<typeof PlayerSchema>;

/** GET /api/v1/leagues/:leagueId/teams */
export const TeamListSchema = z.object({ teams: z.array(TeamSchema) });

/** GET /api/v1/leagues/:leagueId/teams/:teamId */
export const TeamDetailSchema = z.object({
  team: TeamSchema,
  players: z.array(PlayerSchema),
});
export type TeamDetail = z.infer<typeof TeamDetailSchema>;

/** POST /api/v1/leagues/:leagueId/team */
export const ChooseTeamRequestSchema = z.object({
  teamId: z.uuid("Choose a team."),
});
export type ChooseTeamRequest = z.infer<typeof ChooseTeamRequestSchema>;

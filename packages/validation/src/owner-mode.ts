import {
  AI_ASSIST_KEYS,
  LEAGUE_CONFIG_SCHEMA_VERSION,
  LEAGUE_PRESETS,
  MAX_LEAGUE_TEAMS,
  MAX_LOCAL_PLAYERS,
  NO_AI_ASSIST,
  PLAYOFF_SEEDINGS,
  REGIONS,
  SERIES_LENGTHS,
  type AiAssistFlags,
} from "@fullcourt/game-types";
import { z } from "zod";

/**
 * Shape checks for Owner Mode settings. Cross-field rules (bracket sizes,
 * division-leader spots, one franchise per city…) live in
 * @fullcourt/game-rules, which callers run after parsing.
 */

const SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/;
const COLOR = /^#[0-9a-f]{6}$/;

export const RegionSchema = z.enum(REGIONS);
export const LeaguePresetSchema = z.enum(LEAGUE_PRESETS);

export const IdSchema = z
  .string()
  .regex(SLUG, "Use lowercase letters, numbers and dashes.");
const NameSchema = z.string().trim().min(1).max(40);

export const LeagueStructureSchema = z.object({
  conferences: z
    .array(
      z.object({
        id: IdSchema,
        name: NameSchema,
        divisions: z
          .array(
            z.object({
              id: IdSchema,
              name: NameSchema,
              teamCount: z.number().int().min(1).max(MAX_LEAGUE_TEAMS),
            }),
          )
          .min(1)
          .max(MAX_LEAGUE_TEAMS),
      }),
    )
    .min(1)
    .max(MAX_LEAGUE_TEAMS),
});

export type LeagueStructure = z.infer<typeof LeagueStructureSchema>;

const seriesLength = z.union(
  SERIES_LENGTHS.map((n) => z.literal(n)) as unknown as [
    z.ZodLiteral<3>,
    z.ZodLiteral<5>,
    z.ZodLiteral<7>,
  ],
);

export const PlayoffConfigSchema = z.object({
  teams: z.number().int().min(2).max(MAX_LEAGUE_TEAMS),
  seeding: z.enum(PLAYOFF_SEEDINGS),
  autoQualifyDivisionLeaders: z.boolean(),
  divisionLeaderTopSeeds: z
    .number()
    .int()
    .min(1)
    .max(MAX_LEAGUE_TEAMS)
    .nullable(),
  roundSeriesLengths: z.array(seriesLength).min(1).max(5),
});

/** One version of the stored config. Add a branch when the version changes. */
const LeagueConfigV1Schema = z.object({
  schemaVersion: z.literal(LEAGUE_CONFIG_SCHEMA_VERSION),
  preset: LeaguePresetSchema,
  region: RegionSchema,
  fantasyDraft: z.boolean(),
  playoffs: PlayoffConfigSchema,
});

export const LeagueConfigSchema = z.discriminatedUnion("schemaVersion", [
  LeagueConfigV1Schema,
]);

export const AiAssistSchema = z.object(
  Object.fromEntries(AI_ASSIST_KEYS.map((key) => [key, z.boolean()])) as Record<
    keyof AiAssistFlags,
    z.ZodBoolean
  >,
);

export const LocalPlayerSchema = z.object({
  slot: z.number().int().min(1).max(MAX_LOCAL_PLAYERS),
  label: z.string().trim().min(1).max(24).nullable(),
});

export const FranchiseSchema = z.object({
  cityId: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)+$/, "Choose a city."),
  nickname: NameSchema,
  primaryColor: z.string().regex(COLOR, "Use a colour like #1a2b3c."),
  secondaryColor: z.string().regex(COLOR, "Use a colour like #1a2b3c."),
  logoId: z.string().regex(/^logo-\d{2,3}$/, "Choose a logo."),
  conferenceId: IdSchema,
  divisionId: IdSchema,
  localPlayerSlot: z.number().int().min(1).max(MAX_LOCAL_PLAYERS).nullable(),
  aiAssist: AiAssistSchema,
});

/**
 * Everything the owner chooses before generation. Not wired into league
 * creation yet; the existing `{ name, size }` request is unchanged.
 */
export const OwnerModeSetupSchema = z.object({
  config: LeagueConfigSchema,
  structure: LeagueStructureSchema,
  localPlayers: z.array(LocalPlayerSchema).min(1).max(MAX_LOCAL_PLAYERS),
  franchises: z.array(FranchiseSchema).max(MAX_LEAGUE_TEAMS),
});
export type OwnerModeSetupInput = z.input<typeof OwnerModeSetupSchema>;

/** Sizes of the equal divisions wanted; ids and names are generated. */
export const SetupShapeSchema = z.object({
  conferences: z.number().int().min(1).max(4),
  divisionsPerConference: z.number().int().min(1).max(MAX_LEAGUE_TEAMS),
  teamsPerDivision: z.number().int().min(1).max(MAX_LEAGUE_TEAMS),
});

/** A franchise the owner customised; anything left out is generated. */
export const FranchiseRequestSchema = z.object({
  localPlayerSlot: z.number().int().min(1).max(MAX_LOCAL_PLAYERS),
  cityId: FranchiseSchema.shape.cityId,
  nickname: NameSchema.optional(),
  primaryColor: FranchiseSchema.shape.primaryColor.optional(),
  secondaryColor: FranchiseSchema.shape.secondaryColor.optional(),
  logoId: FranchiseSchema.shape.logoId.optional(),
  aiAssist: AiAssistSchema.default(() => ({ ...NO_AI_ASSIST })),
});

/** Seeds the generated franchises, so a preview matches what is created. */
export const IdentitySeedSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,64}$/, "That seed isn't valid.");

/**
 * The Owner Mode part of POST /api/v1/leagues. The server generates the
 * structure, the other franchises and every roster, then re-checks all rules.
 */
export const OwnerSetupRequestSchema = z.object({
  config: LeagueConfigSchema,
  shape: SetupShapeSchema,
  localPlayers: z.array(LocalPlayerSchema).min(1).max(MAX_LOCAL_PLAYERS),
  franchises: z.array(FranchiseRequestSchema).min(1).max(MAX_LEAGUE_TEAMS),
  identitySeed: IdentitySeedSchema,
});
export type OwnerSetupRequest = z.input<typeof OwnerSetupRequestSchema>;
export type OwnerSetupInput = z.output<typeof OwnerSetupRequestSchema>;

/** A conference or division name as typed by the owner. */
export const StructureNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a name.")
  .max(40, "Use at most 40 characters.");

/** PATCH /api/v1/leagues/:leagueId/structure: rename, never re-id. */
export const RenameStructureRequestSchema = z.object({
  conferences: z
    .array(z.object({ id: IdSchema, name: StructureNameSchema }))
    .max(MAX_LEAGUE_TEAMS),
  divisions: z
    .array(z.object({ id: IdSchema, name: StructureNameSchema }))
    .max(MAX_LEAGUE_TEAMS),
});
export type RenameStructureRequest = z.infer<
  typeof RenameStructureRequestSchema
>;

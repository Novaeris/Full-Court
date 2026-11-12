import {
  LEAGUE_CONFIG_SCHEMA_VERSION,
  type FranchiseSpec,
  type LeagueConfig,
  type LeagueStructure,
  type LocalPlayerSpec,
  type PlayoffConfig,
} from "@fullcourt/game-types";
import { validateFranchises, validateLocalPlayers } from "./franchises";
import { validatePlayoffConfig, defaultPlayoffConfig } from "./playoffs";
import {
  equalStructure,
  isStandardStructure,
  STANDARD_SHAPE,
  validateSupportedStructure,
  type RuleIssue,
} from "./structure";

/** Everything the owner chooses before a league is generated. */
export type OwnerModeSetup = {
  config: LeagueConfig;
  structure: LeagueStructure;
  localPlayers: LocalPlayerSpec[];
  /** The human-controlled franchises; the rest are generated. */
  franchises: FranchiseSpec[];
};

/** All rules for a new league, in the order a form would show them. */
export function validateOwnerModeSetup(setup: OwnerModeSetup): RuleIssue[] {
  const { config, structure, localPlayers, franchises } = setup;
  const issues: RuleIssue[] = [];

  if (config.schemaVersion !== LEAGUE_CONFIG_SCHEMA_VERSION) {
    issues.push({
      code: "config_version",
      message: `Unsupported settings version ${config.schemaVersion}.`,
    });
  }
  const structural = validateSupportedStructure(structure);
  issues.push(...structural);
  if (structural.length > 0) return issues;

  if (config.preset === "standard" && !isStandardStructure(structure)) {
    issues.push({
      code: "standard_shape",
      message: `A standard league has ${STANDARD_SHAPE.conferences} conferences of ${STANDARD_SHAPE.divisionsPerConference} divisions with ${STANDARD_SHAPE.teamsPerDivision} teams each.`,
    });
  }
  issues.push(...validatePlayoffConfig(structure, config.playoffs));
  issues.push(...validateLocalPlayers(localPlayers));
  issues.push(...validateFranchises(structure, localPlayers, franchises));
  return issues;
}

/** The standard league's structure with neutral ids and names. */
export function standardStructure(): LeagueStructure {
  return equalStructure(
    STANDARD_SHAPE.conferences,
    STANDARD_SHAPE.divisionsPerConference,
    STANDARD_SHAPE.teamsPerDivision,
  );
}

/** Settings shown for a league created before Owner Mode. Never stored. */
export type LegacySettings = {
  legacy: true;
  preset: "standard" | "custom";
  region: null;
  fantasyDraft: false;
  playoffs: PlayoffConfig;
};

/**
 * Legacy leagues have no stored config. This derives what to display from
 * the league's size so nothing has to be written back to old saves.
 */
export function legacySettings(size: "standard" | "compact"): LegacySettings {
  const structure =
    size === "standard" ? standardStructure() : equalStructure(2, 2, 3);
  return {
    legacy: true,
    preset: size === "standard" ? "standard" : "custom",
    region: null,
    fantasyDraft: false,
    playoffs: defaultPlayoffConfig(structure),
  };
}

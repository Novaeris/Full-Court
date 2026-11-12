import {
  AI_ASSIST_KEYS,
  LOGO_IDS,
  MAX_LOCAL_PLAYERS,
  type FranchiseSpec,
  type LeagueStructure,
  type LocalPlayerSpec,
} from "@fullcourt/game-types";
import { NAME_MAX, totalTeams, type RuleIssue } from "./structure";

export const COLOR_PATTERN = /^#[0-9a-f]{6}$/;
export const LOGO_ID_PATTERN = /^logo-\d{2,3}$/;
export const CITY_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)+$/;
export const LOCAL_PLAYER_LABEL_MAX = 24;

/** Names compare without case or surrounding spaces. */
export function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Local players: 1 to MAX_LOCAL_PLAYERS, numbered 1…n with no gaps. How many
 * franchises each controls is checked in validateFranchises, since a player
 * may run several.
 */
export function validateLocalPlayers(
  players: readonly LocalPlayerSpec[],
): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const add = (code: string, message: string) => issues.push({ code, message });

  if (players.length < 1 || players.length > MAX_LOCAL_PLAYERS) {
    add(
      "local_player_count",
      `Choose between 1 and ${MAX_LOCAL_PLAYERS} local players.`,
    );
  }
  players.forEach((player, i) => {
    if (player.slot !== i + 1) {
      add(
        "local_player_slots",
        "Local players are numbered 1, 2, 3… in order.",
      );
    }
    if (
      player.label !== null &&
      (player.label.trim().length < 1 ||
        player.label.length > LOCAL_PLAYER_LABEL_MAX)
    ) {
      add(
        "local_player_label",
        `A player name has 1 to ${LOCAL_PLAYER_LABEL_MAX} characters.`,
      );
    }
  });
  return issues;
}

/**
 * The franchises the owner customised (human-controlled ones). Checks
 * identity, placement, control and AI Assist. Whether a city belongs to the
 * league's region is checked where the city catalogue is available.
 */
export function validateFranchises(
  structure: LeagueStructure,
  players: readonly LocalPlayerSpec[],
  franchises: readonly FranchiseSpec[],
): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const add = (code: string, message: string) => issues.push({ code, message });

  const divisions = new Map<
    string,
    { conferenceId: string; teamCount: number }
  >();
  for (const c of structure.conferences) {
    for (const d of c.divisions) {
      divisions.set(d.id, { conferenceId: c.id, teamCount: d.teamCount });
    }
  }

  if (franchises.length > totalTeams(structure)) {
    add("too_many_franchises", "There are more franchises than teams.");
  }
  if (franchises.length < players.length) {
    add(
      "franchises_per_player",
      "Every local player needs at least one franchise.",
    );
  }

  const cities = new Set<string>();
  const nicknames = new Set<string>();
  const inDivision = new Map<string, number>();
  const controlled = new Set<number>();

  for (const f of franchises) {
    if (!CITY_ID_PATTERN.test(f.cityId)) {
      add("invalid_city", `"${f.cityId}" isn't a valid city.`);
    } else if (cities.has(f.cityId)) {
      add("duplicate_city", "Two franchises can't share a city.");
    }
    cities.add(f.cityId);

    const nickname = f.nickname.trim();
    if (nickname.length < 1 || nickname.length > NAME_MAX) {
      add("invalid_nickname", `A team name has 1 to ${NAME_MAX} characters.`);
    } else if (nicknames.has(nameKey(nickname))) {
      add("duplicate_nickname", "Two franchises can't share a team name.");
    }
    nicknames.add(nameKey(nickname));
    if (!COLOR_PATTERN.test(f.primaryColor)) {
      add("invalid_color", "Primary colour must look like #1a2b3c.");
    }
    if (!COLOR_PATTERN.test(f.secondaryColor)) {
      add("invalid_color", "Secondary colour must look like #1a2b3c.");
    }
    if (!LOGO_IDS.includes(f.logoId)) {
      add("invalid_logo", `"${f.logoId}" isn't a built-in logo.`);
    }
    if (
      COLOR_PATTERN.test(f.primaryColor) &&
      f.primaryColor === f.secondaryColor
    ) {
      add("same_colors", "Pick two different colours.");
    }

    const division = divisions.get(f.divisionId);
    if (!division || division.conferenceId !== f.conferenceId) {
      add(
        "unknown_division",
        "A franchise sits in a division that isn't in the league.",
      );
    } else {
      const n = (inDivision.get(f.divisionId) ?? 0) + 1;
      inDivision.set(f.divisionId, n);
      if (n > division.teamCount) {
        add("division_full", "More franchises than places in a division.");
      }
    }

    if (f.localPlayerSlot === null) {
      add(
        "franchise_needs_player",
        "Customised franchises are controlled by a local player.",
      );
      if (AI_ASSIST_KEYS.some((key) => f.aiAssist[key])) {
        add("ai_assist_needs_player", "AI Assist needs a local player.");
      }
    } else if (!players.some((p) => p.slot === f.localPlayerSlot)) {
      add(
        "unknown_player",
        "A franchise belongs to a player who doesn't exist.",
      );
    } else {
      controlled.add(f.localPlayerSlot);
    }
  }

  if (players.some((p) => !controlled.has(p.slot))) {
    add(
      "franchises_per_player",
      "Every local player needs at least one franchise.",
    );
  }
  return dedupe(issues);
}

function dedupe(issues: RuleIssue[]): RuleIssue[] {
  const seen = new Set<string>();
  return issues.filter((i) => {
    const key = `${i.code}:${i.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

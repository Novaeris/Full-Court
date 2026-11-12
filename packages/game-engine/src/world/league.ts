import { invariant } from "@fullcourt/shared";
import {
  LOGO_IDS,
  NO_AI_ASSIST,
  type AiAssistFlags,
  type CityId,
  type ConferenceId,
  type DivisionId,
  type LeagueStructure,
  type LocalPlayerSpec,
  type LogoId,
  type PlayerSeed,
  type Region,
} from "@fullcourt/game-types";
import { totalTeams } from "@fullcourt/game-rules";
import { shuffle } from "../rng/helpers";
import { createRng, seedState, type RngState } from "../rng/rng";
import { findCity } from "./cities";
import { generateRosters, abbreviate } from "./generate";
import { assignGeography, selectCities } from "./geography";
import { EXTRA_TEAM_COLORS, NICKNAMES, TEAM_COLORS } from "./names";

/** A franchise the owner chose; anything left out is generated. */
export type OwnerFranchiseInput = {
  localPlayerSlot: number;
  cityId: CityId;
  nickname?: string;
  primaryColor?: string;
  secondaryColor?: string;
  logoId?: LogoId;
  aiAssist?: AiAssistFlags;
};

export type OwnerWorldOptions = {
  /** Seeds the rosters. Chosen by the server, never by a client. */
  seed: string;
  /**
   * Seeds cities, names, colours and logos for the AI franchises, so a
   * client can preview exactly what the server will create.
   */
  identitySeed: string;
  region: Region;
  /** Sizes of the divisions wanted; ids and names are generated. */
  shape: LeagueStructure;
  localPlayers: readonly LocalPlayerSpec[];
  franchises: readonly OwnerFranchiseInput[];
};

export type OwnerTeamSeed = {
  abbreviation: string;
  city: string;
  nickname: string;
  conferenceId: ConferenceId;
  divisionId: DivisionId;
  cityId: CityId;
  logoId: LogoId;
  /** #rrggbb */
  primaryColor: string;
  /** #rrggbb */
  secondaryColor: string;
  /** The local player running the team, or null for the AI. */
  localPlayerSlot: number | null;
  aiAssist: AiAssistFlags;
};

export type GeneratedOwnerWorld = {
  /** Conferences and divisions with generated ids and names, in geographic order. */
  structure: LeagueStructure;
  localPlayers: LocalPlayerSpec[];
  teams: OwnerTeamSeed[];
  players: PlayerSeed[];
  /** RNG state after generating rosters; simulation continues from here. */
  rngState: RngState;
};

/**
 * Generates a whole Owner Mode league: real cities placed into geographic
 * divisions, a franchise identity for every team, and full rosters. The
 * owner's franchises keep what they chose; the rest are generated. Pure and
 * deterministic for a given set of options.
 */
export function generateOwnerWorld(
  options: OwnerWorldOptions,
): GeneratedOwnerWorld {
  const { region, franchises } = options;
  const total = totalTeams(options.shape);
  invariant(franchises.length <= total, "more franchises than teams");
  for (const f of franchises) {
    invariant(
      findCity(f.cityId)?.region === region,
      `${f.cityId} isn't in ${region}`,
    );
  }

  const identity = createRng(seedState(`identity:${options.identitySeed}`));
  const cityIds = selectCities(
    identity,
    region,
    total,
    franchises.map((f) => f.cityId),
  );
  const geography = assignGeography(region, cityIds, options.shape);

  // Teams in league order: conference, division, then city name.
  const divisionOrder = new Map<DivisionId, number>();
  geography.structure.conferences.forEach((c, ci) =>
    c.divisions.forEach((d, di) => divisionOrder.set(d.id, ci * 100 + di)),
  );
  const ordered = cityIds
    .map((id) => findCity(id) as NonNullable<ReturnType<typeof findCity>>)
    .sort(
      (a, b) =>
        (divisionOrder.get(geography.placements[a.id]?.divisionId ?? "") ?? 0) -
          (divisionOrder.get(geography.placements[b.id]?.divisionId ?? "") ??
            0) || a.name.localeCompare(b.name),
    );

  const chosen = new Map(franchises.map((f) => [f.cityId, f]));
  const takenNicknames = new Set(
    franchises.flatMap((f) => (f.nickname ? [f.nickname.toLowerCase()] : [])),
  );
  const nicknames = shuffle(
    identity,
    NICKNAMES.filter((n) => !takenNicknames.has(n.toLowerCase())),
  );
  const colors = shuffle(identity, [...TEAM_COLORS, ...EXTRA_TEAM_COLORS]);
  const logos = shuffle(identity, LOGO_IDS);
  invariant(total <= nicknames.length, "not enough nicknames");
  invariant(total <= colors.length, "not enough colour pairs");

  const usedAbbreviations = new Set<string>();
  const teams: OwnerTeamSeed[] = ordered.map((city, i) => {
    const mine = chosen.get(city.id);
    const placement = geography.placements[city.id] as {
      conferenceId: ConferenceId;
      divisionId: DivisionId;
    };
    const abbreviation =
      abbreviate(city.name).find((option) => !usedAbbreviations.has(option)) ??
      `T${String(i).padStart(2, "0")}`;
    usedAbbreviations.add(abbreviation);
    const [primary, secondary] = colors[i] as readonly [string, string];
    return {
      abbreviation,
      city: city.name,
      nickname: mine?.nickname ?? (nicknames[i] as string),
      conferenceId: placement.conferenceId,
      divisionId: placement.divisionId,
      cityId: city.id,
      logoId: mine?.logoId ?? (logos[i % logos.length] as LogoId),
      primaryColor: mine?.primaryColor ?? primary,
      secondaryColor: mine?.secondaryColor ?? secondary,
      localPlayerSlot: mine?.localPlayerSlot ?? null,
      aiAssist: mine?.aiAssist ? { ...mine.aiAssist } : { ...NO_AI_ASSIST },
    };
  });

  const rng = createRng(seedState(options.seed));
  const players = generateRosters(rng, teams);
  return {
    structure: geography.structure,
    localPlayers: options.localPlayers.map((p) => ({ ...p })),
    teams,
    players,
    rngState: rng.state(),
  };
}

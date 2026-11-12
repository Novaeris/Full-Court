import { NO_AI_ASSIST } from "@fullcourt/game-types";
import { describe, expect, it } from "vitest";
import {
  FranchiseSchema,
  LeagueConfigSchema,
  LeagueStructureSchema,
  OwnerModeSetupSchema,
  OwnerSetupRequestSchema,
} from "./owner-mode";
import { CreateLeagueRequestSchema } from "./leagues";

const config = {
  schemaVersion: 1,
  preset: "standard",
  region: "europe",
  fantasyDraft: true,
  playoffs: {
    teams: 16,
    seeding: "conference",
    autoQualifyDivisionLeaders: true,
    divisionLeaderTopSeeds: 4,
    roundSeriesLengths: [7, 7, 7, 7],
  },
};

describe("LeagueConfigSchema", () => {
  it("accepts a version 1 config", () => {
    expect(LeagueConfigSchema.safeParse(config).success).toBe(true);
  });

  it("rejects legacy empty configs, unknown versions and bad values", () => {
    expect(LeagueConfigSchema.safeParse({}).success).toBe(false);
    expect(
      LeagueConfigSchema.safeParse({ ...config, schemaVersion: 2 }).success,
    ).toBe(false);
    expect(
      LeagueConfigSchema.safeParse({ ...config, region: "mars" }).success,
    ).toBe(false);
    expect(
      LeagueConfigSchema.safeParse({
        ...config,
        playoffs: { ...config.playoffs, roundSeriesLengths: [4] },
      }).success,
    ).toBe(false);
  });
});

describe("LeagueStructureSchema", () => {
  const structure = {
    conferences: [
      {
        id: "c-east",
        name: "Eastern",
        divisions: [{ id: "d-atlantic", name: "Atlantic", teamCount: 5 }],
      },
    ],
  };
  it("takes stable ids separate from display names", () => {
    expect(LeagueStructureSchema.safeParse(structure).success).toBe(true);
    const bad = structuredClone(structure);
    if (bad.conferences[0]) bad.conferences[0].id = "Eastern Conference";
    expect(LeagueStructureSchema.safeParse(bad).success).toBe(false);
  });
});

describe("FranchiseSchema", () => {
  const franchise = {
    cityId: "eu-fr-par",
    nickname: "Comets",
    primaryColor: "#112233",
    secondaryColor: "#ffcc00",
    logoId: "logo-01",
    conferenceId: "c-east",
    divisionId: "d-atlantic",
    localPlayerSlot: 1,
    aiAssist: NO_AI_ASSIST,
  };
  it("accepts a franchise and rejects bad colours, logos and slots", () => {
    expect(FranchiseSchema.safeParse(franchise).success).toBe(true);
    expect(
      FranchiseSchema.safeParse({ ...franchise, primaryColor: "red" }).success,
    ).toBe(false);
    expect(
      FranchiseSchema.safeParse({ ...franchise, logoId: "star" }).success,
    ).toBe(false);
    expect(
      FranchiseSchema.safeParse({ ...franchise, localPlayerSlot: 9 }).success,
    ).toBe(false);
    expect(
      FranchiseSchema.safeParse({ ...franchise, aiAssist: { trades: true } })
        .success,
    ).toBe(false);
  });

  it("builds a full setup", () => {
    const setup = {
      config,
      structure: {
        conferences: [
          {
            id: "c-east",
            name: "Eastern",
            divisions: [{ id: "d-atlantic", name: "Atlantic", teamCount: 5 }],
          },
        ],
      },
      localPlayers: [{ slot: 1, label: null }],
      franchises: [franchise],
    };
    expect(OwnerModeSetupSchema.safeParse(setup).success).toBe(true);
    expect(
      OwnerModeSetupSchema.safeParse({ ...setup, localPlayers: [] }).success,
    ).toBe(false);
  });
});

describe("OwnerSetupRequestSchema", () => {
  const request = {
    config,
    shape: { conferences: 2, divisionsPerConference: 3, teamsPerDivision: 5 },
    localPlayers: [{ slot: 1, label: null }],
    franchises: [{ localPlayerSlot: 1, cityId: "eu-fr-paris" }],
    identitySeed: "abcdefgh12345678",
  };

  it("accepts a request and turns AI Assist off by default", () => {
    const parsed = OwnerSetupRequestSchema.parse(request);
    expect(parsed.franchises[0]?.aiAssist).toEqual(NO_AI_ASSIST);
  });

  it("rejects bad seeds, shapes, players and franchises", () => {
    const bad = (patch: object) =>
      OwnerSetupRequestSchema.safeParse({ ...request, ...patch }).success;
    expect(bad({})).toBe(true);
    expect(bad({ identitySeed: "short" })).toBe(false);
    expect(bad({ identitySeed: "has spaces in it!" })).toBe(false);
    expect(
      bad({
        shape: {
          conferences: 9,
          divisionsPerConference: 1,
          teamsPerDivision: 2,
        },
      }),
    ).toBe(false);
    expect(bad({ localPlayers: [] })).toBe(false);
    expect(bad({ franchises: [] })).toBe(false);
    expect(
      bad({ franchises: [{ localPlayerSlot: 9, cityId: "eu-fr-paris" }] }),
    ).toBe(false);
    expect(bad({ franchises: [{ localPlayerSlot: 1, cityId: "Paris" }] })).toBe(
      false,
    );
  });

  it("is optional on a create-league request, which stays valid without it", () => {
    expect(
      CreateLeagueRequestSchema.parse({ name: "Plain" }).setup,
    ).toBeUndefined();
    expect(
      CreateLeagueRequestSchema.safeParse({ name: "Owner", setup: request })
        .success,
    ).toBe(true);
    expect(
      CreateLeagueRequestSchema.safeParse({
        name: "Owner",
        setup: { ...request, identitySeed: "x" },
      }).success,
    ).toBe(false);
  });
});

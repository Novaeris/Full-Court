import {
  NO_AI_ASSIST,
  type FranchiseSpec,
  type LeagueConfig,
  type PlayoffConfig,
} from "@fullcourt/game-types";
import { describe, expect, it } from "vitest";
import {
  canSeedByConference,
  defaultPlayoffConfig,
  defaultPlayoffTeams,
  equalStructure,
  isStandardStructure,
  legacySettings,
  playoffRounds,
  seedPlayoffTeams,
  standardStructure,
  supportedShapes,
  supportedTeamCounts,
  totalTeams,
  validateFranchises,
  validateLocalPlayers,
  validateOwnerModeSetup,
  validatePlayoffConfig,
  validateStructureIntegrity,
  validateSupportedStructure,
  type StandingEntry,
} from "../index";

const codes = (issues: { code: string }[]) => issues.map((i) => i.code);
const standard = standardStructure();

describe("structure", () => {
  it("builds the standard 30-team league", () => {
    expect(totalTeams(standard)).toBe(30);
    expect(isStandardStructure(standard)).toBe(true);
    expect(isStandardStructure(equalStructure(2, 2, 3))).toBe(false);
    expect(validateSupportedStructure(standard)).toEqual([]);
  });

  it("accepts the compact preset shape and the 32-team maximum", () => {
    expect(validateSupportedStructure(equalStructure(2, 2, 3))).toEqual([]);
    expect(validateSupportedStructure(equalStructure(4, 4, 2))).toEqual([]);
  });

  it("keeps unequal divisions representable but unsupported for now", () => {
    const unequal = equalStructure(2, 2, 4);
    const first = unequal.conferences[0]?.divisions[0];
    if (first) first.teamCount = 3;
    expect(validateStructureIntegrity(unequal)).toEqual([]);
    expect(codes(validateSupportedStructure(unequal))).toContain(
      "unequal_divisions",
    );
  });

  it("rejects incoherent structures at the integrity level", () => {
    expect(codes(validateStructureIntegrity({ conferences: [] }))).toContain(
      "no_conferences",
    );
    const big = equalStructure(2, 3, 6); // 36
    expect(codes(validateStructureIntegrity(big))).toContain("team_count");

    const dup = equalStructure(1, 2, 4);
    const second = dup.conferences[0]?.divisions[1];
    if (second) second.id = "d-1-1";
    expect(codes(validateStructureIntegrity(dup))).toContain(
      "duplicate_division_id",
    );

    const bad = equalStructure(1, 1, 4);
    const conf = bad.conferences[0];
    if (conf) conf.id = "Bad Id";
    expect(codes(validateStructureIntegrity(bad))).toContain(
      "invalid_conference_id",
    );
  });

  it("enforces supported limits", () => {
    expect(
      codes(validateSupportedStructure(equalStructure(5, 1, 4))),
    ).toContain("too_many_conferences");
    expect(
      codes(validateSupportedStructure(equalStructure(1, 2, 3))),
    ).toContain("too_few_teams");
    expect(
      codes(validateSupportedStructure(equalStructure(2, 2, 1))),
    ).toContain("small_division");
    const uneven = equalStructure(2, 2, 3);
    uneven.conferences[1]?.divisions.pop();
    expect(codes(validateSupportedStructure(uneven))).toContain(
      "unequal_conferences",
    );
  });

  it("lists supported team counts and shapes", () => {
    const counts = supportedTeamCounts();
    expect(counts).toContain(30);
    expect(counts).toContain(8);
    expect(counts).toContain(32);
    expect(counts).not.toContain(29);
    expect(counts).not.toContain(31);
    expect(counts.every((n) => n >= 8 && n <= 32)).toBe(true);
    expect(supportedShapes(30)).toContainEqual({
      conferences: 2,
      divisionsPerConference: 3,
      teamsPerDivision: 5,
    });
    for (const n of counts) {
      for (const s of supportedShapes(n)) {
        expect(
          s.conferences * s.divisionsPerConference * s.teamsPerDivision,
        ).toBe(n);
      }
    }
  });
});

describe("playoff config", () => {
  it("defaults the standard league to 16 teams, conference seeding, best-of-7", () => {
    const config = defaultPlayoffConfig(standard);
    expect(config).toEqual({
      teams: 16,
      seeding: "conference",
      autoQualifyDivisionLeaders: true,
      divisionLeaderTopSeeds: 4,
      roundSeriesLengths: [7, 7, 7, 7],
    });
    expect(validatePlayoffConfig(standard, config)).toEqual([]);
  });

  it("picks sensible defaults for every supported size", () => {
    expect(defaultPlayoffTeams(30)).toBe(16);
    expect(defaultPlayoffTeams(8)).toBe(4);
    for (const n of supportedTeamCounts()) {
      for (const s of supportedShapes(n)) {
        const structure = equalStructure(
          s.conferences,
          s.divisionsPerConference,
          s.teamsPerDivision,
        );
        const config = defaultPlayoffConfig(structure);
        const issues = validatePlayoffConfig(structure, config);
        // A default may be rejected only because division leaders can't all fit.
        expect(
          codes(issues).filter((c) => c !== "division_leaders_exceed_spots"),
        ).toEqual([]);
      }
    }
  });

  it("supports custom series lengths per round", () => {
    const config: PlayoffConfig = {
      ...defaultPlayoffConfig(standard),
      roundSeriesLengths: [3, 5, 7, 7],
    };
    expect(validatePlayoffConfig(standard, config)).toEqual([]);
    expect(
      codes(
        validatePlayoffConfig(standard, {
          ...config,
          roundSeriesLengths: [3, 5, 7],
        }),
      ),
    ).toContain("series_round_count");
    expect(
      codes(
        validatePlayoffConfig(standard, {
          ...config,
          roundSeriesLengths: [
            3, 4, 7, 7,
          ] as PlayoffConfig["roundSeriesLengths"],
        }),
      ),
    ).toContain("series_length");
  });

  it("rejects impossible playoff team counts", () => {
    const base = defaultPlayoffConfig(standard);
    expect(
      codes(validatePlayoffConfig(standard, { ...base, teams: 12 })),
    ).toContain("playoff_teams_power");
    const small = equalStructure(2, 2, 2);
    expect(
      codes(
        validatePlayoffConfig(small, {
          ...base,
          teams: 16,
          roundSeriesLengths: [7, 7, 7, 7],
        }),
      ),
    ).toContain("playoff_teams_exceed_league");
  });

  it("only offers conference seeding when the bracket splits evenly", () => {
    expect(canSeedByConference(standard, 16)).toBe(true);
    expect(canSeedByConference(equalStructure(3, 2, 3), 8)).toBe(false);
    expect(canSeedByConference(equalStructure(1, 3, 4), 8)).toBe(true);
    const config: PlayoffConfig = {
      ...defaultPlayoffConfig(equalStructure(3, 2, 3)),
      seeding: "conference",
      teams: 8,
      roundSeriesLengths: [7, 7, 7],
    };
    expect(
      codes(validatePlayoffConfig(equalStructure(3, 2, 3), config)),
    ).toContain("conference_seeding_unavailable");
  });

  it("rejects fewer spots than automatically qualifying division leaders", () => {
    // 4 conferences x 1 division, but each conference sends 1 team; fine.
    // 2 conferences x 4 divisions, 4 playoff teams = 2 per conference < 4 leaders.
    const structure = equalStructure(2, 4, 2); // 16 teams
    const config: PlayoffConfig = {
      teams: 4,
      seeding: "conference",
      autoQualifyDivisionLeaders: true,
      divisionLeaderTopSeeds: 1,
      roundSeriesLengths: [7, 7],
    };
    expect(codes(validatePlayoffConfig(structure, config))).toContain(
      "division_leaders_exceed_spots",
    );
    // Turning automatic qualification off removes the constraint.
    expect(
      validatePlayoffConfig(structure, {
        ...config,
        autoQualifyDivisionLeaders: false,
      }),
    ).toEqual([]);
    // League-wide: 8 leaders don't fit in 4 spots either, but fit in 8.
    expect(
      codes(validatePlayoffConfig(structure, { ...config, seeding: "league" })),
    ).toContain("division_leaders_exceed_spots");
    expect(
      validatePlayoffConfig(structure, {
        ...config,
        seeding: "league",
        teams: 8,
        roundSeriesLengths: [7, 7, 7],
      }),
    ).toEqual([]);
  });

  it("limits division-leader top seeds to the pool", () => {
    const base = defaultPlayoffConfig(standard);
    expect(
      codes(
        validatePlayoffConfig(standard, { ...base, divisionLeaderTopSeeds: 9 }),
      ),
    ).toContain("division_leader_top_seeds");
    expect(
      validatePlayoffConfig(standard, {
        ...base,
        divisionLeaderTopSeeds: null,
      }),
    ).toEqual([]);
  });

  it("counts rounds", () => {
    expect([2, 4, 8, 16, 32].map(playoffRounds)).toEqual([1, 2, 3, 4, 5]);
  });
});

/** Standings for the standard league; team `${div}-${n}` ranked by `order`. */
function standingsFor(order: string[]): StandingEntry[] {
  const info = new Map<string, StandingEntry>();
  for (const c of standard.conferences) {
    for (const d of c.divisions) {
      for (let n = 1; n <= d.teamCount; n++) {
        info.set(`${d.id}/${n}`, {
          teamId: `${d.id}/${n}`,
          conferenceId: c.id,
          divisionId: d.id,
        });
      }
    }
  }
  const ranked = order.map((id) => info.get(id) as StandingEntry);
  const rest = [...info.values()].filter((e) => !order.includes(e.teamId));
  return [...ranked, ...rest];
}

describe("seedPlayoffTeams", () => {
  const config = defaultPlayoffConfig(standard);
  const [east, west] = standard.conferences;
  const eastDivs = east?.divisions.map((d) => d.id) ?? [];
  const westDivs = west?.divisions.map((d) => d.id) ?? [];

  it("seeds 8 per conference and gives division leaders the top seeds", () => {
    // Make a non-leader the best east record so priority seeding matters.
    const [d1, d2, d3] = eastDivs as [string, string, string];
    const standings = standingsFor([
      `${d1}/1`,
      `${d1}/2`, // best two east records are in one division
      `${d2}/1`,
      `${d3}/1`,
    ]);
    const pools = seedPlayoffTeams(standard, config, standings);
    expect(pools).toHaveLength(2);
    const eastPool = pools.find((p) => p.conferenceId === east?.id);
    expect(eastPool?.seeds).toHaveLength(8);
    // Leaders (d1/1, d2/1, d3/1) are seeds 1-3 despite d1/2 having a better record than d2/1.
    expect(eastPool?.seeds.slice(0, 3).map((s) => s.teamId)).toEqual([
      `${d1}/1`,
      `${d2}/1`,
      `${d3}/1`,
    ]);
    expect(eastPool?.seeds[3]?.teamId).toBe(`${d1}/2`);
    expect(eastPool?.seeds.slice(0, 3).every((s) => s.divisionLeader)).toBe(
      true,
    );
  });

  it("qualifies a leader even with a poor record", () => {
    const [d1, d2, d3] = westDivs as [string, string, string];
    // The d3 leader is ranked below 8 non-leaders but still qualifies.
    const order = [
      `${d1}/1`,
      `${d1}/2`,
      `${d1}/3`,
      `${d1}/4`,
      `${d1}/5`,
      `${d2}/1`,
      `${d2}/2`,
      `${d2}/3`,
      `${d2}/4`,
      `${d2}/5`,
      `${d3}/1`,
    ];
    const pools = seedPlayoffTeams(standard, config, standingsFor(order));
    const westPool = pools.find((p) => p.conferenceId === west?.id);
    const ids = westPool?.seeds.map((s) => s.teamId) ?? [];
    expect(ids).toContain(`${d3}/1`);
    expect(ids).toHaveLength(8);
    expect(ids.slice(0, 3)).toEqual([`${d1}/1`, `${d2}/1`, `${d3}/1`]);
  });

  it("works league-wide, capping priority seeds at divisionLeaderTopSeeds", () => {
    const league: PlayoffConfig = { ...config, seeding: "league" };
    const standings = standingsFor([]);
    const pools = seedPlayoffTeams(standard, league, standings);
    expect(pools).toHaveLength(1);
    const seeds = pools[0]?.seeds ?? [];
    expect(seeds).toHaveLength(16);
    // Six leaders qualify, four of them take seeds 1-4.
    expect(seeds.filter((s) => s.divisionLeader)).toHaveLength(6);
    expect(seeds.slice(0, 4).every((s) => s.divisionLeader)).toBe(true);
    expect(seeds.map((s) => s.seed)).toEqual(
      Array.from({ length: 16 }, (_, i) => i + 1),
    );
  });

  it("seeds every leader first when topSeeds is null", () => {
    const league: PlayoffConfig = {
      ...config,
      seeding: "league",
      divisionLeaderTopSeeds: null,
    };
    const seeds =
      seedPlayoffTeams(standard, league, standingsFor([]))[0]?.seeds ?? [];
    expect(seeds.slice(0, 6).every((s) => s.divisionLeader)).toBe(true);
    expect(seeds.slice(6).some((s) => s.divisionLeader)).toBe(false);
  });

  it("uses best records only when automatic qualification is off", () => {
    const off: PlayoffConfig = { ...config, autoQualifyDivisionLeaders: false };
    const [d1] = eastDivs as [string];
    const standings = standingsFor([`${d1}/1`, `${d1}/2`, `${d1}/3`]);
    const eastPool = seedPlayoffTeams(standard, off, standings).find(
      (p) => p.conferenceId === east?.id,
    );
    expect(eastPool?.seeds.slice(0, 3).map((s) => s.teamId)).toEqual([
      `${d1}/1`,
      `${d1}/2`,
      `${d1}/3`,
    ]);
  });

  it("rejects invalid config and incomplete standings", () => {
    expect(() =>
      seedPlayoffTeams(standard, { ...config, teams: 12 }, standingsFor([])),
    ).toThrow(/Invalid playoff config/);
    expect(() =>
      seedPlayoffTeams(standard, config, standingsFor([]).slice(1)),
    ).toThrow(/every team/);
  });

  it("keeps working after a conference or division is renamed", () => {
    const renamed = structuredClone(standard);
    const renamedConference = renamed.conferences[0];
    if (renamedConference) renamedConference.name = "Renamed";
    const a = seedPlayoffTeams(standard, config, standingsFor([]));
    const b = seedPlayoffTeams(renamed, config, standingsFor([]));
    expect(b).toEqual(a);
  });
});

describe("local players and franchises", () => {
  const players = [
    { slot: 1, label: null },
    { slot: 2, label: "Sam" },
  ];
  const [conf] = standard.conferences;
  const [d1, d2] = conf?.divisions ?? [];
  const franchise = (over: Partial<FranchiseSpec>): FranchiseSpec => ({
    cityId: "na-us-nyc",
    nickname: "Comets",
    primaryColor: "#112233",
    secondaryColor: "#ffcc00",
    logoId: "logo-01",
    conferenceId: conf?.id ?? "",
    divisionId: d1?.id ?? "",
    localPlayerSlot: 1,
    aiAssist: { ...NO_AI_ASSIST },
    ...over,
  });

  it("validates local player numbering and count", () => {
    expect(validateLocalPlayers(players)).toEqual([]);
    expect(codes(validateLocalPlayers([]))).toContain("local_player_count");
    expect(
      codes(
        validateLocalPlayers(
          Array.from({ length: 9 }, (_, i) => ({ slot: i + 1, label: null })),
        ),
      ),
    ).toContain("local_player_count");
    expect(codes(validateLocalPlayers([{ slot: 2, label: null }]))).toContain(
      "local_player_slots",
    );
    expect(codes(validateLocalPlayers([{ slot: 1, label: "   " }]))).toContain(
      "local_player_label",
    );
  });

  it("lets one player control several franchises", () => {
    const issues = validateFranchises(standard, players, [
      franchise({ cityId: "na-us-nyc", localPlayerSlot: 1 }),
      franchise({
        cityId: "na-us-bos",
        localPlayerSlot: 1,
        divisionId: d2?.id ?? "",
      }),
      franchise({ cityId: "na-us-chi", localPlayerSlot: 2 }),
    ]);
    expect(issues).toEqual([]);
  });

  it("allows human franchises to outnumber players and equal a full league", () => {
    // 1 player, 2 franchises
    expect(
      validateFranchises(
        standard,
        [players[0] as (typeof players)[0]],
        [
          franchise({ cityId: "na-us-nyc" }),
          franchise({ cityId: "na-us-bos" }),
        ],
      ),
    ).toEqual([]);
  });

  it("requires every player to control at least one franchise", () => {
    expect(
      codes(validateFranchises(standard, players, [franchise({})])),
    ).toContain("franchises_per_player");
    expect(
      codes(
        validateFranchises(standard, players, [
          franchise({ cityId: "na-us-nyc" }),
          franchise({ cityId: "na-us-bos" }),
        ]),
      ),
    ).toContain("franchises_per_player");
  });

  it("enforces one franchise per city", () => {
    expect(
      codes(
        validateFranchises(standard, players, [
          franchise({ localPlayerSlot: 1 }),
          franchise({ localPlayerSlot: 2 }),
        ]),
      ),
    ).toContain("duplicate_city");
  });

  it("validates identity fields", () => {
    const issues = codes(
      validateFranchises(
        standard,
        [players[0] as (typeof players)[0]],
        [
          franchise({
            cityId: "NYC",
            nickname: " ",
            primaryColor: "red",
            secondaryColor: "#FFF",
            logoId: "star",
          }),
        ],
      ),
    );
    expect(issues).toEqual(
      expect.arrayContaining([
        "invalid_city",
        "invalid_nickname",
        "invalid_color",
        "invalid_logo",
      ]),
    );
  });

  it("rejects bad placement, full divisions and unknown players", () => {
    const one = [players[0] as (typeof players)[0]];
    expect(
      codes(
        validateFranchises(standard, one, [franchise({ divisionId: "nope" })]),
      ),
    ).toContain("unknown_division");
    // A division belonging to the other conference.
    const other = standard.conferences[1]?.divisions[0];
    expect(
      codes(
        validateFranchises(standard, one, [
          franchise({ divisionId: other?.id ?? "" }),
        ]),
      ),
    ).toContain("unknown_division");
    const cities = ["na-a-a", "na-b-b", "na-c-c", "na-d-d", "na-e-e", "na-f-f"];
    expect(
      codes(
        validateFranchises(
          standard,
          one,
          cities.map((cityId) => franchise({ cityId })),
        ),
      ),
    ).toContain("division_full");
    expect(
      codes(
        validateFranchises(standard, one, [franchise({ localPlayerSlot: 5 })]),
      ),
    ).toContain("unknown_player");
  });

  it("allows AI Assist only on human-controlled franchises", () => {
    const one = [players[0] as (typeof players)[0]];
    expect(
      validateFranchises(standard, one, [
        franchise({
          aiAssist: { ...NO_AI_ASSIST, scouting: true, drafting: true },
        }),
      ]),
    ).toEqual([]);
    expect(
      codes(
        validateFranchises(standard, one, [
          franchise({
            localPlayerSlot: null,
            aiAssist: { ...NO_AI_ASSIST, trades: true },
          }),
        ]),
      ),
    ).toContain("ai_assist_needs_player");
  });

  it("defaults every AI Assist permission to off", () => {
    expect(Object.values(NO_AI_ASSIST).every((v) => v === false)).toBe(true);
    expect(Object.keys(NO_AI_ASSIST)).toHaveLength(5);
  });
});

describe("validateOwnerModeSetup", () => {
  const config: LeagueConfig = {
    schemaVersion: 1,
    preset: "standard",
    region: "north-america",
    fantasyDraft: false,
    playoffs: defaultPlayoffConfig(standard),
  };
  const conf = standard.conferences[0];
  const division = conf?.divisions[0];
  const base = {
    config,
    structure: standard,
    localPlayers: [{ slot: 1, label: null }],
    franchises: [
      {
        cityId: "na-us-nyc",
        nickname: "Comets",
        primaryColor: "#112233",
        secondaryColor: "#ffcc00",
        logoId: "logo-01",
        conferenceId: conf?.id ?? "",
        divisionId: division?.id ?? "",
        localPlayerSlot: 1,
        aiAssist: { ...NO_AI_ASSIST },
      },
    ],
  };

  it("accepts a valid standard setup", () => {
    expect(validateOwnerModeSetup(base)).toEqual([]);
  });

  it("rejects a standard preset with another shape, and unknown versions", () => {
    const compact = equalStructure(2, 2, 3);
    const c = compact.conferences[0];
    const d = c?.divisions[0];
    expect(
      codes(
        validateOwnerModeSetup({
          ...base,
          structure: compact,
          config: { ...config, playoffs: defaultPlayoffConfig(compact) },
          franchises: [
            {
              ...(base.franchises[0] as FranchiseSpec),
              conferenceId: c?.id ?? "",
              divisionId: d?.id ?? "",
            },
          ],
        }),
      ),
    ).toContain("standard_shape");
    expect(
      codes(
        validateOwnerModeSetup({
          ...base,
          config: { ...config, schemaVersion: 2 as 1 },
        }),
      ),
    ).toContain("config_version");
  });
});

describe("legacy leagues", () => {
  it("derives settings from the size without any stored config", () => {
    const standardView = legacySettings("standard");
    expect(standardView).toMatchObject({
      legacy: true,
      preset: "standard",
      region: null,
      fantasyDraft: false,
    });
    expect(standardView.playoffs.teams).toBe(16);
    const compact = legacySettings("compact");
    expect(compact.preset).toBe("custom");
    expect(compact.playoffs.teams).toBe(4);
    expect(
      validatePlayoffConfig(equalStructure(2, 2, 3), compact.playoffs),
    ).toEqual([]);
  });
});

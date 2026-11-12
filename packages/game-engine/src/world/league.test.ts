import { createHash } from "node:crypto";
import { contrastRatio } from "@fullcourt/design-tokens";
import {
  defaultPlayoffConfig,
  equalStructure,
  standardStructure,
  validateOwnerModeSetup,
} from "@fullcourt/game-rules";
import {
  LOGO_IDS,
  NO_AI_ASSIST,
  REGIONS,
  type Region,
} from "@fullcourt/game-types";
import { describe, expect, it } from "vitest";
import { findCity } from "./cities";
import {
  generateOwnerWorld,
  planOwnerLeague,
  type OwnerWorldOptions,
} from "./league";
import { EXTRA_TEAM_COLORS, TEAM_COLORS } from "./names";

const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);

const OWN_CITY: Record<Region, string> = {
  "north-america": "na-us-new-york",
  "south-america": "sa-br-sao-paulo",
  europe: "eu-gb-london",
  asia: "as-jp-tokyo",
  australia: "au-au-sydney",
};

function options(over: Partial<OwnerWorldOptions> = {}): OwnerWorldOptions {
  return {
    seed: "roster-seed",
    identitySeed: "identity-1",
    region: "north-america",
    shape: standardStructure(),
    localPlayers: [{ slot: 1, label: null }],
    franchises: [{ localPlayerSlot: 1, cityId: "na-ca-vancouver" }],
    ...over,
  };
}

function teamsIn(shape: ReturnType<typeof equalStructure>): number {
  return shape.conferences
    .flatMap((c) => c.divisions)
    .reduce((s, d) => s + d.teamCount, 0);
}

describe("generateOwnerWorld", () => {
  it("builds a complete standard league with a real city per team", () => {
    const world = generateOwnerWorld(options());
    expect(world.teams).toHaveLength(30);
    expect(world.players).toHaveLength(30 * 15);
    expect(world.structure.conferences).toHaveLength(2);
    expect(new Set(world.teams.map((t) => t.cityId)).size).toBe(30);
    expect(new Set(world.teams.map((t) => t.abbreviation)).size).toBe(30);
    expect(new Set(world.teams.map((t) => t.nickname)).size).toBe(30);
    for (const t of world.teams) {
      expect(findCity(t.cityId)?.name).toBe(t.city);
      expect(t.abbreviation).toMatch(/^[A-Z0-9]{3}$/);
      expect(LOGO_IDS).toContain(t.logoId);
    }
    expect(world.rngState).toHaveLength(4);
  });

  it("keeps the owner's city and choices, and generates the rest", () => {
    const world = generateOwnerWorld(
      options({
        franchises: [
          {
            localPlayerSlot: 1,
            cityId: "na-ca-vancouver",
            nickname: "Orcas",
            primaryColor: "#112233",
            secondaryColor: "#ffcc00",
            logoId: "logo-07",
            aiAssist: { ...NO_AI_ASSIST, scouting: true },
          },
        ],
      }),
    );
    const mine = world.teams.filter((t) => t.localPlayerSlot === 1);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      cityId: "na-ca-vancouver",
      nickname: "Orcas",
      primaryColor: "#112233",
      logoId: "logo-07",
      aiAssist: { ...NO_AI_ASSIST, scouting: true },
    });
    const ai = world.teams.filter((t) => t.localPlayerSlot === null);
    expect(ai).toHaveLength(29);
    expect(world.teams.filter((t) => t.nickname === "Orcas")).toHaveLength(1);
    for (const t of ai) expect(t.aiAssist).toEqual(NO_AI_ASSIST);
  });

  it("lets one local player run several franchises", () => {
    const world = generateOwnerWorld(
      options({
        localPlayers: [
          { slot: 1, label: null },
          { slot: 2, label: "Sam" },
        ],
        franchises: [
          { localPlayerSlot: 1, cityId: "na-us-new-york" },
          { localPlayerSlot: 1, cityId: "na-us-boston" },
          { localPlayerSlot: 2, cityId: "na-us-seattle" },
        ],
      }),
    );
    expect(world.teams.filter((t) => t.localPlayerSlot === 1)).toHaveLength(2);
    expect(world.teams.filter((t) => t.localPlayerSlot === 2)).toHaveLength(1);
    expect(world.localPlayers).toEqual([
      { slot: 1, label: null },
      { slot: 2, label: "Sam" },
    ]);
  });

  it("is deterministic, and the identity seed alone fixes the franchises", () => {
    const a = generateOwnerWorld(options());
    expect(generateOwnerWorld(options())).toEqual(a);
    const identity = (w: typeof a) =>
      w.teams.map((t) => [t.cityId, t.nickname, t.logoId, t.primaryColor]);
    // A different roster seed changes the players but not the franchises, so
    // what the owner previewed is what is created.
    const other = generateOwnerWorld(options({ seed: "another-roster-seed" }));
    expect(identity(other)).toEqual(identity(a));
    expect(other.players[0]).not.toEqual(a.players[0]);
    // A different identity seed reshuffles the league.
    const shuffled = generateOwnerWorld(
      options({ identitySeed: "identity-2" }),
    );
    expect(identity(shuffled)).not.toEqual(identity(a));
  });

  it("produces a league that passes every Owner Mode rule", () => {
    for (const region of REGIONS) {
      const world = generateOwnerWorld(
        options({
          region,
          franchises: [{ localPlayerSlot: 1, cityId: OWN_CITY[region] }],
        }),
      );
      const mine = world.teams.filter((t) => t.localPlayerSlot === 1);
      const issues = validateOwnerModeSetup({
        config: {
          schemaVersion: 1,
          preset: "standard",
          region,
          fantasyDraft: false,
          playoffs: defaultPlayoffConfig(world.structure),
        },
        structure: world.structure,
        localPlayers: world.localPlayers,
        franchises: mine.map((t) => ({
          cityId: t.cityId,
          nickname: t.nickname,
          primaryColor: t.primaryColor,
          secondaryColor: t.secondaryColor,
          logoId: t.logoId,
          conferenceId: t.conferenceId,
          divisionId: t.divisionId,
          localPlayerSlot: t.localPlayerSlot,
          aiAssist: t.aiAssist,
        })),
      });
      expect(issues).toEqual([]);
    }
  });

  it("builds custom leagues up to 32 teams", () => {
    for (const shape of [
      equalStructure(4, 4, 2),
      equalStructure(2, 2, 3),
      equalStructure(1, 4, 5),
    ]) {
      const world = generateOwnerWorld(
        options({
          shape,
          region: "europe",
          franchises: [{ localPlayerSlot: 1, cityId: "eu-fr-paris" }],
        }),
      );
      const n = teamsIn(shape);
      expect(world.teams).toHaveLength(n);
      expect(new Set(world.teams.map((t) => t.abbreviation)).size).toBe(n);
      expect(world.players).toHaveLength(n * 15);
    }
  });

  it("rejects franchises from another region and too many franchises", () => {
    expect(() =>
      generateOwnerWorld(
        options({
          franchises: [{ localPlayerSlot: 1, cityId: "eu-fr-paris" }],
        }),
      ),
    ).toThrow(/isn't in north-america/);
    const cities = [
      "na-us-new-york",
      "na-us-boston",
      "na-us-seattle",
      "na-us-chicago",
      "na-us-miami",
      "na-us-denver",
      "na-us-dallas",
      "na-us-atlanta",
      "na-us-houston",
    ];
    expect(() =>
      generateOwnerWorld(
        options({
          shape: equalStructure(2, 2, 2),
          franchises: cities.map((cityId) => ({ localPlayerSlot: 1, cityId })),
        }),
      ),
    ).toThrow(/more franchises than teams/);
  });

  it("matches pinned leagues, so worlds stay stable across releases and platforms", () => {
    // If you change generation on purpose, update PINNED and say so in the commit.
    const digest = Object.fromEntries(
      REGIONS.map((region) => [
        region,
        hash(
          generateOwnerWorld(
            options({
              region,
              franchises: [{ localPlayerSlot: 1, cityId: OWN_CITY[region] }],
            }),
          ),
        ),
      ]),
    );
    expect(digest).toEqual(PINNED);
  });

  it("uses colours that keep white text readable", () => {
    for (const [primary] of [...TEAM_COLORS, ...EXTRA_TEAM_COLORS]) {
      expect(contrastRatio(primary, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("stays inside the database limits across seeds", () => {
    for (let i = 0; i < 40; i++) {
      const region = REGIONS[i % REGIONS.length] as Region;
      const world = generateOwnerWorld(
        options({
          region,
          seed: `s${i}`,
          identitySeed: `id${i}`,
          franchises: [{ localPlayerSlot: 1, cityId: OWN_CITY[region] }],
        }),
      );
      for (const t of world.teams) {
        expect(t.abbreviation).toMatch(/^[A-Z0-9]{3}$/);
        expect(t.primaryColor).toMatch(/^#[0-9a-f]{6}$/);
        expect(t.city.length).toBeLessThanOrEqual(40);
        expect(t.nickname.length).toBeLessThanOrEqual(40);
      }
      for (const p of world.players) {
        expect(p.heightInches).toBeGreaterThanOrEqual(60);
        expect(p.age).toBeGreaterThanOrEqual(16);
      }
    }
  }, 60_000);
});

const PINNED: Record<Region, string> = {
  "north-america": "3f9f8dd9fff228e0",
  "south-america": "624fe15e57ad679c",
  europe: "3f5136fca54fbf82",
  asia: "c35494963db67789",
  australia: "4dae328f6408ea3a",
};

describe("planOwnerLeague", () => {
  it("is exactly the league a world is generated with, so previews are honest", () => {
    for (const region of REGIONS) {
      const o = options({
        region,
        franchises: [{ localPlayerSlot: 1, cityId: OWN_CITY[region] }],
      });
      const plan = planOwnerLeague(o);
      const world = generateOwnerWorld(o);
      expect(world.teams).toEqual(plan.teams);
      expect(world.structure).toEqual(plan.structure);
      expect(world.localPlayers).toEqual(plan.localPlayers);
    }
  });

  it("needs no roster seed", () => {
    const a = planOwnerLeague(options({ seed: "one" }));
    const b = planOwnerLeague(options({ seed: "two" }));
    expect(a).toEqual(b);
  });

  it("renames conferences and divisions without changing any id or placement", () => {
    const plain = planOwnerLeague(options());
    const conference = plain.structure.conferences[0];
    const division = conference?.divisions[0];
    const named = planOwnerLeague(
      options({
        names: {
          conferences: { [conference?.id ?? ""]: "  Harbor League " },
          divisions: { [division?.id ?? ""]: "Lighthouse" },
        },
      }),
    );
    expect(named.structure.conferences[0]?.name).toBe("Harbor League");
    expect(named.structure.conferences[0]?.divisions[0]?.name).toBe(
      "Lighthouse",
    );
    // Only names differ.
    const ids = (p: typeof plain) =>
      p.structure.conferences.flatMap((c) => [
        c.id,
        ...c.divisions.map((d) => d.id),
      ]);
    expect(ids(named)).toEqual(ids(plain));
    expect(named.teams).toEqual(plain.teams);
  });

  it("rejects renames to unknown ids or to names already taken", () => {
    const plain = planOwnerLeague(options());
    const [a, b] = plain.structure.conferences;
    expect(() =>
      planOwnerLeague(options({ names: { conferences: { nope: "X" } } })),
    ).toThrow(/isn't a conference or division/);
    expect(() =>
      planOwnerLeague(
        options({
          names: {
            conferences: { [a?.id ?? ""]: "Twin", [b?.id ?? ""]: " twin " },
          },
        }),
      ),
    ).toThrow(/both called/);
  });

  it("rejects two franchises with the same team name", () => {
    expect(() =>
      planOwnerLeague(
        options({
          localPlayers: [
            { slot: 1, label: null },
            { slot: 2, label: null },
          ],
          franchises: [
            {
              localPlayerSlot: 1,
              cityId: "na-us-new-york",
              nickname: "Comets",
            },
            { localPlayerSlot: 2, cityId: "na-us-boston", nickname: " comets" },
          ],
        }),
      ),
    ).toThrow(/share a team name/);
  });

  it("never gives an AI team the name an owner picked", () => {
    const plan = planOwnerLeague(
      options({
        franchises: [
          { localPlayerSlot: 1, cityId: "na-ca-vancouver", nickname: "Comets" },
        ],
      }),
    );
    expect(plan.teams.filter((t) => t.nickname === "Comets")).toHaveLength(1);
  });
});

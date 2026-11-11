import { createHash } from "node:crypto";
import { contrastRatio } from "@fullcourt/design-tokens";
import { computeOverall } from "@fullcourt/game-rules";
import { POSITIONS, RATING_KEYS } from "@fullcourt/game-types";
import { describe, expect, it } from "vitest";
import { generateWorld, ROSTER_SIZE } from "./generate";
import { TEAM_COLORS } from "./names";

const standard = generateWorld({ seed: "test-league", size: "standard" });
const compact = generateWorld({ seed: "test-league", size: "compact" });

const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

describe("generateWorld", () => {
  it("is deterministic for a seed", () => {
    const again = generateWorld({ seed: "test-league", size: "standard" });
    expect(JSON.stringify(again)).toBe(JSON.stringify(standard));
  });

  it("matches a pinned world, so leagues stay stable across releases and platforms", () => {
    // If you change generation on purpose, update this hash and say so in the commit.
    // Last changed: height and weight are clamped to plausible ranges.
    expect(hash(standard)).toMatchInlineSnapshot(
      `"937a7b3e24f29db98cada05e1497a8113e7dfc658f4580080c7ec287bdd4a0f4"`,
    );
  });

  it("differs between seeds", () => {
    const other = generateWorld({ seed: "another-league", size: "standard" });
    expect(other.players[0]).not.toEqual(standard.players[0]);
  });

  it("builds 30 teams in 2 conferences × 3 divisions × 5, or 12 as 2 × 2 × 3", () => {
    expect(standard.teams).toHaveLength(30);
    expect(compact.teams).toHaveLength(12);
    const count = (
      teams: typeof standard.teams,
      key: "conference" | "division",
    ) =>
      Object.values(
        teams.reduce<Record<string, number>>((acc, t) => {
          acc[t[key]] = (acc[t[key]] ?? 0) + 1;
          return acc;
        }, {}),
      );
    expect(count(standard.teams, "conference")).toEqual([15, 15]);
    expect(count(standard.teams, "division")).toEqual([5, 5, 5, 5, 5, 5]);
    expect(count(compact.teams, "division")).toEqual([3, 3, 3, 3]);
  });

  it("gives teams unique cities, nicknames and 3-letter abbreviations", () => {
    for (const key of ["city", "nickname", "abbreviation"] as const) {
      const values = standard.teams.map((t) => t[key]);
      expect(new Set(values).size).toBe(values.length);
    }
    for (const team of standard.teams) {
      expect(team.abbreviation).toMatch(/^[A-Z0-9]{3}$/);
    }
  });

  it("fills every roster with three of each position and unique jerseys", () => {
    for (const team of standard.teams) {
      const roster = standard.players.filter(
        (p) => p.team === team.abbreviation,
      );
      expect(roster).toHaveLength(ROSTER_SIZE);
      for (const position of POSITIONS) {
        expect(roster.filter((p) => p.position === position)).toHaveLength(3);
      }
      expect(new Set(roster.map((p) => p.jersey)).size).toBe(ROSTER_SIZE);
    }
  });

  it("gives every player a unique name", () => {
    const names = standard.players.map((p) => `${p.firstName} ${p.lastName}`);
    expect(new Set(names).size).toBe(names.length);
  });

  it("keeps ratings, ages and sizes in range and consistent", () => {
    for (const p of [...standard.players, ...compact.players]) {
      for (const key of RATING_KEYS) {
        expect(p.ratings[key]).toBeGreaterThanOrEqual(25);
        expect(p.ratings[key]).toBeLessThanOrEqual(99);
      }
      expect(p.overall).toBe(computeOverall(p.position, p.ratings));
      expect(p.potential).toBeGreaterThanOrEqual(p.overall);
      expect(p.potential).toBeLessThanOrEqual(99);
      expect(p.age).toBeGreaterThanOrEqual(19);
      expect(p.age).toBeLessThanOrEqual(36);
      expect(p.heightInches).toBeGreaterThanOrEqual(66);
      expect(p.heightInches).toBeLessThanOrEqual(90);
      expect(p.jersey).toBeGreaterThanOrEqual(0);
      expect(p.jersey).toBeLessThanOrEqual(99);
    }
  });

  it("produces a believable spread of talent", () => {
    const overalls = standard.players.map((p) => p.overall);
    const mean = overalls.reduce((a, b) => a + b, 0) / overalls.length;
    expect(mean).toBeGreaterThan(55);
    expect(mean).toBeLessThan(65);
    expect(overalls.filter((o) => o >= 80).length).toBeGreaterThan(3);
    expect(Math.max(...overalls)).toBeLessThanOrEqual(95);
    expect(Math.min(...overalls)).toBeGreaterThanOrEqual(35);
  });

  it("makes guards better ball handlers and centers better rebounders", () => {
    const avg = (pos: string, key: (typeof RATING_KEYS)[number]) => {
      const group = standard.players.filter((p) => p.position === pos);
      return group.reduce((s, p) => s + p.ratings[key], 0) / group.length;
    };
    expect(avg("PG", "ballHandling")).toBeGreaterThan(
      avg("C", "ballHandling") + 15,
    );
    expect(avg("C", "defRebound")).toBeGreaterThan(
      avg("PG", "defRebound") + 15,
    );
  });

  it("returns the RNG state to continue from", () => {
    expect(standard.rngState).toHaveLength(4);
    for (const n of standard.rngState) {
      expect(Number.isInteger(n) && n >= 0 && n < 2 ** 32).toBe(true);
    }
  });

  it("uses team colours that keep white text readable", () => {
    for (const [primary] of TEAM_COLORS) {
      expect(contrastRatio(primary, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("generateWorld across many seeds", () => {
  // Every league gets a random seed, so a rare bad draw would make league
  // creation fail at random. Check many seeds against the database's limits
  // (supabase/migrations/*_league_world.sql).
  const DB_LIMITS = {
    age: [16, 50],
    heightInches: [60, 96],
    weightPounds: [120, 400],
    jersey: [0, 99],
    overall: [25, 99],
    potential: [25, 99],
  } as const;

  it("always stays inside the database limits", () => {
    for (let i = 0; i < 400; i++) {
      const world = generateWorld({
        seed: `sweep-${i}`,
        size: i % 4 === 0 ? "standard" : "compact",
      });
      for (const p of world.players) {
        for (const [key, [min, max]] of Object.entries(DB_LIMITS)) {
          const value = p[key as keyof typeof DB_LIMITS];
          if (value < min || value > max) {
            throw new Error(
              `seed sweep-${i}: ${key} ${value} outside ${min}-${max}`,
            );
          }
        }
        for (const key of RATING_KEYS) {
          const value = p.ratings[key];
          if (value < 25 || value > 99) {
            throw new Error(`seed sweep-${i}: ${key} ${value} outside 25-99`);
          }
        }
        if (p.firstName.length > 40 || p.lastName.length > 40) {
          throw new Error(`seed sweep-${i}: name too long`);
        }
      }
      for (const t of world.teams) {
        if (
          !/^[A-Z0-9]{3}$/.test(t.abbreviation) ||
          !/^#[0-9a-f]{6}$/.test(t.primaryColor) ||
          !/^#[0-9a-f]{6}$/.test(t.secondaryColor)
        ) {
          throw new Error(`seed sweep-${i}: bad team ${t.abbreviation}`);
        }
      }
    }
  }, 60_000);
});

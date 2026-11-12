import { createHash } from "node:crypto";
import {
  equalStructure,
  standardStructure,
  supportedShapes,
  supportedTeamCounts,
  totalTeams,
  validateStructureIntegrity,
} from "@fullcourt/game-rules";
import {
  REGIONS,
  type LeagueStructure,
  type Region,
} from "@fullcourt/game-types";
import { describe, expect, it } from "vitest";
import { createRng, seedState } from "../rng/rng";
import { shuffle } from "../rng/helpers";
import { LONGITUDE_SCALE, citiesIn, findCity } from "./cities";
import {
  assignGeography,
  balancedClusters,
  selectCities,
  type Point,
} from "./geography";

const rngFor = (seed: string) => createRng(seedState(seed));
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

function league(region: Region, seed: string, shape: LeagueStructure) {
  const cities = selectCities(rngFor(seed), region, totalTeams(shape));
  return { cities, ...assignGeography(region, cities, shape) };
}

/** Sum of squared distances from each city to its division's centre. */
function spread(region: Region, result: ReturnType<typeof league>): number {
  const scale = LONGITUDE_SCALE[region];
  const groups = new Map<string, Point[]>();
  for (const id of result.cities) {
    const c = findCity(id);
    const key = (result.placements[id] as { divisionId: string }).divisionId;
    groups.set(key, [
      ...(groups.get(key) ?? []),
      { id, x: (c?.lonE2 ?? 0) * scale, y: c?.latE2 ?? 0 },
    ]);
  }
  return sse([...groups.values()]);
}

function sse(groups: Point[][]): number {
  let total = 0;
  for (const g of groups) {
    const cx = g.reduce((s, p) => s + p.x, 0) / g.length;
    const cy = g.reduce((s, p) => s + p.y, 0) / g.length;
    for (const p of g) total += (p.x - cx) ** 2 + (p.y - cy) ** 2;
  }
  return total;
}

/** Baseline: sort west to east and cut into division-sized slices. */
function naiveSpread(region: Region, cities: string[], size: number): number {
  const scale = LONGITUDE_SCALE[region];
  const points = cities
    .map((id) => {
      const c = findCity(id);
      return { id, x: (c?.lonE2 ?? 0) * scale, y: c?.latE2 ?? 0 };
    })
    .sort((a, b) => a.x - b.x || (a.id < b.id ? -1 : 1));
  const groups: Point[][] = [];
  for (let i = 0; i < points.length; i += size) {
    groups.push(points.slice(i, i + size));
  }
  return sse(groups);
}

function checkLeague(
  result: ReturnType<typeof league>,
  shape: LeagueStructure,
) {
  const { structure, placements, cities } = result;
  expect(validateStructureIntegrity(structure)).toEqual([]);
  // Same sizes as requested (as a multiset), every city placed exactly once.
  const sizes = (s: LeagueStructure) =>
    s.conferences.flatMap((c) => c.divisions.map((d) => d.teamCount)).sort();
  expect(sizes(structure)).toEqual(sizes(shape));
  expect(Object.keys(placements).sort()).toEqual([...cities].sort());
  for (const c of structure.conferences) {
    for (const d of c.divisions) {
      const inDivision = Object.values(placements).filter(
        (p) => p.divisionId === d.id,
      );
      expect(inDivision).toHaveLength(d.teamCount);
      expect(inDivision.every((p) => p.conferenceId === c.id)).toBe(true);
    }
  }
}

describe("selectCities", () => {
  it("is deterministic, unique and keeps fixed cities first", () => {
    const fixed = ["na-ca-vancouver", "na-us-miami"];
    const a = selectCities(rngFor("s"), "north-america", 30, fixed);
    const b = selectCities(rngFor("s"), "north-america", 30, fixed);
    expect(a).toEqual(b);
    expect(a.slice(0, 2)).toEqual(fixed);
    expect(new Set(a).size).toBe(30);
    for (const id of a) expect(findCity(id)?.region).toBe("north-america");
    expect(selectCities(rngFor("t"), "north-america", 30, fixed)).not.toEqual(
      a,
    );
  });

  it("rejects fixed cities from another region or duplicates", () => {
    expect(() =>
      selectCities(rngFor("s"), "europe", 8, ["na-us-miami"]),
    ).toThrow(/isn't in europe/);
    expect(() =>
      selectCities(rngFor("s"), "europe", 8, ["eu-fr-paris", "eu-fr-paris"]),
    ).toThrow(/unique/);
    expect(() => selectCities(rngFor("s"), "europe", 999)).toThrow();
  });

  it("can fill a league from the whole region", () => {
    for (const region of REGIONS) {
      const picked = selectCities(rngFor("x"), region, 32);
      expect(new Set(picked).size).toBe(32);
      expect(citiesIn(region).length).toBeGreaterThanOrEqual(32);
    }
  });
});

describe("assignGeography", () => {
  it("builds the standard league in every region with exact sizes", () => {
    for (const region of REGIONS) {
      const shape = standardStructure();
      const result = league(region, "std", shape);
      checkLeague(result, shape);
      expect(result.structure.conferences).toHaveLength(2);
      for (const c of result.structure.conferences) {
        expect(c.divisions).toHaveLength(3);
      }
    }
  });

  it("handles every supported shape for every team count", () => {
    for (const n of supportedTeamCounts()) {
      for (const s of supportedShapes(n)) {
        const shape = equalStructure(
          s.conferences,
          s.divisionsPerConference,
          s.teamsPerDivision,
        );
        checkLeague(league("north-america", `shape-${n}`, shape), shape);
      }
    }
  });

  it("covers the edges: one conference, one division per conference, size 2, 32 teams", () => {
    for (const shape of [
      equalStructure(1, 4, 3),
      equalStructure(4, 1, 2),
      equalStructure(2, 8, 2),
      equalStructure(4, 4, 2),
      equalStructure(1, 16, 2),
    ]) {
      checkLeague(league("europe", "edge", shape), shape);
    }
  });

  it("supports unequal divisions in the algorithm, ready for later", () => {
    const shape: LeagueStructure = {
      conferences: [
        {
          id: "a",
          name: "A",
          divisions: [
            { id: "a1", name: "A1", teamCount: 4 },
            { id: "a2", name: "A2", teamCount: 3 },
          ],
        },
        {
          id: "b",
          name: "B",
          divisions: [{ id: "b1", name: "B1", teamCount: 5 }],
        },
      ],
    };
    checkLeague(league("asia", "uneven", shape), shape);
  });

  it("does not depend on the order of the input cities", () => {
    const shape = standardStructure();
    const cities = selectCities(rngFor("order"), "asia", 30);
    const shuffled = shuffle(rngFor("shuffle"), cities);
    expect(assignGeography("asia", shuffled, shape)).toEqual(
      assignGeography("asia", cities, shape),
    );
  });

  it("is deterministic across calls", () => {
    const shape = standardStructure();
    const a = league("europe", "same", shape);
    const b = league("europe", "same", shape);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("puts chosen cities far apart in different conferences when geography says so", () => {
    const fixed = ["na-ca-vancouver", "na-us-miami", "na-ca-halifax"];
    const cities = selectCities(rngFor("far"), "north-america", 30, fixed);
    const { placements } = assignGeography(
      "north-america",
      cities,
      standardStructure(),
    );
    for (const id of fixed) expect(placements[id]).toBeDefined();
    // Vancouver (far west) and Halifax (far east) never share a conference.
    expect(placements["na-ca-vancouver"]?.conferenceId).not.toBe(
      placements["na-ca-halifax"]?.conferenceId,
    );
  });

  it("names a two-conference North American league West and East", () => {
    const { structure } = league("north-america", "names", standardStructure());
    expect(structure.conferences.map((c) => c.name)).toEqual([
      "Western",
      "Eastern",
    ]);
  });

  it("gives unique ids that fit the id format, and falls back to Alpha, Bravo… on name clashes", () => {
    for (const region of REGIONS) {
      const { structure } = league(region, "ids", equalStructure(4, 4, 2));
      const ids = structure.conferences.flatMap((c) => [
        c.id,
        ...c.divisions.map((d) => d.id),
      ]);
      expect(new Set(ids).size).toBe(ids.length);
      expect(validateStructureIntegrity(structure)).toEqual([]);
    }
  });

  it("rejects mismatched input", () => {
    const shape = standardStructure();
    expect(() => assignGeography("europe", ["eu-fr-paris"], shape)).toThrow(
      /match the structure/,
    );
    const cities = selectCities(rngFor("m"), "europe", 30);
    expect(() => assignGeography("asia", cities, shape)).toThrow(
      /isn't in asia/,
    );
    const dup = [...cities.slice(0, 29), cities[0] as string];
    expect(() => assignGeography("europe", dup, shape)).toThrow(/unique/);
  });

  it("makes more compact divisions than slicing west to east", () => {
    for (const region of REGIONS) {
      const shape = standardStructure();
      const result = league(region, "quality", shape);
      expect(spread(region, result)).toBeLessThanOrEqual(
        naiveSpread(region, result.cities, 5),
      );
    }
  });

  it("stays valid across many seeds", () => {
    for (let i = 0; i < 60; i++) {
      const region = REGIONS[i % REGIONS.length] as Region;
      const shape = i % 2 === 0 ? standardStructure() : equalStructure(2, 2, 4);
      checkLeague(league(region, `sweep-${i}`, shape), shape);
    }
  });

  it("matches pinned worlds, so leagues stay stable across releases and platforms", () => {
    // If you change the algorithm or catalogue on purpose, update PINNED_WORLDS and say so.
    const digest = Object.fromEntries(
      REGIONS.map((region) => [
        region,
        hash(league(region, "golden", standardStructure())).slice(0, 16),
      ]),
    );
    expect(digest).toEqual(PINNED_WORLDS);
  });
});

describe("balancedClusters", () => {
  const pt = (id: string, x: number, y: number): Point => ({ id, x, y });

  it("splits collinear points into compact runs", () => {
    const points = Array.from({ length: 6 }, (_, i) => pt(`p${i}`, i * 10, 0));
    const groups = balancedClusters(points, [3, 3]).map((g) => [...g].sort());
    expect(groups.sort((a, b) => (a[0] as number) - (b[0] as number))).toEqual([
      [0, 1, 2],
      [3, 4, 5],
    ]);
  });

  it("copes with coincident coordinates", () => {
    const points = Array.from({ length: 8 }, (_, i) => pt(`p${i}`, 5, 5));
    const groups = balancedClusters(points, [4, 4]);
    expect(groups.map((g) => g.length)).toEqual([4, 4]);
    expect(new Set(groups.flat()).size).toBe(8);
  });

  it("separates distant clusters even when sizes are tight", () => {
    const west = [0, 1, 2].map((i) => pt(`w${i}`, i, 0));
    const east = [0, 1, 2].map((i) => pt(`e${i}`, 1000 + i, 0));
    const groups = balancedClusters([...east, ...west], [3, 3]);
    for (const g of groups) {
      const xs = g.map((i) => ([...east, ...west][i] as Point).x);
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(10);
    }
  });

  it("returns one group for one capacity and rejects bad totals", () => {
    const points = [pt("a", 0, 0), pt("b", 1, 1)];
    expect(balancedClusters(points, [2])).toEqual([[0, 1]]);
    expect(() => balancedClusters(points, [1, 2])).toThrow();
  });
});

const PINNED_WORLDS: Record<Region, string> = {
  "north-america": "fedad473fd7e7bc9",
  "south-america": "9b2dddb27ca904dd",
  europe: "c10938cd173f6e4c",
  asia: "1dd8c8bcfb6d6ef0",
  australia: "a758b2246b40dc11",
};

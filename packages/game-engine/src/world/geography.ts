import { totalTeams } from "@fullcourt/game-rules";
import { invariant } from "@fullcourt/shared";
import type {
  CityId,
  ConferenceId,
  ConferenceSpec,
  DivisionId,
  DivisionSpec,
  LeagueStructure,
  Region,
} from "@fullcourt/game-types";
import { weighted } from "../rng/helpers";
import type { Rng } from "../rng/rng";
import { LONGITUDE_SCALE, citiesIn, findCity } from "./cities";
import { slug } from "./cities/types";

/**
 * Geography for a new league: which cities get franchises and how they fall
 * into conferences and divisions. Pure and deterministic. It uses only
 * + - * / and comparisons (never sin/cos), which IEEE-754 pins down exactly,
 * so every JavaScript engine produces the same league.
 */

export type Point = { id: CityId; x: number; y: number };

export type Placement = { conferenceId: ConferenceId; divisionId: DivisionId };

export type GeoAssignment = {
  /** The shape you asked for, with generated ids and geographic names. */
  structure: LeagueStructure;
  placements: Record<CityId, Placement>;
};

/** Picks the league's cities: the fixed ones, then weighted draws by city size. */
export function selectCities(
  rng: Rng,
  region: Region,
  count: number,
  fixed: readonly CityId[] = [],
): CityId[] {
  const catalogue = citiesIn(region);
  invariant(count <= catalogue.length, "not enough cities in the region");
  invariant(fixed.length <= count, "more fixed cities than teams");
  const chosen = [...fixed];
  const taken = new Set(chosen);
  invariant(taken.size === chosen.length, "fixed cities must be unique");
  for (const id of chosen) {
    invariant(findCity(id)?.region === region, `${id} isn't in ${region}`);
  }
  const pool = catalogue.filter((c) => !taken.has(c.id));
  while (chosen.length < count) {
    // Bigger cities are likelier; every remaining city has a chance.
    const options = pool.map((c, i) => [i, pool.length - i] as const);
    const index = weighted(rng, options);
    const [city] = pool.splice(index, 1);
    chosen.push((city as { id: CityId }).id);
  }
  return chosen;
}

const sq = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/** Farthest-point seeds, starting from the westernmost point. */
function seedCentres(points: readonly Point[], k: number) {
  let first = 0;
  points.forEach((p, i) => {
    if (p.x < (points[first] as Point).x) first = i;
  });
  const centres = [
    { x: (points[first] as Point).x, y: (points[first] as Point).y },
  ];
  while (centres.length < k) {
    let best = -1;
    let bestDistance = -1;
    points.forEach((p, i) => {
      const nearest = Math.min(...centres.map((c) => sq(p, c)));
      if (nearest > bestDistance) {
        bestDistance = nearest;
        best = i;
      }
    });
    const p = points[best] as Point;
    centres.push({ x: p.x, y: p.y });
  }
  return centres;
}

/** Fills each centre up to its capacity, nearest pairs first. */
function fillByCapacity(
  points: readonly Point[],
  centres: readonly { x: number; y: number }[],
  capacities: readonly number[],
): number[] {
  const pairs: { d: number; i: number; g: number }[] = [];
  points.forEach((p, i) =>
    centres.forEach((c, g) => pairs.push({ d: sq(p, c), i, g })),
  );
  pairs.sort((a, b) => a.d - b.d || a.i - b.i || a.g - b.g);
  const left = [...capacities];
  const assigned = new Array<number>(points.length).fill(-1);
  for (const { i, g } of pairs) {
    if (assigned[i] === -1 && (left[g] as number) > 0) {
      assigned[i] = g;
      left[g] = (left[g] as number) - 1;
    }
  }
  return assigned;
}

/** Swaps pairs between groups while that shortens total squared distance. */
function refineBySwaps(
  points: readonly Point[],
  assigned: number[],
  centres: readonly { x: number; y: number }[],
): void {
  for (let pass = 0; pass < 100; pass++) {
    let improved = false;
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const gi = assigned[i] as number;
        const gj = assigned[j] as number;
        if (gi === gj) continue;
        const pi = points[i] as Point;
        const pj = points[j] as Point;
        const before =
          sq(pi, centres[gi] as Point) + sq(pj, centres[gj] as Point);
        const after =
          sq(pi, centres[gj] as Point) + sq(pj, centres[gi] as Point);
        if (after < before - 1e-9) {
          assigned[i] = gj;
          assigned[j] = gi;
          improved = true;
        }
      }
    }
    if (!improved) return;
  }
}

/**
 * Splits points into groups of exactly the given sizes, keeping each group
 * compact: balanced k-means with farthest-point seeding and swap refinement.
 * Returns point indices per group, in the order of `capacities`.
 */
export function balancedClusters(
  points: readonly Point[],
  capacities: readonly number[],
): number[][] {
  const k = capacities.length;
  invariant(
    capacities.reduce((a, b) => a + b, 0) === points.length,
    "group sizes must add up to the number of cities",
  );
  if (k === 1) return [points.map((_, i) => i)];

  let centres = seedCentres(points, k);
  let previous = "";
  let assigned: number[] = [];
  for (let round = 0; round < 50; round++) {
    assigned = fillByCapacity(points, centres, capacities);
    refineBySwaps(points, assigned, centres);
    const key = assigned.join(",");
    if (key === previous) break;
    previous = key;
    centres = centres.map((_, g) => {
      const members = points.filter((_, i) => assigned[i] === g);
      return {
        x: members.reduce((s, p) => s + p.x, 0) / members.length,
        y: members.reduce((s, p) => s + p.y, 0) / members.length,
      };
    });
  }
  return capacities.map((_, g) =>
    points.flatMap((_, i) => (assigned[i] === g ? [i] : [])),
  );
}

type Group = { points: Point[]; cx: number; cy: number };

function toGroup(points: Point[]): Group {
  return {
    points,
    cx: points.reduce((s, p) => s + p.x, 0) / points.length,
    cy: points.reduce((s, p) => s + p.y, 0) / points.length,
  };
}

/** West to east, then north to south, then by first city id. */
function geographicOrder(groups: Group[]): Group[] {
  const firstId = (g: Group) => g.points.map((p) => p.id).sort()[0] as string;
  return [...groups].sort(
    (a, b) => a.cx - b.cx || b.cy - a.cy || (firstId(a) < firstId(b) ? -1 : 1),
  );
}

const ADJECTIVES: Record<string, string> = {
  North: "Northern",
  South: "Southern",
  East: "Eastern",
  West: "Western",
  Northeast: "Northeastern",
  Northwest: "Northwestern",
  Southeast: "Southeastern",
  Southwest: "Southwestern",
  Central: "Central",
};

const FALLBACK_NAMES = [
  "Alpha",
  "Bravo",
  "Charlie",
  "Delta",
  "Echo",
  "Foxtrot",
  "Golf",
  "Hotel",
  "India",
  "Juliet",
  "Kilo",
  "Lima",
  "Mike",
  "November",
  "Oscar",
  "Papa",
];

/**
 * Names each group by where it sits relative to its siblings' overall
 * centre: Northwest, Central, East… If two siblings would share a name, the
 * whole set falls back to Alpha, Bravo… in west-to-east order. Names are
 * display text only; ids are slugs of them, frozen once the league exists.
 */
function directionNames(
  groups: readonly Group[],
  adjective: boolean,
): string[] {
  // Compare the sibling groups' centres with each other: a direction is used
  // only along an axis where they really differ, so two groups split along a
  // diagonal can be Northeastern and Southwestern, but two groups side by
  // side are simply Western and Eastern.
  const meanX = groups.reduce((s, g) => s + g.cx, 0) / groups.length;
  const meanY = groups.reduce((s, g) => s + g.cy, 0) / groups.length;
  const spreadX =
    Math.max(...groups.map((g) => g.cx)) - Math.min(...groups.map((g) => g.cx));
  const spreadY =
    Math.max(...groups.map((g) => g.cy)) - Math.min(...groups.map((g) => g.cy));
  const main = Math.max(spreadX, spreadY);
  const useX = spreadX > 0 && spreadX >= 0.4 * main;
  const useY = spreadY > 0 && spreadY >= 0.4 * main;
  const names = groups.map((g) => {
    const dx = g.cx - meanX;
    const dy = g.cy - meanY;
    const v = useY
      ? dy > 0.25 * spreadY
        ? "North"
        : dy < -0.25 * spreadY
          ? "South"
          : ""
      : "";
    const h = useX
      ? dx > 0.25 * spreadX
        ? "East"
        : dx < -0.25 * spreadX
          ? "West"
          : ""
      : "";
    const noun = v ? v + h.toLowerCase() : h || "Central";
    return adjective ? (ADJECTIVES[noun] as string) : noun;
  });
  return new Set(names).size === names.length
    ? names
    : groups.map((_, i) => FALLBACK_NAMES[i] as string);
}

/**
 * Places the cities into the requested structure by geography. Cities are
 * first split into conferences, then each conference into divisions, always
 * into compact groups of exactly the requested sizes. A user's chosen cities
 * are just cities here: they decide where they land, never the reverse.
 */
export function assignGeography(
  region: Region,
  cityIds: readonly CityId[],
  shape: LeagueStructure,
): GeoAssignment {
  invariant(
    cityIds.length === totalTeams(shape),
    "the number of cities must match the structure",
  );
  invariant(new Set(cityIds).size === cityIds.length, "cities must be unique");
  const scale = LONGITUDE_SCALE[region];
  const points: Point[] = [...cityIds].sort().map((id) => {
    const city = findCity(id);
    invariant(city?.region === region, `${id} isn't in ${region}`);
    return { id, x: city.lonE2 * scale, y: city.latE2 };
  });

  // Bigger conferences and divisions are filled first so unequal shapes work too.
  const conferenceSpecs = [...shape.conferences].sort(
    (a, b) => conferenceSize(b) - conferenceSize(a),
  );
  const conferenceGroups = balancedClusters(
    points,
    conferenceSpecs.map(conferenceSize),
  ).map((indices, g) => ({
    spec: conferenceSpecs[g] as ConferenceSpec,
    group: toGroup(indices.map((i) => points[i] as Point)),
  }));

  const orderedConferences = geographicOrder(
    conferenceGroups.map((c) => c.group),
  );
  const conferenceNames = directionNames(orderedConferences, true);

  const placements: Record<CityId, Placement> = {};
  const conferences: ConferenceSpec[] = orderedConferences.map((group, c) => {
    const spec = conferenceGroups.find((x) => x.group === group)
      ?.spec as ConferenceSpec;
    const specs = [...spec.divisions].sort((a, b) => b.teamCount - a.teamCount);
    const divisionGroups = balancedClusters(
      group.points,
      specs.map((d) => d.teamCount),
    ).map((indices) => toGroup(indices.map((i) => group.points[i] as Point)));
    const orderedDivisions = geographicOrder(divisionGroups);
    const divisionNames = directionNames(orderedDivisions, false);

    const conferenceName = conferenceNames[c] as string;
    const conferenceId = `c-${slug(conferenceName)}`;
    const divisions: DivisionSpec[] = orderedDivisions.map((dg, d) => {
      const name = divisionNames[d] as string;
      const id = `d-${slug(conferenceName)}-${slug(name)}`;
      for (const p of dg.points) {
        placements[p.id] = { conferenceId, divisionId: id };
      }
      return { id, name, teamCount: dg.points.length };
    });
    return { id: conferenceId, name: conferenceName, divisions };
  });

  return { structure: { conferences }, placements };
}

function conferenceSize(conference: ConferenceSpec): number {
  return conference.divisions.reduce((n, d) => n + d.teamCount, 0);
}

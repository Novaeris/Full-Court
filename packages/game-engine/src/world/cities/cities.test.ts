import { createHash } from "node:crypto";
import { CITY_ID_PATTERN } from "@fullcourt/game-rules";
import { MAX_LEAGUE_TEAMS, REGIONS, type Region } from "@fullcourt/game-types";
import { describe, expect, it } from "vitest";
import { CITY_CATALOGUE, citiesIn, findCity } from "./index";

/** Rough bounding boxes (degrees) that catch swapped signs and typos. */
const BOUNDS: Record<Region, { lat: [number, number]; lon: [number, number] }> =
  {
    "north-america": { lat: [14, 60], lon: [-135, -55] },
    "south-america": { lat: [-60, 14], lon: [-85, -30] },
    europe: { lat: [34, 72], lon: [-25, 45] },
    asia: { lat: [-12, 60], lon: [25, 150] },
    australia: { lat: [-50, 0], lon: [100, 180] },
  };

describe("city catalogue", () => {
  it("has enough cities in every region for the largest league plus choice", () => {
    for (const region of REGIONS) {
      expect(citiesIn(region).length).toBeGreaterThanOrEqual(
        MAX_LEAGUE_TEAMS + 8,
      );
    }
  });

  it("gives every city a unique, well-formed, stable id", () => {
    const ids = CITY_CATALOGUE.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(CITY_ID_PATTERN);
    for (const c of CITY_CATALOGUE) expect(findCity(c.id)).toBe(c);
  });

  it("pins every id so a data edit can't silently rename a city", () => {
    for (const region of REGIONS) {
      const digest = createHash("sha256")
        .update(
          citiesIn(region)
            .map((c) => c.id)
            .join("\n"),
        )
        .digest("hex")
        .slice(0, 16);
      expect(PINNED[region], `${region} ids changed (${digest})`).toBe(digest);
    }
  });

  it("has no repeated city within a region", () => {
    for (const region of REGIONS) {
      const keys = citiesIn(region).map(
        (c) => `${c.name}|${c.subdivision}|${c.country}`,
      );
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("keeps coordinates inside the region and never across the antimeridian", () => {
    for (const c of CITY_CATALOGUE) {
      const box = BOUNDS[c.region];
      const lat = c.latE2 / 100;
      const lon = c.lonE2 / 100;
      const where = `${c.id} (${lat}, ${lon})`;
      expect(Number.isInteger(c.latE2) && Number.isInteger(c.lonE2)).toBe(true);
      expect(lat, where).toBeGreaterThanOrEqual(box.lat[0]);
      expect(lat, where).toBeLessThanOrEqual(box.lat[1]);
      expect(lon, where).toBeGreaterThanOrEqual(box.lon[0]);
      expect(lon, where).toBeLessThanOrEqual(box.lon[1]);
      expect(lon, where).toBeLessThan(180);
    }
  });

  it("numbers ranks 1..n within each region", () => {
    for (const region of REGIONS) {
      expect(citiesIn(region).map((c) => c.rank)).toEqual(
        citiesIn(region).map((_, i) => i + 1),
      );
    }
  });
});

const PINNED: Record<Region, string> = {
  "north-america": "23d79d0942ea7e43",
  "south-america": "7cf148757284e9d7",
  europe: "4f3d10d22c72ac4e",
  asia: "e26fad63a0f5edfc",
  australia: "bf63272055444f4d",
};

import type { CityId, Region } from "@fullcourt/game-types";

/**
 * A catalogue city. Coordinates are integers in hundredths of a degree
 * (about 1 km), so geometry is exact and identical on every platform.
 * `rank` is the city's place in its region's list, biggest first.
 */
export type CatalogCity = {
  id: CityId;
  region: Region;
  name: string;
  country: string;
  subdivision: string;
  latE2: number;
  lonE2: number;
  rank: number;
};

/** Source row: name, ISO country code, state/province, latitude, longitude. */
export type CityRow = readonly [
  name: string,
  country: string,
  subdivision: string,
  lat: number,
  lon: number,
];

/** Lowercase ASCII slug, so ids stay readable and stable. */
export function slug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const PREFIX: Record<Region, string> = {
  "north-america": "na",
  "south-america": "sa",
  europe: "eu",
  asia: "as",
  australia: "au",
};

/**
 * Builds a region's cities from compact rows. The id is
 * region-country-name and never changes once released, even if the display
 * name is corrected (a test pins every id).
 */
export function defineCities(
  region: Region,
  rows: readonly CityRow[],
): readonly CatalogCity[] {
  return rows.map(([name, country, subdivision, lat, lon], i) => ({
    id: `${PREFIX[region]}-${country.toLowerCase()}-${slug(name)}`,
    region,
    name,
    country,
    subdivision,
    latE2: Math.round(lat * 100),
    lonE2: Math.round(lon * 100),
    rank: i + 1,
  }));
}

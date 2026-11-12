import { REGIONS, type CityId, type Region } from "@fullcourt/game-types";
import { ASIA } from "./asia";
import { AUSTRALIA } from "./australia";
import { EUROPE } from "./europe";
import { NORTH_AMERICA } from "./north-america";
import { SOUTH_AMERICA } from "./south-america";
import type { CatalogCity } from "./types";

export type { CatalogCity } from "./types";

const BY_REGION: Record<Region, readonly CatalogCity[]> = {
  "north-america": NORTH_AMERICA,
  "south-america": SOUTH_AMERICA,
  europe: EUROPE,
  asia: ASIA,
  australia: AUSTRALIA,
};

/** Every catalogue city: version-controlled data with stable ids. */
export const CITY_CATALOGUE: readonly CatalogCity[] = REGIONS.flatMap(
  (region) => BY_REGION[region],
);

const BY_ID = new Map<CityId, CatalogCity>(
  CITY_CATALOGUE.map((c) => [c.id, c]),
);

export function citiesIn(region: Region): readonly CatalogCity[] {
  return BY_REGION[region];
}

export function findCity(id: CityId): CatalogCity | undefined {
  return BY_ID.get(id);
}

/**
 * Longitude scale for flat distance in a region, about cos(mid-latitude).
 * Fixed constants, so no trigonometry runs at generation time.
 */
export const LONGITUDE_SCALE: Record<Region, number> = {
  "north-america": 0.75,
  "south-america": 0.9,
  europe: 0.65,
  asia: 0.85,
  australia: 0.82,
};

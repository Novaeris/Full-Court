import { describe, expect, it } from "vitest";
import { OTHER_ROUTE, routePattern } from "./routes";

const ID = "6f1d2c3b-4a5e-4f60-8a71-b2c3d4e5f607";

describe("routePattern", () => {
  it("keeps static pages", () => {
    expect(routePattern("/")).toBe("/");
    expect(routePattern("/leagues/new")).toBe("/leagues/new");
    expect(routePattern("/privacy?x=1#top")).toBe("/privacy");
    expect(routePattern("/modes")).toBe("/modes");
  });

  it("replaces ids with route parameters", () => {
    expect(routePattern(`/leagues/${ID}`)).toBe("/leagues/[leagueId]");
    expect(routePattern(`/leagues/${ID}/teams/${ID}`)).toBe(
      "/leagues/[leagueId]/teams/[teamId]",
    );
  });

  it("collapses unknown paths and non-id parameters", () => {
    expect(routePattern("/wp-admin")).toBe(OTHER_ROUTE);
    expect(routePattern("/leagues/not-an-id")).toBe(OTHER_ROUTE);
    expect(routePattern(`/leagues/${ID}/secret`)).toBe(OTHER_ROUTE);
  });
});

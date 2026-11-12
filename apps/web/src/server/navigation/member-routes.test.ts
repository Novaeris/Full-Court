import { describe, expect, it } from "vitest";
import { IN_GAME_PAGES, memberRoute } from "./member-routes";

describe("memberRoute", () => {
  it("leaves visitors on the public site", () => {
    expect(memberRoute("/", false)).toBeNull();
    expect(memberRoute("/privacy", false)).toBeNull();
    expect(memberRoute("/modes", false)).toBeNull();
  });

  it("sends members from the landing page to Game Mode Selection", () => {
    expect(memberRoute("/", true)).toEqual({
      type: "redirect",
      pathname: "/modes",
    });
  });

  it.each(IN_GAME_PAGES)("shows %s to members inside the game", (path) => {
    expect(memberRoute(path, true)).toEqual({
      type: "rewrite",
      pathname: `/in-game${path}`,
    });
  });

  it("leaves other pages alone", () => {
    for (const path of ["/modes", "/leagues", "/login", "/privacy/x"]) {
      expect(memberRoute(path, true)).toBeNull();
    }
  });

  it("never serves the internal copies directly", () => {
    for (const signedIn of [true, false]) {
      expect(memberRoute("/in-game/privacy", signedIn)).toEqual({
        type: "redirect",
        pathname: "/privacy",
      });
      expect(memberRoute("/in-game", signedIn)).toEqual({
        type: "redirect",
        pathname: "/",
      });
    }
    expect(memberRoute("/in-gamex", true)).toBeNull();
  });
});

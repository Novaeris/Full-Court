import { expect, test } from "@playwright/test";
import { buildSync } from "esbuild";
import * as Node from "../packages/game-engine/src/index";

/**
 * A game is stored as a recipe and replayed on whatever device watches it, so
 * the simulation has to give identical results in every JavaScript engine. This
 * runs the real engine, bundled for the browser, in the engine of the project it
 * runs in (V8 in Chromium, SpiderMonkey in Firefox, JavaScriptCore in desktop
 * and iPhone Safari) and compares it with Node, play for play.
 *
 * It is not a test of a physical phone, but every iPhone browser runs
 * JavaScriptCore and Android's Chrome runs V8. React Native's Hermes is not
 * covered: the engine is built to need nothing beyond exact IEEE arithmetic
 * (see packages/game-engine/src/rng/dmath.ts), so it should agree.
 */

type Engine = typeof Node;
type Team = { id: string; strategy: object; players: unknown[] };

const GAMES = 300;

function teamsFor(seed: string): Team[] {
  const world = Node.generateWorld({ seed, size: "standard" });
  return world.teams.map((t) => ({
    id: t.abbreviation,
    strategy: {
      pace: "normal",
      threePointFocus: "normal",
      defense: "balanced",
    },
    players: world.players
      .filter((p) => p.team === t.abbreviation)
      .map((p, i) => ({
        id: `${t.abbreviation}-${i + 1}`,
        position: p.position,
        overall: p.overall,
        ratings: p.ratings,
      })),
  }));
}

/**
 * Plays games and fingerprints each one's plays, score and ending RNG state.
 * The same source runs in Node and in the browser, so it uses no imports.
 */
const runGames = (FC: Engine, teams: Team[], n: number): string[] => {
  const fingerprint = (text: string) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  };
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const home = teams[i % 30] as Team;
    let k = (i * 7 + 3) % 30;
    if (k === i % 30) k = (k + 1) % 30;
    const away = teams[k] as Team;
    const rng = FC.createRng(FC.seedState(`ref-${i}`));
    const result = FC.simulateGame(
      {
        id: `g${i}`,
        day: 1,
        homeTeamId: home.id,
        awayTeamId: away.id,
        status: "scheduled",
        homeScore: null,
        awayScore: null,
        overtimes: 0,
      },
      home as never,
      away as never,
      rng,
    );
    out.push(
      `${fingerprint(JSON.stringify(result.plays))}:${result.game.homeScore}-${result.game.awayScore}:${rng.state().join(",")}`,
    );
  }
  return out;
};

/** The simulation's own arithmetic, over many inputs. Must match to the last bit. */
const exactMath = (FC: Engine): number[][] => {
  let s = 12345;
  const next = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const N = 20000;
  const angles = Array.from({ length: N }, () => next() * Math.PI);
  const bases = Array.from({ length: N }, () => next() * 100);
  const rng = FC.createRng(FC.seedState("exact-math"));
  return [
    angles.map((x) => FC.exactSin(x)),
    angles.map((x) => FC.exactCos(x)),
    bases.map((x) => FC.exactPow15(x)),
    Array.from({ length: N }, () => FC.normalSum(rng, 15, 3)),
  ];
};

test("this browser engine plays games exactly as Node does", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const teams = teamsFor("determinism");
  const reference = {
    games: runGames(Node, teams, GAMES),
    math: exactMath(Node),
  };

  const bundle = buildSync({
    stdin: {
      contents: 'export * from "./packages/game-engine/src/index";',
      resolveDir: process.cwd(),
      loader: "ts",
    },
    bundle: true,
    format: "iife",
    globalName: "FC",
    write: false,
    platform: "browser",
  }).outputFiles[0]?.text as string;

  await page.setContent("<html><body></body></html>");
  await page.addScriptTag({ content: bundle });
  testInfo.annotations.push({
    type: "engine",
    description: await page.evaluate(() => navigator.userAgent),
  });

  const result = await page.evaluate(
    ([gamesSource, mathSource, teamData, n]) => {
      const FC = (window as unknown as { FC: unknown }).FC;
      const run = new Function(
        "FC",
        "teams",
        "n",
        `return (${gamesSource})(FC, teams, n)`,
      );
      const math = new Function("FC", `return (${mathSource})(FC)`);
      return { games: run(FC, teamData, n), math: math(FC) };
    },
    [runGames.toString(), exactMath.toString(), teams, GAMES] as const,
  );

  // Every game identical, play for play, and the RNG ends in the same place.
  const mismatched = reference.games.filter((g, i) => g !== result.games[i]);
  expect(mismatched, `${mismatched.length} of ${GAMES} games differ`).toEqual(
    [],
  );
  // And the arithmetic underneath is identical to the last bit.
  expect(result.math).toEqual(reference.math);
});

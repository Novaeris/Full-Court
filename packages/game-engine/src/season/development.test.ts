import { RATING_KEYS, type Ratings } from "@fullcourt/game-types";
import {
  IN_SEASON_SHARE,
  computeOverall,
  expectedChange,
} from "@fullcourt/game-rules";
import { describe, expect, it } from "vitest";
import { createRng, seedState } from "../rng/rng";
import { developPlayers, type DevelopingPlayer } from "./development";

function player(
  id: string,
  age: number,
  base = 60,
  potential = 80,
): DevelopingPlayer {
  const ratings = Object.fromEntries(
    RATING_KEYS.map((k) => [k, base]),
  ) as Ratings;
  return {
    id,
    position: "SF",
    age,
    ratings,
    overall: computeOverall("SF", ratings),
    potential,
  };
}

const many = (age: number, n: number, base = 60, potential = 80) =>
  Array.from({ length: n }, (_, i) => player(`p${i}`, age, base, potential));

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe("developPlayers", () => {
  it("is the same every time for the same seed, and different for another", () => {
    const players = many(22, 40);
    const a = developPlayers(createRng(seedState("x")), players);
    expect(developPlayers(createRng(seedState("x")), players)).toEqual(a);
    expect(developPlayers(createRng(seedState("y")), players)).not.toEqual(a);
  });

  it("changes ratings and overall, never age or potential", () => {
    const [p] = many(22, 1);
    const out = developPlayers(createRng(seedState("1")), many(22, 50));
    expect(out.length).toBeGreaterThan(0);
    for (const d of out) {
      expect(Object.keys(d).sort()).toEqual(["id", "overall", "ratings"]);
      expect(d.overall).toBe(computeOverall("SF", d.ratings));
    }
    expect(p).toBeDefined();
  });

  it("the young improve and the old decline, in line with the offseason's curve", () => {
    const rng = createRng(seedState("curve"));
    const change = (age: number) => {
      const players = many(age, 600, 60, 90);
      const out = new Map(
        developPlayers(rng, players).map((d) => [d.id, d.overall]),
      );
      return mean(players.map((p) => (out.get(p.id) ?? p.overall) - p.overall));
    };
    expect(change(20)).toBeGreaterThan(0.2);
    expect(change(35)).toBeLessThan(-0.1);
    // A step is a small share of a year's expected change.
    const share = IN_SEASON_SHARE / 2;
    expect(Math.abs(change(20) - expectedChange(20) * share)).toBeLessThan(
      0.25,
    );
  });

  it("does not take a young player far past his potential", () => {
    const rng = createRng(seedState("cap"));
    const players = many(21, 400, 70, 70);
    for (const d of developPlayers(rng, players)) {
      expect(d.overall).toBeLessThanOrEqual(70 + 3);
    }
  });

  it("treats a player the same whoever he plays for (nothing but his own numbers matter)", () => {
    const a = developPlayers(createRng(seedState("same")), [player("a", 24)]);
    const b = developPlayers(createRng(seedState("same")), [player("b", 24)]);
    expect(a.map(({ id: _i, ...rest }) => rest)).toEqual(
      b.map(({ id: _i, ...rest }) => rest),
    );
  });
});

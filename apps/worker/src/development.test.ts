import type { DevelopingPlayer } from "@fullcourt/game-engine";
import { RATING_KEYS, type Ratings } from "@fullcourt/game-types";
import { computeOverall } from "@fullcourt/game-rules";
import { describe, expect, it } from "vitest";
import {
  developmentStep,
  runDevelopmentStep,
  type DevelopmentStore,
} from "./development";

const player = (id: string, age: number): DevelopingPlayer => {
  const ratings = Object.fromEntries(
    RATING_KEYS.map((k) => [k, 55]),
  ) as Ratings;
  return {
    id,
    position: "PG",
    age,
    ratings,
    overall: computeOverall("PG", ratings),
    potential: 80,
  };
};

const season = { id: "s", league_id: "league", year: 2030 };

function store(players: DevelopingPlayer[]) {
  const applied: { step: number; changes: Record<string, unknown>[] }[] = [];
  const db: DevelopmentStore = {
    loadDevelopingPlayers: async () => players,
    applyDevelopment: async (_id, step, changes) => {
      applied.push({ step, changes });
      return changes.length;
    },
  };
  return { db, applied };
}

describe("developmentStep", () => {
  it("is a step on its days only", () => {
    expect(developmentStep(30, 90)).toBe(1);
    expect(developmentStep(60, 90)).toBe(2);
    expect(developmentStep(45, 90)).toBeNull();
  });
});

describe("runDevelopmentStep", () => {
  const players = Array.from({ length: 60 }, (_, i) =>
    player(`p${String(i).padStart(2, "0")}`, 19 + (i % 15)),
  );

  it("sends changes in the database's own column names", async () => {
    const { db, applied } = store(players);
    const n = await runDevelopmentStep(db, season, 1);
    expect(n).toBeGreaterThan(0);
    expect(applied[0]?.step).toBe(1);
    const row = applied[0]?.changes[0] as Record<string, unknown>;
    expect(Object.keys(row).sort()).toEqual(
      [
        "id",
        "overall",
        "inside",
        "mid_range",
        "three_point",
        "free_throw",
        "passing",
        "ball_handling",
        "off_rebound",
        "def_rebound",
        "perimeter_d",
        "interior_d",
        "speed",
        "strength",
        "stamina",
      ].sort(),
    );
  });

  it("gives the same step every time, whatever order the players are loaded in", async () => {
    const a = store(players);
    const b = store([...players].reverse());
    await runDevelopmentStep(a.db, season, 1);
    await runDevelopmentStep(b.db, season, 1);
    expect(b.applied).toEqual(a.applied);
  });

  it("gives each step, league and year its own luck", async () => {
    const one = store(players);
    const two = store(players);
    const other = store(players);
    await runDevelopmentStep(one.db, season, 1);
    await runDevelopmentStep(two.db, season, 2);
    await runDevelopmentStep(other.db, { ...season, year: 2031 }, 1);
    expect(two.applied[0]?.changes).not.toEqual(one.applied[0]?.changes);
    expect(other.applied[0]?.changes).not.toEqual(one.applied[0]?.changes);
  });
});

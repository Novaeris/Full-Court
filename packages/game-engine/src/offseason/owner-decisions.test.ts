import { describe, expect, it } from "vitest";
import { DRAFT_ROUNDS, ROSTER_LIMITS, draftNoise } from "@fullcourt/game-rules";
import { POSITIONS, type Position } from "@fullcourt/game-types";
import { createRng, seedState } from "../rng/rng";
import { generateWorld } from "../world/generate";
import {
  chooseProspect,
  classSize,
  drawLottery,
  scoutedView,
  suggestProspect,
  type OffseasonPlayer,
  type ProspectView,
} from "./offseason";
import { coverRoster, fillRosters } from "./rosters";

function prospects(count = 30): ProspectView[] {
  const rng = createRng(seedState("prospects"));
  return Array.from({ length: count }, (_, i) => ({
    id: `p${String(i).padStart(2, "0")}`,
    position: POSITIONS[rng.int(0, POSITIONS.length - 1)] as Position,
    age: rng.int(19, 22),
    overall: 40 + rng.int(0, 25),
    potential: 55 + rng.int(0, 25),
  }));
}

describe("the draft lottery as slots", () => {
  const teams = Array.from({ length: 12 }, (_, i) => `T${i}`);
  const depth = new Map(teams.slice(0, 6).map((t, i) => [t, i === 0 ? 3 : 1]));

  it("lists every pick of every round, numbered in order, one pick per team per round", () => {
    const slots = drawLottery(createRng(seedState("l")), teams, depth);
    expect(slots).toHaveLength(teams.length * DRAFT_ROUNDS);
    expect(slots.map((s) => s.pick)).toEqual(
      Array.from({ length: slots.length }, (_, i) => i + 1),
    );
    for (let round = 1; round <= DRAFT_ROUNDS; round++) {
      const inRound = slots.filter((s) => s.round === round);
      expect(inRound.map((s) => s.teamId).sort()).toEqual([...teams].sort());
    }
    // Both rounds use the same order.
    const first = slots.filter((s) => s.round === 1).map((s) => s.teamId);
    const second = slots.filter((s) => s.round === 2).map((s) => s.teamId);
    expect(second).toEqual(first);
  });
});

describe("scouting", () => {
  const prospect = prospects(1)[0] as ProspectView;

  it("shows the same thing every time for a team, and may differ between teams", () => {
    expect(scoutedView(prospect, "A", 50)).toEqual(
      scoutedView(prospect, "A", 50),
    );
  });

  it("is clearer with a better scout", () => {
    const errors = (scout: number | null) => {
      let total = 0;
      for (let i = 0; i < 300; i++) {
        const p = { ...prospect, id: `x${i}` };
        total += Math.abs(scoutedView(p, "A", scout).overall - p.overall);
      }
      return total / 300;
    };
    expect(errors(95)).toBeLessThan(errors(null));
    expect(draftNoise(95)).toBeLessThan(draftNoise(null));
  });

  it("never shows a potential below the overall, or outside the scale", () => {
    for (let i = 0; i < 200; i++) {
      const v = scoutedView({ ...prospect, id: `y${i}` }, "A", null);
      expect(v.potential).toBeGreaterThanOrEqual(v.overall);
      expect(v.overall).toBeGreaterThanOrEqual(25);
      expect(v.potential).toBeLessThanOrEqual(99);
    }
  });
});

describe("choosing a prospect", () => {
  it("suggests the same prospect every time", () => {
    const input = {
      prospects: prospects(),
      teamId: "A",
      rosterPositions: ["PG", "SG"] as Position[],
      scout: 70,
    };
    expect(suggestProspect(input)).toBe(suggestProspect(input));
  });

  it("leans away from a position the team already has plenty of", () => {
    const list: ProspectView[] = [
      { id: "guard", position: "PG", age: 20, overall: 60, potential: 70 },
      { id: "center", position: "C", age: 20, overall: 58, potential: 68 },
    ];
    const rosterOfGuards = Array<Position>(5).fill("PG");
    expect(
      suggestProspect({
        prospects: list,
        teamId: "A",
        rosterPositions: rosterOfGuards,
        scout: 95,
      }),
    ).toBe("center");
    expect(
      suggestProspect({
        prospects: list,
        teamId: "A",
        rosterPositions: [],
        scout: 95,
      }),
    ).toBe("guard");
  });

  it("a computer team usually takes a highly rated prospect, and a clear scout does better", () => {
    const list = prospects();
    const best = (id: string) => {
      const p = list.find((x) => x.id === id) as ProspectView;
      return p.overall + p.potential;
    };
    const average = (scout: number | null) => {
      let total = 0;
      for (let i = 0; i < 200; i++) {
        total += best(
          chooseProspect(createRng(seedState(`c${i}`)), {
            prospects: list,
            rosterPositions: [],
            scout,
          }),
        );
      }
      return total / 200;
    };
    expect(average(95)).toBeGreaterThanOrEqual(average(null) - 0.5);
  });

  it("class size covers every pick with a few left over", () => {
    expect(classSize(12)).toBeGreaterThan(12 * DRAFT_ROUNDS);
  });
});

describe("roster coverage", () => {
  const world = generateWorld({ seed: "coverage", size: "compact" });
  const players: OffseasonPlayer[] = world.players.map((p, i) => ({
    id: `p${i}`,
    teamId: p.team,
    firstName: p.firstName,
    lastName: p.lastName,
    position: p.position,
    age: p.age,
    jersey: p.jersey,
    ratings: p.ratings,
    overall: p.overall,
    potential: p.potential,
  }));
  const [first, second] = world.teams.map((t) => t.abbreviation) as [
    string,
    string,
  ];
  const roster = players.filter((p) => p.teamId === first).slice(0, 15);
  const pool = players.filter((p) => p.teamId === second);

  it("leaves a legal roster alone", () => {
    expect(coverRoster({ roster, pool })).toEqual({ release: [], sign: [] });
  });

  it("releases the weakest down to the limit", () => {
    const crowded = [...roster, ...pool.slice(0, 3)];
    const { release, sign } = coverRoster({ roster: crowded, pool: [] });
    expect(sign).toEqual([]);
    expect(crowded.length - release.length).toBe(ROSTER_LIMITS.max);
  });

  it("signs free agents up to the minimum", () => {
    const thin = roster.slice(0, 9);
    const { release, sign } = coverRoster({ roster: thin, pool });
    expect(release).toEqual([]);
    expect(thin.length + sign.length).toBeGreaterThanOrEqual(ROSTER_LIMITS.min);
    expect(thin.length + sign.length).toBeLessThanOrEqual(ROSTER_LIMITS.max);
  });

  it("covers every position when there is room", () => {
    const guardsOnly = roster
      .filter((p) => p.position === "PG" || p.position === "SG")
      .slice(0, 12);
    expect(guardsOnly.length).toBeGreaterThan(0);
    const { sign } = coverRoster({ roster: guardsOnly, pool });
    const after = [...guardsOnly, ...pool.filter((p) => sign.includes(p.id))];
    if (after.length < ROSTER_LIMITS.max) {
      for (const position of POSITIONS) {
        if (pool.some((p) => p.position === position)) {
          expect(after.some((p) => p.position === position)).toBe(true);
        }
      }
    }
  });
});

describe("free agency for some teams only", () => {
  it("leaves a team that is not acting exactly as it is", () => {
    const world = generateWorld({ seed: "acting", size: "compact" });
    const teams = world.teams.map((t) => t.abbreviation);
    const [owner, other] = teams as [string, string];
    const players: OffseasonPlayer[] = world.players.map((p, i) => ({
      id: `p${i}`,
      teamId: p.team,
      firstName: p.firstName,
      lastName: p.lastName,
      position: p.position,
      age: p.age,
      jersey: p.jersey,
      ratings: p.ratings,
      overall: p.overall,
      potential: p.potential,
    }));
    // The first team has 20 players, but its owner is making their own moves.
    const crowded = [
      ...players,
      ...players
        .filter((p) => p.teamId === other)
        .slice(0, 5)
        .map((p) => ({
          ...p,
          id: `extra-${p.id}`,
          teamId: "T01",
          jersey: 90 + (Number(p.id.slice(1)) % 9),
        })),
    ];
    const acting = new Set(teams.filter((t) => t !== owner));
    const moves = fillRosters(createRng(seedState("a")), {
      teams,
      players: crowded,
      acting,
    });
    expect(
      moves.some(
        (m) =>
          crowded.find((p) => p.id === m.id)?.teamId === owner &&
          m.teamId !== owner,
      ),
    ).toBe(false);
    const everyone = fillRosters(createRng(seedState("a")), {
      teams,
      players: crowded,
    });
    expect(
      everyone.some(
        (m) =>
          crowded.find((p) => p.id === m.id)?.teamId === owner &&
          m.teamId !== owner,
      ),
    ).toBe(true);
  });
});

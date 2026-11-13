import { describe, expect, it } from "vitest";
import {
  DRAFT_ROUNDS,
  ROSTER_LIMITS,
  computeOverall,
} from "@fullcourt/game-rules";
import { createRng, seedState } from "../rng/rng";
import { generateWorld } from "../world/generate";
import {
  draftOrder,
  progress,
  runOffseason,
  type OffseasonPlayer,
  type OffseasonResult,
} from "./offseason";

/** A real generated league, as the offseason sees it. */
function league(size: "compact" | "standard" = "compact") {
  const world = generateWorld({ seed: "offseason-test", size });
  const teams = world.teams.map((t) => t.abbreviation);
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
  return { teams, players };
}

/** Plays years of offseasons the way the server does. */
function simulateYears(
  years: number,
  size: "compact" | "standard" = "compact",
) {
  const { teams, players: start } = league(size);
  let players = start;
  let next = players.length;
  const rng = createRng(seedState("offseason-years"));
  const history: OffseasonResult[][] = [];
  for (let y = 0; y < years; y++) {
    const out = runOffseason(rng, {
      standingsOrder: teams,
      playoffTeams: new Set(teams.slice(0, Math.ceil(teams.length / 2))),
      players,
      takenNames: new Set(players.map((p) => `${p.firstName} ${p.lastName}`)),
    });
    history.push(out.players);
    players = out.players
      .filter((p) => !p.retired)
      .map((p) => ({
        id: p.id ?? `p${next++}`,
        teamId: p.teamId,
        firstName: p.firstName,
        lastName: p.lastName,
        position: p.position,
        age: p.age,
        jersey: p.jersey,
        ratings: p.ratings,
        overall: p.overall,
        potential: p.potential,
      }));
  }
  return { teams, players, history };
}

describe("progress", () => {
  const young = league().players.find((p) => p.age <= 21) as OffseasonPlayer;
  const old = league().players.find((p) => p.age >= 33) as OffseasonPlayer;

  it("ages a player a year and keeps ratings legal and consistent", () => {
    const next = progress(createRng(seedState("a")), young);
    expect(next.age).toBe(young.age + 1);
    expect(next.overall).toBe(computeOverall(young.position, next.ratings));
    for (const v of Object.values(next.ratings)) {
      expect(v).toBeGreaterThanOrEqual(25);
      expect(v).toBeLessThanOrEqual(99);
    }
    expect(next.potential).toBeGreaterThanOrEqual(next.overall);
  });

  it("is the same for the same seed", () => {
    expect(progress(createRng(seedState("a")), young)).toEqual(
      progress(createRng(seedState("a")), young),
    );
  });

  it("young players improve on average and old players decline", () => {
    let youngChange = 0;
    let oldChange = 0;
    const rng = createRng(seedState("avg"));
    for (let i = 0; i < 400; i++) {
      youngChange += progress(rng, young).overall - young.overall;
      oldChange += progress(rng, old).overall - old.overall;
    }
    expect(youngChange / 400).toBeGreaterThan(1);
    expect(oldChange / 400).toBeLessThan(-0.5);
  });
});

describe("draftOrder", () => {
  const teams = Array.from({ length: 12 }, (_, i) => `T${i}`); // best first
  const playoffs = new Set(teams.slice(0, 6));

  it("lists every team once, non-playoff teams before playoff teams", () => {
    const order = draftOrder(createRng(seedState("d")), teams, playoffs);
    expect([...order].sort()).toEqual([...teams].sort());
    expect(order.slice(0, 6).every((t) => !playoffs.has(t))).toBe(true);
    // After the lottery picks, the rest are worst-first.
    expect(order.slice(4, 6)).toEqual(
      order.slice(4, 6).sort((a, b) => teams.indexOf(b) - teams.indexOf(a)),
    );
    expect(order.slice(6)).toEqual(["T5", "T4", "T3", "T2", "T1", "T0"]);
  });

  it("gives the worst team the first pick more often than the best lottery team", () => {
    const wins = { worst: 0, best: 0 };
    for (let i = 0; i < 600; i++) {
      const first = draftOrder(
        createRng(seedState(`l${i}`)),
        teams,
        playoffs,
      )[0];
      if (first === "T11") wins.worst += 1;
      if (first === "T6") wins.best += 1;
    }
    expect(wins.worst).toBeGreaterThan(wins.best * 2);
  });
});

describe("runOffseason", () => {
  it("is deterministic", () => {
    const run = () => {
      const { teams, players } = league();
      return runOffseason(createRng(seedState("same")), {
        standingsOrder: teams,
        playoffTeams: new Set(teams.slice(0, 6)),
        players,
        takenNames: new Set(),
      });
    };
    expect(run()).toEqual(run());
  });

  it("fills every team to the roster limit, with the draft done", () => {
    const { teams, players, history } = simulateYears(1);
    for (const team of teams) {
      expect(players.filter((p) => p.teamId === team)).toHaveLength(
        ROSTER_LIMITS.max,
      );
    }
    const drafted = (history[0] as OffseasonResult[]).filter((p) => p.draft);
    expect(drafted).toHaveLength(teams.length * DRAFT_ROUNDS);
    expect(
      drafted.map((p) => p.draft?.pick).sort((a, b) => (a ?? 0) - (b ?? 0)),
    ).toEqual(Array.from({ length: drafted.length }, (_, i) => i + 1));
    // Each team drafted once per round.
    for (const team of teams) {
      expect(drafted.filter((p) => p.draft?.teamId === team)).toHaveLength(
        DRAFT_ROUNDS,
      );
    }
  });

  it("never gives two players on a team the same number, or two players the same name", () => {
    const { teams, players } = simulateYears(3);
    for (const team of teams) {
      const numbers = players
        .filter((p) => p.teamId === team)
        .map((p) => p.jersey);
      expect(new Set(numbers).size).toBe(numbers.length);
    }
    const names = players.map((p) => `${p.firstName} ${p.lastName}`);
    expect(new Set(names).size).toBe(names.length);
  });

  it("only retires players who have a reason, and nobody older than 40 plays", () => {
    const { history, players } = simulateYears(8);
    for (const year of history) {
      for (const p of year.filter((r) => r.retired)) {
        expect(p.age >= 31 || p.overall < 45 || p.teamId === null).toBe(true);
      }
    }
    expect(Math.max(...players.map((p) => p.age))).toBeLessThan(40);
  });

  it("keeps the league's talent steady over 25 years", () => {
    const { players, teams } = simulateYears(25);
    const rostered = players.filter((p) => p.teamId);
    const mean = rostered.reduce((s, p) => s + p.overall, 0) / rostered.length;
    expect(mean).toBeGreaterThan(50);
    expect(mean).toBeLessThan(68);
    expect(rostered).toHaveLength(teams.length * ROSTER_LIMITS.max);
    const stars = rostered.filter((p) => p.overall >= 75).length;
    expect(stars).toBeGreaterThan(0);
  });

  it("keeps the number of players in the pool bounded", () => {
    const { players } = simulateYears(25);
    // Rosters, the pool, and the picks released straight after a draft.
    expect(players.length).toBeLessThanOrEqual(
      12 * 15 + 12 * 2 + 12 * DRAFT_ROUNDS,
    );
  });

  it("keeps every draft pick on the books, every year", () => {
    const { history, teams } = simulateYears(15);
    for (const year of history) {
      expect(year.filter((p) => p.draft)).toHaveLength(
        teams.length * DRAFT_ROUNDS,
      );
      expect(year.filter((p) => p.draft && p.retired)).toHaveLength(0);
    }
  });
});

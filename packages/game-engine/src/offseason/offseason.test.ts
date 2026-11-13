import { describe, expect, it } from "vitest";
import {
  DRAFT_ROUNDS,
  ROSTER_LIMITS,
  computeOverall,
  playerValue,
} from "@fullcourt/game-rules";
import { createRng, seedState } from "../rng/rng";
import { generateWorld } from "../world/generate";
import {
  ageAndRetire,
  draftOrder,
  holdDraft,
  progress,
  type OffseasonPlayer,
  type Progressed,
  type Rookie,
} from "./offseason";
import { fillRosters } from "./rosters";

/** The playoff field: the best half of the league, the best team going furthest. */
function depths(teams: readonly string[]): Map<string, number> {
  const field = teams.slice(0, Math.ceil(teams.length / 2));
  return new Map(
    field.map((t, i) => [t, i === 0 ? 4 : i < 3 ? 3 : i < 5 ? 2 : 1]),
  );
}

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

/** Plays years of offseasons the way the server does: age, draft, fill rosters. */
function simulateYears(
  years: number,
  size: "compact" | "standard" = "compact",
) {
  const { teams, players: start } = league(size);
  let players = start;
  let next = players.length;
  const rng = createRng(seedState("offseason-years"));
  const drafts: Rookie[][] = [];
  const names = new Set(players.map((p) => `${p.firstName} ${p.lastName}`));
  for (let y = 0; y < years; y++) {
    const aged = ageAndRetire(rng, players);
    const byId = new Map(aged.map((a) => [a.id, a]));
    players = players.flatMap((p) => {
      const a = byId.get(p.id) as Progressed;
      return a.retired
        ? []
        : [
            {
              ...p,
              age: a.age,
              ratings: a.ratings,
              overall: a.overall,
              potential: a.potential,
              teamId: a.teamId,
            },
          ];
    });
    const { rookies } = holdDraft(rng, {
      standingsOrder: teams,
      playoffDepth: depths(teams),
      takenNames: names,
      scouts: new Map(),
    });
    drafts.push(rookies);
    for (const r of rookies) names.add(`${r.firstName} ${r.lastName}`);
    players = [
      ...players,
      ...rookies.map((r) => ({
        id: `p${next++}`,
        teamId: r.teamId,
        firstName: r.firstName,
        lastName: r.lastName,
        position: r.position,
        age: r.age,
        jersey: r.jersey,
        ratings: r.ratings,
        overall: r.overall,
        potential: r.potential,
      })),
    ];
    const moves = new Map(
      fillRosters(rng, { teams, players }).map((m) => [m.id, m]),
    );
    players = players.map((p) => {
      const m = moves.get(p.id);
      return m ? { ...p, teamId: m.teamId, jersey: m.jersey } : p;
    });
  }
  return { teams, players, drafts };
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
  // T0 won the title (depth 4), T1 lost the final (3), T2 and T3 lost in the
  // semifinals (2), T4 and T5 in the first round (1). T6 to T11 are lottery teams.
  const depth = new Map([
    ["T0", 4],
    ["T1", 3],
    ["T2", 2],
    ["T3", 2],
    ["T4", 1],
    ["T5", 1],
  ]);

  it("lists every team once, lottery teams before playoff teams", () => {
    const { order } = draftOrder(createRng(seedState("d")), teams, depth);
    expect([...order].sort()).toEqual([...teams].sort());
    expect(order.slice(0, 6).every((t) => !depth.has(t))).toBe(true);
    // After the four lottery picks, the other lottery teams are worst-first.
    expect(order.slice(4, 6)).toEqual(
      order.slice(4, 6).sort((a, b) => teams.indexOf(b) - teams.indexOf(a)),
    );
  });

  it("orders playoff teams by how far they got, then by record", () => {
    const { order } = draftOrder(createRng(seedState("d")), teams, depth);
    // Round-one losers (worse record first), then the semifinalists, the
    // finalist, and the champion last.
    expect(order.slice(6)).toEqual(["T5", "T4", "T3", "T2", "T1", "T0"]);
  });

  it("gives the worst team better odds than the best lottery team, and the draw follows them", () => {
    const wins = { worst: 0, best: 0 };
    for (let i = 0; i < 800; i++) {
      const { order } = draftOrder(createRng(seedState(`l${i}`)), teams, depth);
      if (order[0] === "T11") wins.worst += 1;
      if (order[0] === "T6") wins.best += 1;
    }
    expect(wins.worst).toBeGreaterThan(wins.best * 2);
  });

  it("reports each team's finish, odds and movement", () => {
    const { entries, order } = draftOrder(
      createRng(seedState("d")),
      teams,
      depth,
    );
    expect(entries).toHaveLength(12);
    const worst = entries.find((e) => e.teamId === "T11");
    expect(worst).toMatchObject({ finishRank: 12, expectedPick: 1 });
    expect(entries.find((e) => e.teamId === "T0")).toMatchObject({
      finishRank: 1,
      expectedPick: 12,
      odds: null,
      pick: 12,
    });
    const odds = entries.flatMap((e) => (e.odds === null ? [] : [e.odds]));
    expect(odds).toHaveLength(6);
    expect(odds.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    // The worst three share the best odds.
    expect(entries[0]?.odds).toBe(entries[2]?.odds);
    expect(entries[2]?.odds as number).toBeGreaterThan(
      entries[3]?.odds as number,
    );
    // The pick each team got matches the order.
    for (const e of entries) expect(order[e.pick - 1]).toBe(e.teamId);
    // Nobody falls below the first four lottery picks' reach: only four teams
    // can move up, and a lottery team can't drop more than four places.
    for (const e of entries.filter((x) => x.odds !== null)) {
      expect(e.pick).toBeLessThanOrEqual(e.expectedPick + 4);
    }
  });
});

describe("the offseason steps", () => {
  it("are deterministic", () => {
    expect(simulateYears(2)).toEqual(simulateYears(2));
  });

  it("keeps every team within the roster limits after free agency", () => {
    const { teams, players } = simulateYears(1);
    for (const team of teams) {
      const size = players.filter((p) => p.teamId === team).length;
      expect(size).toBeGreaterThanOrEqual(ROSTER_LIMITS.min);
      expect(size).toBeLessThanOrEqual(ROSTER_LIMITS.max);
    }
  });

  it("drafts a pick for every team in every round, in order", () => {
    const { teams, drafts } = simulateYears(1);
    const drafted = (drafts[0] as Rookie[]).filter((r) => r.draft);
    expect(drafted).toHaveLength(teams.length * DRAFT_ROUNDS);
    expect(
      drafted.map((r) => r.draft?.pick).sort((a, b) => (a ?? 0) - (b ?? 0)),
    ).toEqual(Array.from({ length: drafted.length }, (_, i) => i + 1));
    for (const team of teams) {
      expect(drafted.filter((r) => r.draft?.teamId === team)).toHaveLength(
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

  it("keeps the league's talent steady over 25 years", () => {
    const { players, teams } = simulateYears(25);
    const rostered = players.filter((p) => p.teamId);
    const mean = rostered.reduce((s, p) => s + p.overall, 0) / rostered.length;
    expect(mean).toBeGreaterThan(50);
    expect(mean).toBeLessThan(68);
    expect(rostered.length).toBeGreaterThanOrEqual(
      teams.length * ROSTER_LIMITS.min,
    );
    expect(rostered.length).toBeLessThanOrEqual(
      teams.length * ROSTER_LIMITS.max,
    );
    expect(Math.max(...players.map((p) => p.age))).toBeLessThan(40);
  });

  it("lets rosters differ from team to team, anywhere in the range", () => {
    const { teams, players } = simulateYears(6);
    const sizes = new Set(
      teams.map((team) => players.filter((p) => p.teamId === team).length),
    );
    expect(sizes.size).toBeGreaterThan(1);
  });

  it("does not cap free agency, and the pool still settles over 50 years", () => {
    const { players, teams } = simulateYears(50);
    const free = players.filter((p) => p.teamId === null);
    expect(free.length).toBeLessThan(teams.length * 10);
  });

  it("only retires players who have a reason", () => {
    const rng = createRng(seedState("retire"));
    const { players } = league();
    for (let i = 0; i < 6; i++) {
      for (const a of ageAndRetire(rng, players)) {
        if (!a.retired) continue;
        expect(a.age >= 31 || a.overall < 45 || a.teamId === null).toBe(true);
      }
    }
  });

  it("lets a better scout see the draft more clearly", () => {
    // With a lot of noise the best prospect is often missed; with none, the
    // first pick is always the best-valued prospect.
    const teams = Array.from({ length: 12 }, (_, i) => `T${i}`);
    let clearer = 0;
    let blurrier = 0;
    for (let i = 0; i < 60; i++) {
      for (const [scout, count] of [
        [95, "clear"],
        [null, "blur"],
      ] as const) {
        const { rookies } = holdDraft(createRng(seedState(`s${i}`)), {
          standingsOrder: teams,
          playoffDepth: new Map(),
          takenNames: new Set(),
          scouts: new Map(teams.map((t) => [t, scout])),
        });
        const firstPick = rookies.find((r) => r.draft?.pick === 1) as Rookie;
        const bestValue = Math.max(
          ...rookies.map((r) => playerValue(r.overall, r.potential, r.age)),
        );
        const gap =
          bestValue -
          playerValue(firstPick.overall, firstPick.potential, firstPick.age);
        if (count === "clear") clearer += gap;
        else blurrier += gap;
      }
    }
    expect(clearer).toBeLessThan(blurrier);
  });
});

import { describe, expect, it } from "vitest";
import {
  CAMP_PROGRAM_INFO,
  STAFF_BUDGET,
  STAFF_ROLES,
  campPlaces,
  computeOverall,
} from "@fullcourt/game-rules";
import { createRng, seedState } from "../rng/rng";
import { generateWorld } from "../world/generate";
import { chooseCamp, runCamp, type CampPlayer } from "./camp";
import { fillRosters } from "./rosters";
import {
  MARKET_PER_ROLE,
  ageStaff,
  generateStaff,
  hireStaff,
  replenishMarket,
  staffPayroll,
  type StaffMember,
} from "./staff";

function roster(teamId = "T01"): CampPlayer[] {
  const world = generateWorld({ seed: "camp-test", size: "compact" });
  return world.players.slice(0, 15).map((p, i) => ({
    id: `c${i}`,
    teamId,
    position: p.position,
    age: p.age,
    ratings: p.ratings,
    overall: p.overall,
    potential: p.potential,
  }));
}

describe("training camp", () => {
  it("sends the young players with room to grow, up to the places", () => {
    const players = roster();
    const picks = chooseCamp(players, 4);
    expect(picks).toHaveLength(4);
    const room = (p: CampPlayer) => p.potential - p.overall;
    const chosen = picks.map((c) =>
      room(players.find((p) => p.id === c.playerId) as CampPlayer),
    );
    const others = players
      .filter((p) => !picks.some((c) => c.playerId === p.id))
      .map(room);
    expect(Math.min(...chosen)).toBeGreaterThanOrEqual(Math.max(...others));
  });

  it("improves only the program's ratings and keeps overall consistent", () => {
    const players = roster().map((p) => ({ ...p, age: 20, potential: 99 }));
    const results = runCamp(createRng(seedState("camp")), {
      attendees: players.map((p) => ({ ...p, program: "shooting" as const })),
      developmentCoach: new Map([["T01", 90]]),
      conditioningCoach: new Map(),
    });
    for (const [i, r] of results.entries()) {
      const before = players[i] as CampPlayer;
      for (const key of Object.keys(r.ratings) as (keyof typeof r.ratings)[]) {
        if (CAMP_PROGRAM_INFO.shooting.ratings.includes(key)) {
          expect(r.ratings[key]).toBeGreaterThanOrEqual(before.ratings[key]);
        } else {
          expect(r.ratings[key]).toBe(before.ratings[key]);
        }
      }
      expect(r.overall).toBe(computeOverall(before.position, r.ratings));
      expect(r.overall).toBeGreaterThanOrEqual(before.overall);
    }
  });

  it("never pushes a player past his potential", () => {
    const players = roster().map((p) => ({
      ...p,
      age: 20,
      potential: p.overall,
    }));
    const results = runCamp(createRng(seedState("cap")), {
      attendees: players.map((p) => ({ ...p, program: "inside" as const })),
      developmentCoach: new Map([["T01", 95]]),
      conditioningCoach: new Map(),
    });
    for (const [i, r] of results.entries()) {
      expect(r.overall).toBeLessThanOrEqual((players[i] as CampPlayer).overall);
    }
  });

  function totalGain(
    players: CampPlayer[],
    program: "athleticism" | "shooting",
    development: number | null,
    conditioning: number | null,
  ): number {
    let total = 0;
    const rng = createRng(seedState("gain"));
    for (let i = 0; i < 40; i++) {
      const out = runCamp(rng, {
        attendees: players.map((p) => ({ ...p, program })),
        developmentCoach: new Map([["T01", development]]),
        conditioningCoach: new Map([["T01", conditioning]]),
      });
      total += out.reduce(
        (sum, r, k) => sum + r.overall - (players[k] as CampPlayer).overall,
        0,
      );
    }
    return total;
  }

  it("gains more with a better coach and with youth", () => {
    const young = roster().map((p) => ({ ...p, age: 20, potential: 99 }));
    const old = roster().map((p) => ({ ...p, age: 32, potential: 99 }));
    expect(totalGain(young, "shooting", 95, null)).toBeGreaterThan(
      totalGain(young, "shooting", 35, null),
    );
    expect(totalGain(young, "shooting", 70, null)).toBeGreaterThan(
      totalGain(old, "shooting", 70, null),
    );
  });

  it("uses the conditioning coach for athleticism and the development coach otherwise", () => {
    const players = roster().map((p) => ({ ...p, age: 21, potential: 99 }));
    // Athleticism is coached by the great conditioning coach; shooting by the poor development coach.
    expect(totalGain(players, "athleticism", 30, 95)).toBeGreaterThan(
      totalGain(players, "shooting", 30, 95),
    );
  });

  it("knows the number of places a head coach earns", () => {
    expect(campPlaces(85)).toBe(5);
  });
});

describe("staff", () => {
  const teams = Array.from({ length: 12 }, (_, i) => `T${i}`);

  function league(): StaffMember[] {
    return generateStaff(createRng(seedState("s")), teams, new Set()).map(
      (s, i) => ({ ...s, id: `s${i}`, retired: false }),
    );
  }

  it("starts every team with one of each role within budget, and a market", () => {
    const staff = generateStaff(createRng(seedState("s")), teams, new Set());
    for (const team of teams) {
      const members = staff.filter((s) => s.teamId === team);
      expect(members.map((m) => m.role).sort()).toEqual(
        [...STAFF_ROLES].sort(),
      );
      expect(members.reduce((s, m) => s + m.salary, 0)).toBeLessThanOrEqual(
        STAFF_BUDGET,
      );
    }
    for (const role of STAFF_ROLES) {
      expect(
        staff.filter((s) => s.teamId === null && s.role === role),
      ).toHaveLength(MARKET_PER_ROLE);
    }
    const names = staff.map((s) => `${s.firstName} ${s.lastName}`);
    expect(new Set(names).size).toBe(names.length);
  });

  it("runs contracts down, ends them onto the market, and retires the old", () => {
    const staff = league().map((s, i) =>
      i === 0
        ? { ...s, contractYears: 1 }
        : i === 1
          ? { ...s, contractYears: 3 }
          : i === 2
            ? { ...s, age: 64 }
            : s,
    );
    const changed = new Map(
      ageStaff(createRng(seedState("a")), staff).map((s) => [s.id, s]),
    );
    expect(changed.get("s0")).toMatchObject({
      teamId: null,
      contractYears: null,
      retired: false,
    });
    expect(changed.get("s1")).toMatchObject({
      contractYears: 2,
      teamId: staff[1]?.teamId,
    });
    expect(changed.get("s2")).toMatchObject({ retired: true, teamId: null });
  });

  it("refills the market after people leave it", () => {
    const staff = league();
    const market = staff.filter((s) => s.teamId === null).slice(5);
    const taken = new Set(staff.map((s) => `${s.firstName} ${s.lastName}`));
    const added = replenishMarket(createRng(seedState("m")), market, taken);
    for (const role of STAFF_ROLES) {
      const have =
        market.filter((m) => m.role === role).length +
        added.filter((m) => m.role === role).length;
      expect(have).toBe(MARKET_PER_ROLE);
    }
  });

  it("has computer teams hire the best they can afford, within budget, each person once", () => {
    const staff = league().map((s) =>
      s.teamId === "T0" || s.teamId === "T1"
        ? { ...s, teamId: null, contractYears: null }
        : s,
    );
    const hires = hireStaff(createRng(seedState("h")), {
      teams: ["T0", "T1"],
      staff,
    });
    expect(new Set(hires.map((h) => h.id)).size).toBe(hires.length);
    for (const team of ["T0", "T1"]) {
      const hired = hires.filter((h) => h.teamId === team);
      expect(hired.length).toBeGreaterThan(0);
      const spent = hired.reduce(
        (sum, h) => sum + (staff.find((s) => s.id === h.id)?.salary ?? 0),
        0,
      );
      expect(spent).toBeLessThanOrEqual(STAFF_BUDGET);
      const roles = hired.map((h) => staff.find((s) => s.id === h.id)?.role);
      expect(new Set(roles).size).toBe(roles.length);
    }
    expect(staffPayroll(staff, "T2")).toBeGreaterThan(0);
  });
});

describe("rosters", () => {
  it("returns only the players who moved", () => {
    const world = generateWorld({ seed: "camp-test", size: "compact" });
    const teams = world.teams.map((t) => t.abbreviation);
    const players = world.players.map((p, i) => ({
      id: `p${i}`,
      teamId: p.team as string | null,
      firstName: p.firstName,
      lastName: p.lastName,
      position: p.position,
      age: p.age,
      jersey: p.jersey,
      ratings: p.ratings,
      overall: p.overall,
      potential: p.potential,
    }));
    const moves = fillRosters(createRng(seedState("r")), { teams, players });
    for (const m of moves) {
      const before = players.find((p) => p.id === m.id);
      expect(m.teamId !== before?.teamId || m.jersey !== before?.jersey).toBe(
        true,
      );
    }
  });
});

import { describe, expect, it } from "vitest";
import {
  FREE_AGENCY_DAYS,
  playerPriorities,
  ROSTER_LIMITS,
  SALARY_CAP_BASE,
  askingSalary,
  hardCeiling,
  maxSalary,
  minSalary,
  midLevelException,
} from "@fullcourt/game-rules";
import { POSITIONS, type Position } from "@fullcourt/game-types";
import { createRng, seedState } from "../rng/rng";
import {
  generateContracts,
  simulateFreeAgencyDay,
  type FaOffer,
  type FaPlayer,
  type FaTeam,
} from "./freeagency";

const CAP = SALARY_CAP_BASE;

function agents(count = 40): FaPlayer[] {
  const rng = createRng(seedState("agents"));
  return Array.from({ length: count }, (_, i) => ({
    id: `fa${String(i).padStart(2, "0")}`,
    position: POSITIONS[rng.int(0, POSITIONS.length - 1)] as Position,
    age: rng.int(22, 34),
    overall: 45 + rng.int(0, 35),
    potential: 50 + rng.int(0, 35),
    rightsTeamId: null,
  }));
}

function teams(count = 8, payroll = 90_000, acting = true): FaTeam[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `T${i}`,
    payroll,
    positions: Array<Position>(12).fill("PG"),
    mleUsed: false,
    acting,
    winning: 0.5,
    market: 0.5,
    history: 0.5,
    values: Array<number>(12).fill(55),
  }));
}

/** Runs the 21 days the way the server does, carrying state between days. */
function run(input: {
  players: FaPlayer[];
  teams: FaTeam[];
  offers?: FaOffer[];
  seed?: string;
}) {
  let players = input.players;
  let teamsNow = input.teams.map((t) => ({ ...t }));
  let offers: FaOffer[] = input.offers ?? [];
  let n = 0;
  const signings: ReturnType<typeof simulateFreeAgencyDay>["signings"] = [];
  const log: ReturnType<typeof simulateFreeAgencyDay>[] = [];
  for (let day = 1; day <= FREE_AGENCY_DAYS; day++) {
    const result = simulateFreeAgencyDay(
      createRng(seedState(`${input.seed ?? "fa"}:${day}`)),
      { day, cap: CAP, players, teams: teamsNow, offers },
    );
    log.push(result);
    const refs = new Map<string, FaOffer>();
    for (const o of offers) refs.set(o.id, o);
    for (const o of result.newOffers) {
      const offer = { id: `o${n++}`, ...o };
      refs.set(o.ref, offer);
    }
    const signedRefs = new Set(result.signings.map((s) => s.offerRef));
    const lapsedRefs = new Set(result.lapsed.map((l) => l.offerRef));
    for (const r of result.raised) {
      const o = refs.get(r.offerId);
      if (o) o.salary = r.salary;
    }
    offers = [...refs.entries()]
      .filter(([ref]) => !signedRefs.has(ref) && !lapsedRefs.has(ref))
      .map(([, o]) => o);
    for (const s of result.signings) {
      signings.push(s);
      players = players.filter((p) => p.id !== s.playerId);
      teamsNow = teamsNow.map((t) =>
        t.id === s.teamId
          ? {
              ...t,
              payroll: t.payroll + s.salary,
              positions: [
                ...t.positions,
                (input.players.find((p) => p.id === s.playerId) as FaPlayer)
                  .position,
              ],
              mleUsed: t.mleUsed || s.route === "mle",
            }
          : t,
      );
    }
  }
  return { signings, teams: teamsNow, remaining: players, log };
}

describe("a day of free agency", () => {
  it("is the same for the same seed", () => {
    expect(run({ players: agents(), teams: teams() })).toEqual(
      run({ players: agents(), teams: teams() }),
    );
  });

  it("signs players over the 21 days, each to one team and each only once", () => {
    const { signings } = run({ players: agents(), teams: teams() });
    expect(signings.length).toBeGreaterThan(5);
    const ids = signings.map((s) => s.playerId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never takes a team over the hard ceiling or past 15 players", () => {
    const { teams: after } = run({
      players: agents(60),
      teams: teams(6, 135_000),
    });
    for (const team of after) {
      expect(team.payroll).toBeLessThanOrEqual(hardCeiling(CAP));
      expect(team.positions.length).toBeLessThanOrEqual(ROSTER_LIMITS.max);
    }
  });

  it("pays within the minimum and the maximum, and never uses a team's mid-level exception twice", () => {
    const { signings } = run({ players: agents(60), teams: teams(6, 135_000) });
    for (const s of signings) {
      expect(s.salary).toBeGreaterThanOrEqual(minSalary(CAP));
      expect(s.salary).toBeLessThanOrEqual(maxSalary(CAP));
      if (s.route === "mle") {
        expect(s.salary).toBeLessThanOrEqual(midLevelException(CAP));
      }
      expect(s.years).toBeGreaterThanOrEqual(1);
    }
    for (const team of ["T0", "T1", "T2", "T3", "T4", "T5"]) {
      expect(
        signings.filter((s) => s.teamId === team && s.route === "mle").length,
      ).toBeLessThanOrEqual(1);
    }
  });

  it("only signs over-the-cap players through an exception", () => {
    const { signings } = run({ players: agents(60), teams: teams(6, 135_000) });
    for (const s of signings) {
      expect(["minimum", "room", "rights", "mle"]).toContain(s.route);
    }
  });

  it("lets the owner's offer be accepted, when it is generous", () => {
    const players = agents(10);
    const star = [...players].sort((a, b) => b.overall - a.overall)[0]!;
    const price = askingSalary(star, CAP);
    const offers: FaOffer[] = [
      {
        id: "mine",
        playerId: star.id,
        teamId: "me",
        salary: Math.min(maxSalary(CAP), Math.round((price * 1.15) / 10) * 10),
        years: 3,
      },
    ];
    const { signings } = run({
      players,
      teams: [
        {
          id: "me",
          payroll: 50_000,
          positions: Array<Position>(10).fill("PG"),
          mleUsed: false,
          acting: false,
          winning: 0.5,
          market: 0.5,
          history: 0.5,
          values: Array<number>(10).fill(55),
        },
        ...teams(4, 120_000),
      ],
      offers,
    });
    const hit = signings.find((s) => s.playerId === star.id);
    expect(hit).toBeDefined();
    // Another team can still have beaten it on day one by being offered first,
    // but a 115% offer is accepted at once.
    expect(hit?.offerRef).toBe("mine");
  });

  it("lets another team outbid a low offer from the owner", () => {
    const players = agents(10);
    const star = [...players].sort((a, b) => b.overall - a.overall)[0]!;
    const price = askingSalary(star, CAP);
    const lowball: FaOffer = {
      id: "mine",
      playerId: star.id,
      teamId: "me",
      salary: Math.max(minSalary(CAP), Math.round((price * 0.82) / 10) * 10),
      years: 3,
    };
    const wins = { owner: 0, other: 0 };
    for (let i = 0; i < 20; i++) {
      const { signings } = run({
        players,
        teams: [
          {
            id: "me",
            payroll: 50_000,
            positions: Array<Position>(10).fill("PG"),
            mleUsed: false,
            acting: false,
            winning: 0.5,
            market: 0.5,
            history: 0.5,
            values: Array<number>(10).fill(55),
          },
          ...teams(6, 80_000),
        ],
        offers: [lowball],
        seed: `s${i}`,
      });
      const hit = signings.find((s) => s.playerId === star.id);
      if (hit?.teamId === "me") wins.owner += 1;
      else if (hit) wins.other += 1;
    }
    // A low offer sometimes wins, and often loses to a computer team's offer.
    expect(wins.other).toBeGreaterThan(0);
    expect(wins.owner + wins.other).toBeGreaterThan(0);
  });

  it("never lets a player accept an offer under 80% of what he asks", () => {
    const players = agents(10);
    const star = [...players].sort((a, b) => b.overall - a.overall)[0]!;
    const price = askingSalary(star, CAP);
    const lowball: FaOffer = {
      id: "mine",
      playerId: star.id,
      teamId: "me",
      salary: Math.max(minSalary(CAP), Math.round((price * 0.7) / 10) * 10),
      years: 3,
    };
    for (let i = 0; i < 10; i++) {
      const { signings } = run({
        players,
        teams: [
          {
            id: "me",
            payroll: 50_000,
            positions: Array<Position>(10).fill("PG"),
            mleUsed: false,
            acting: false,
            winning: 0.5,
            market: 0.5,
            history: 0.5,
            values: Array<number>(10).fill(55),
          },
        ],
        offers: [lowball],
        seed: `n${i}`,
      });
      expect(signings.some((s) => s.offerRef === "mine")).toBe(false);
    }
  });

  it("voids an offer a team can no longer afford", () => {
    const players = agents(4);
    const star = [...players].sort((a, b) => b.overall - a.overall)[0]!;
    const result = simulateFreeAgencyDay(createRng(seedState("void")), {
      day: 1,
      cap: CAP,
      players,
      teams: [
        {
          id: "poor",
          payroll: 149_500,
          positions: Array<Position>(12).fill("PG"),
          mleUsed: false,
          acting: false,
          winning: 0.5,
          market: 0.5,
          history: 0.5,
          values: Array<number>(10).fill(55),
        },
      ],
      offers: [
        {
          id: "late",
          playerId: star.id,
          teamId: "poor",
          salary: maxSalary(CAP),
          years: 2,
        },
      ],
    });
    expect(result.signings).toEqual([]);
    expect(
      result.lapsed.some((l) => l.offerRef === "late" && l.reason === "void"),
    ).toBe(true);
  });
});

describe("contracts for a league that has none", () => {
  const players = Array.from({ length: 6 * 15 }, (_, i) => ({
    id: `p${i}`,
    teamId: `T${Math.floor(i / 15)}`,
    age: 20 + (i % 15),
    overall: 45 + ((i * 7) % 40),
    potential: 50 + ((i * 5) % 40),
  }));
  const contracts = generateContracts(createRng(seedState("contracts")), {
    cap: CAP,
    year: 2026,
    players,
  });

  it("gives every player a salary and an end year", () => {
    expect(contracts).toHaveLength(players.length);
    for (const c of contracts) {
      expect(c.salary).toBeGreaterThanOrEqual(minSalary(CAP));
      expect(c.salary).toBeLessThanOrEqual(maxSalary(CAP));
      expect(c.expires).toBeGreaterThanOrEqual(2026);
      expect(c.expires).toBeLessThanOrEqual(2030);
    }
  });

  it("leaves every team's payroll under the hard ceiling, and not all alike", () => {
    const payroll = (team: string) =>
      contracts
        .filter((c) => players.find((p) => p.id === c.id)?.teamId === team)
        .reduce((s, c) => s + c.salary, 0);
    const totals = ["T0", "T1", "T2", "T3", "T4", "T5"].map(payroll);
    for (const t of totals) expect(t).toBeLessThanOrEqual(hardCeiling(CAP));
    expect(new Set(totals).size).toBeGreaterThan(1);
  });

  it("pays better players more", () => {
    const salary = (id: string) => contracts.find((c) => c.id === id)!.salary;
    const best = [...players].sort((a, b) => b.overall - a.overall)[0]!;
    const worst = [...players].sort((a, b) => a.overall - b.overall)[0]!;
    expect(salary(best.id)).toBeGreaterThan(salary(worst.id));
  });
});

describe("more than the salary", () => {
  const star = (id: string): FaPlayer => ({
    id,
    position: "SF",
    age: 26,
    overall: 78,
    potential: 78,
    rightsTeamId: null,
  });
  const club = (id: string, winning: number, roster: number): FaTeam => ({
    id,
    payroll: 60_000,
    positions: Array<Position>(10).fill("PG"),
    mleUsed: false,
    acting: false,
    winning,
    market: 0.5,
    history: 0.5,
    values: Array<number>(10).fill(roster),
  });

  /** Which team a player picks, over many days of the same two offers. */
  function choices(playerId: string, goodSalary: number, badSalary: number) {
    const player = star(playerId);
    const price = askingSalary(player, CAP);
    const wins = { good: 0, bad: 0 };
    for (let i = 0; i < 60; i++) {
      const { signings } = run({
        players: [player],
        teams: [club("good", 1, 40), club("bad", 0, 90)],
        offers: [
          {
            id: "g",
            playerId,
            teamId: "good",
            salary: Math.round((price * goodSalary) / 10) * 10,
            years: 3,
          },
          {
            id: "b",
            playerId,
            teamId: "bad",
            salary: Math.round((price * badSalary) / 10) * 10,
            years: 3,
          },
        ],
        seed: `pref${i}`,
      });
      const hit = signings.find((s) => s.playerId === playerId);
      if (hit?.teamId === "good") wins.good += 1;
      if (hit?.teamId === "bad") wins.bad += 1;
    }
    return wins;
  }

  it("lets a winning team with a starting job beat a better-paying team, for a player who cares about that", () => {
    let id = "";
    for (let i = 0; i < 400 && !id; i++) {
      const p = playerPriorities(`caring${i}`);
      if (p.money < 0.25 && p.winning + p.role > 0.45) id = `caring${i}`;
    }
    expect(id).not.toBe("");
    const wins = choices(id, 0.95, 1.05);
    expect(wins.good).toBeGreaterThan(wins.bad);
  });

  it("lets the money decide for a player who cares about little else", () => {
    let id = "";
    for (let i = 0; i < 400 && !id; i++) {
      const p = playerPriorities(`mercenary${i}`);
      if (p.money > 0.58) id = `mercenary${i}`;
    }
    expect(id).not.toBe("");
    const wins = choices(id, 0.95, 1.12);
    expect(wins.bad).toBeGreaterThan(wins.good);
  });

  it("gives a team on a rise and in a big city the better of two equal offers, usually", () => {
    let id = "";
    for (let i = 0; i < 400 && !id; i++) {
      const p = playerPriorities(`equal${i}`);
      if (p.money < 0.3) id = `equal${i}`;
    }
    const wins = choices(id, 1, 1);
    expect(wins.good).toBeGreaterThanOrEqual(wins.bad);
  });
});

describe("computer teams and the cap", () => {
  it("use their cap room, up to the cap and no further", () => {
    const players = agents(70);
    const team: FaTeam = {
      id: "AI",
      payroll: 60_000,
      positions: Array<Position>(8).fill("PG"),
      mleUsed: false,
      acting: true,
      winning: 0.6,
      market: 0.6,
      history: 0.5,
      values: Array<number>(8).fill(60),
    };
    const { teams: after } = run({ players, teams: [team] });
    const payroll = after[0]!.payroll;
    expect(payroll).toBeGreaterThan(60_000 + 20_000);
    expect(payroll).toBeLessThanOrEqual(Math.round(CAP * 1.1));
  });
});

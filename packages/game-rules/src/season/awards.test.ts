import { describe, expect, it } from "vitest";
import {
  awardLines,
  chooseAwards,
  efficiency,
  type AwardInput,
  type AwardLine,
  type AwardTeam,
} from "./awards";

const line = (id: string, over: Partial<AwardLine> = {}): AwardLine => ({
  playerId: id,
  teamId: "t1",
  position: "SF",
  games: 70,
  started: 70,
  minutes: 70 * 30,
  points: 70 * 15,
  rebounds: 70 * 5,
  assists: 70 * 3,
  steals: 70,
  blocks: 35,
  turnovers: 70 * 2,
  fgm: 70 * 6,
  fga: 70 * 13,
  ftm: 70 * 3,
  fta: 70 * 4,
  rookie: false,
  ...over,
});

const teams: AwardTeam[] = [
  { id: "t1", wins: 50, losses: 20, pointsAgainst: 70 * 100 },
  { id: "t2", wins: 20, losses: 50, pointsAgainst: 70 * 110 },
];

const input = (lines: AwardLine[], extra: Partial<AwardInput> = {}) => ({
  lines,
  teams,
  previous: new Map<string, number>(),
  champion: null,
  finalsLines: [],
  ...extra,
});
const winner = (out: ReturnType<typeof chooseAwards>, award: string) =>
  out.find((w) => w.award === award)?.playerId;

describe("efficiency", () => {
  it("is the box score sum less misses and turnovers, per game", () => {
    const l = line("a", {
      games: 2,
      points: 40,
      rebounds: 10,
      assists: 6,
      steals: 2,
      blocks: 2,
      fgm: 14,
      fga: 30,
      ftm: 8,
      fta: 10,
      turnovers: 4,
    });
    // 40+10+6+2+2 - 16 - 2 - 4 = 38, over 2 games
    expect(efficiency(l)).toBe(19);
    expect(efficiency(line("z", { games: 0 }))).toBe(0);
  });
});

describe("chooseAwards", () => {
  it("gives the scoring title to the best per game, not the most points", () => {
    const out = chooseAwards(
      input([
        line("a", { games: 70, points: 70 * 20 }),
        line("b", { games: 40, points: 40 * 30 }),
        line("c", { games: 75, points: 75 * 18 }),
      ]),
    );
    // b played 40 of 75 games: under the 60% bar, so a is the champion scorer.
    expect(winner(out, "scoring-title")).toBe("a");
  });

  it("weighs the MVP by how well the team did", () => {
    const strong = line("a", { teamId: "t1" });
    const weak = line("b", { teamId: "t2", points: 70 * 15 + 70 });
    // b is a little better by himself, but his team lost most games.
    expect(efficiency(weak)).toBeGreaterThan(efficiency(strong));
    expect(winner(chooseAwards(input([strong, weak])), "mvp")).toBe("a");
  });

  it("picks the best rookie, and a sixth man who mostly came off the bench", () => {
    const out = chooseAwards(
      input([
        line("vet", { started: 70 }),
        line("rook", { rookie: true, points: 70 * 17 }),
        line("bench", { started: 5, minutes: 70 * 22, points: 70 * 16 }),
      ]),
    );
    expect(winner(out, "rookie-of-the-year")).toBe("rook");
    expect(winner(out, "sixth-man")).toBe("bench");
  });

  it("gives most improved to the biggest rise on last season", () => {
    const a = line("a");
    const b = line("b");
    const out = chooseAwards(
      input([a, b], {
        previous: new Map([
          ["a", efficiency(a) - 1],
          ["b", efficiency(b) - 6],
        ]),
      }),
    );
    expect(winner(out, "most-improved")).toBe("b");
  });

  it("names a finals MVP only from the champion's players", () => {
    const out = chooseAwards(
      input([line("a")], {
        champion: "t1",
        finalsLines: [
          line("x", { teamId: "t2", points: 9999 }),
          line("y", { teamId: "t1", points: 100 }),
          line("z", { teamId: "t1", points: 300 }),
        ],
      }),
    );
    expect(winner(out, "finals-mvp")).toBe("z");
    expect(winner(chooseAwards(input([line("a")])), "finals-mvp")).toBe(
      undefined,
    );
  });

  it("builds three all-league teams of five different players", () => {
    const pos = ["PG", "SG", "SF", "PF", "C"];
    const lines = Array.from({ length: 20 }, (_, i) =>
      line(`p${String(i).padStart(2, "0")}`, {
        position: pos[i % 5] as string,
        points: 70 * (30 - i),
      }),
    );
    const out = chooseAwards(input(lines));
    for (const n of [1, 2, 3]) {
      const team = out.filter((w) => w.award === `all-league-${n}`);
      expect(team).toHaveLength(5);
    }
    const ids = out
      .filter((w) => w.award.startsWith("all-league"))
      .map((w) => w.playerId);
    expect(new Set(ids).size).toBe(15);
    // The first team has the best at each position: a centre, two of each other pair.
    const first = out
      .filter((w) => w.award === "all-league-1")
      .map((w) => lines.find((l) => l.playerId === w.playerId)?.position);
    expect(first.filter((p) => p === "C")).toHaveLength(1);
    expect(first.filter((p) => p === "PG" || p === "SG")).toHaveLength(2);
  });

  it("fills a team from the best left when a position runs short", () => {
    const lines = Array.from({ length: 6 }, (_, i) =>
      line(`g${i}`, { position: "PG", points: 70 * (20 + i) }),
    );
    const out = chooseAwards(input(lines));
    expect(out.filter((w) => w.award === "all-league-1")).toHaveLength(5);
    expect(out.filter((w) => w.award === "all-league-2")).toHaveLength(1);
  });

  it("is the same every time, with ties to the smaller id", () => {
    const lines = [line("b"), line("a"), line("c")];
    const again = chooseAwards(input([...lines].reverse()));
    expect(chooseAwards(input(lines))).toEqual(again);
    expect(winner(again, "scoring-title")).toBe("a");
  });

  it("gives nothing when nobody played", () => {
    expect(chooseAwards(input([]))).toEqual([]);
  });
});

describe("awardLines", () => {
  const row = (teamId: string, games: number, points: number) => ({
    playerId: "p",
    teamId,
    games,
    started: games,
    minutes: games * 30,
    points,
    rebounds: 0,
    assists: 0,
    steals: 0,
    blocks: 0,
    turnovers: 0,
    fgm: 0,
    fga: 0,
    ftm: 0,
    fta: 0,
  });
  const info = new Map([["p", { position: "PG", rookie: true }]]);

  it("sums a traded player's rows and keeps the team he played most for", () => {
    const [l] = awardLines([row("b", 20, 400), row("a", 50, 1000)], info);
    expect(l).toMatchObject({
      teamId: "a",
      games: 70,
      points: 1400,
      position: "PG",
      rookie: true,
    });
  });

  it("leaves out a player it knows nothing about", () => {
    expect(awardLines([{ ...row("a", 1, 1), playerId: "x" }], info)).toEqual(
      [],
    );
  });
});

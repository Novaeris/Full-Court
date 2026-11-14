import { describe, expect, it } from "vitest";
import { RECAP_NOTES, gameRecap, type RecapPlayer } from "./recap";

const home = { id: "h", name: "Boston Comets" };
const away = { id: "a", name: "Denver Peaks" };

const p = (
  id: string,
  teamId: string,
  over: Partial<RecapPlayer> = {},
): RecapPlayer => ({
  playerId: id,
  name: `Player ${id.toUpperCase()}`,
  teamId,
  points: 8,
  rebounds: 4,
  assists: 3,
  steals: 1,
  blocks: 0,
  threes: 1,
  ...over,
});

const recap = (
  homeScore: number,
  awayScore: number,
  lines: RecapPlayer[] = [],
  overtimes = 0,
) => gameRecap({ home, away, homeScore, awayScore, overtimes, lines });

describe("the headline", () => {
  it("names the winner first, with a verb that fits the margin", () => {
    expect(recap(101, 99).headline).toBe(
      "Boston Comets edged Denver Peaks 101-99.",
    );
    expect(recap(104, 96).headline).toBe(
      "Boston Comets beat Denver Peaks 104-96.",
    );
    expect(recap(100, 85).headline).toBe(
      "Boston Comets defeated Denver Peaks 100-85.",
    );
    expect(recap(120, 90).headline).toBe(
      "Boston Comets routed Denver Peaks 120-90.",
    );
    // The away team can win.
    expect(recap(93, 101).headline).toBe(
      "Denver Peaks beat Boston Comets 101-93.",
    );
  });

  it("says when it went to overtime", () => {
    expect(recap(110, 108, [], 1).headline).toBe(
      "Boston Comets edged Denver Peaks 110-108 in overtime.",
    );
    expect(recap(120, 118, [], 2).headline).toContain("in double overtime");
    expect(recap(130, 128, [], 3).headline).toContain("in triple overtime");
    expect(recap(140, 138, [], 5).headline).toContain("in 5 overtimes");
  });
});

describe("the notes", () => {
  it("says who led each team, the winner's first", () => {
    const r = recap(100, 90, [
      p("a1", "a", { points: 31 }),
      p("a2", "a", { points: 12 }),
      p("h1", "h", { points: 26 }),
      p("h2", "h", { points: 18 }),
    ]);
    expect(r.notes[0]).toBe("Player H1 led Boston Comets with 26 points.");
    expect(r.notes[1]).toBe("Player A1 led Denver Peaks with 31 points.");
  });

  it("notes a triple-double and a double-double, and a big scoring night", () => {
    const r = recap(100, 90, [
      p("h1", "h", { points: 14, rebounds: 11, assists: 10 }),
      p("a1", "a", { points: 41 }),
      p("h2", "h", { points: 22, rebounds: 12 }),
    ]);
    expect(r.notes).toContain(
      "Player H1 had a triple-double: 14 points, 11 rebounds and 10 assists.",
    );
    expect(r.notes).toContain("Player A1 scored 41 points.");
    expect(r.notes).toContain(
      "Player H2 had a double-double: 22 points and 12 rebounds.",
    );
    // The triple-double comes before the double-double.
    expect(r.notes.findIndex((n) => n.includes("triple-double"))).toBeLessThan(
      r.notes.findIndex((n) => n.includes("double-double:")),
    );
  });

  it("notes steals, blocks and threes only when there are a lot", () => {
    const r = recap(100, 90, [
      p("h1", "h", { steals: 5 }),
      p("h2", "h", { blocks: 6 }),
      p("a1", "a", { threes: 7 }),
      p("a2", "a", { steals: 4, blocks: 4, threes: 5 }),
    ]);
    expect(r.notes.join(" ")).toContain("Player H1 had 5 steals");
    expect(r.notes.join(" ")).toContain("Player H2 had 6 blocks");
    expect(r.notes.join(" ")).not.toContain("Player A2");
  });

  it("describes a close game, a blowout and the pace of scoring", () => {
    expect(recap(101, 99).notes).toContain(
      "A close game, decided by 2 points.",
    );
    expect(recap(101, 100).notes).toContain(
      "A close game, decided by 1 point.",
    );
    // Overtime games don't call themselves close.
    expect(recap(101, 99, [], 1).notes.join(" ")).not.toContain("close game");
    expect(recap(120, 90).notes).toContain("A 30-point blowout.");
    expect(recap(125, 110).notes).toContain(
      "A high-scoring game: 235 points between the teams.",
    );
    expect(recap(85, 80).notes).toContain(
      "A defensive game: only 165 points between the teams.",
    );
  });

  it("keeps the recap short", () => {
    const lines = Array.from({ length: 10 }, (_, i) =>
      p(`x${i}`, i % 2 ? "a" : "h", { points: 41 + i }),
    );
    expect(recap(130, 128, lines).notes.length).toBeLessThanOrEqual(
      RECAP_NOTES + 1,
    );
  });

  it("is the same for the same game, whatever the order of the lines", () => {
    const lines = [
      p("h1", "h", { points: 30, rebounds: 10 }),
      p("h2", "h", { points: 30, rebounds: 10 }),
      p("a1", "a", { points: 30 }),
      p("a2", "a", { points: 30 }),
    ];
    expect(recap(100, 98, lines)).toEqual(recap(100, 98, [...lines].reverse()));
  });

  it("says nothing about players when there is no box score", () => {
    expect(recap(100, 90).notes.every((n) => !n.includes("Player"))).toBe(true);
  });
});

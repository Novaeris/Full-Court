import { PERIOD_SECONDS, type PlayEvent } from "@fullcourt/game-types";
import { describe, expect, it } from "vitest";
import { createRng, seedState } from "../rng/rng";
import { buildBoxScore } from "./boxscore";
import { simulateGame } from "./game";
import { scheduledGame, testTeams } from "./test-league";

const teams = testTeams();
type Team = (typeof teams)[number];
const teamA = teams[0] as Team;
const teamB = teams[1] as Team;

function play(seed: string, home = teamA, away = teamB, id = "g-1") {
  const rng = createRng(seedState(seed));
  return simulateGame(scheduledGame(id, home, away), home, away, rng);
}

describe("simulateGame", () => {
  it("is deterministic for a seed", () => {
    const a = play("same");
    const b = play("same");
    expect(b).toEqual(a);
    expect(play("other").plays).not.toEqual(a.plays);
  });

  it("returns a final game with a winner and consistent scores", () => {
    for (let n = 0; n < 40; n++) {
      const r = play(`final-${n}`);
      const { game, plays } = r;
      expect(game.status).toBe("final");
      expect(game.homeScore).not.toBe(game.awayScore);
      const last = plays[plays.length - 1] as PlayEvent;
      expect(last.kind).toBe("period-end");
      expect([last.homeScore, last.awayScore]).toEqual([
        game.homeScore,
        game.awayScore,
      ]);
      expect(game.overtimes).toBe(last.period - 4);
      const scored = { home: 0, away: 0 };
      for (const p of plays) {
        if (p.teamId === teamA.id) scored.home += p.points;
        if (p.teamId === teamB.id) scored.away += p.points;
      }
      expect([scored.home, scored.away]).toEqual([
        game.homeScore,
        game.awayScore,
      ]);
    }
  });

  it("orders events and the clock", () => {
    const { plays } = play("order");
    plays.forEach((p, i) => expect(p.seq).toBe(i + 1));
    let period = 0;
    let clock = 0;
    for (const p of plays) {
      if (p.kind === "period-start") {
        expect(p.period).toBe(period + 1);
        expect(p.clock).toBe(p.period <= 4 ? PERIOD_SECONDS : 300);
        period = p.period;
      } else {
        expect(p.period).toBe(period);
        expect(p.clock).toBeLessThanOrEqual(clock);
        expect(p.clock).toBeGreaterThanOrEqual(0);
        if (p.kind === "period-end") expect(p.clock).toBe(0);
      }
      clock = p.clock;
    }
  });

  it("keeps five on court and only lets them act", () => {
    for (let n = 0; n < 20; n++) {
      const r = play(`court-${n}`);
      const court: Record<string, Set<string>> = {
        [teamA.id]: new Set(r.starters.home),
        [teamB.id]: new Set(r.starters.away),
      };
      const fouls = new Map<string, number>();
      for (const p of r.plays) {
        const set = p.teamId ? court[p.teamId] : undefined;
        if (p.kind === "substitution") {
          expect(set?.has(p.outPlayerId as string)).toBe(true);
          expect(set?.has(p.playerId as string)).toBe(false);
          set?.delete(p.outPlayerId as string);
          set?.add(p.playerId as string);
          expect(set?.size).toBe(5);
          continue;
        }
        if (p.playerId) expect(set?.has(p.playerId)).toBe(true);
        if (p.assistPlayerId) {
          expect(set?.has(p.assistPlayerId)).toBe(true);
          expect(p.assistPlayerId).not.toBe(p.playerId);
        }
        if (p.kind === "foul" && p.playerId) {
          fouls.set(p.playerId, (fouls.get(p.playerId) ?? 0) + 1);
        }
      }
      for (const count of fouls.values()) expect(count).toBeLessThanOrEqual(6);
    }
  });

  it("scores shots by zone and puts them in sensible places", () => {
    const r = play("shots");
    const shots = r.plays.filter(
      (p) => p.kind === "made-shot" || p.kind === "missed-shot",
    );
    expect(shots.length).toBeGreaterThan(50);
    for (const s of shots) {
      expect(s.at).not.toBeNull();
      const { x, y } = s.at as { x: number; y: number };
      expect(Math.abs(x)).toBeLessThanOrEqual(25);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(47);
      const distance = Math.hypot(x, y - 5.25);
      if (s.shotZone === "three") expect(distance).toBeGreaterThanOrEqual(21.9);
      if (s.shotZone === "inside") expect(distance).toBeLessThanOrEqual(7.1);
      if (s.kind === "made-shot") {
        expect(s.points).toBe(s.shotZone === "three" ? 3 : 2);
      } else {
        expect(s.points).toBe(0);
      }
    }
    expect(r.plays.filter((p) => !shots.includes(p) && p.at !== null)).toEqual(
      [],
    );
  });

  it("derives a box score that matches the score and the plays", () => {
    const owners = Object.fromEntries(
      [teamA, teamB].flatMap((t) => t.players.map((p) => [p.id, t.id])),
    );
    for (let n = 0; n < 20; n++) {
      const r = play(`box-${n}`);
      const byTeam: Record<string, number> = { [teamA.id]: 0, [teamB.id]: 0 };
      for (const line of r.boxScore.lines) {
        byTeam[line.teamId] = (byTeam[line.teamId] ?? 0) + line.points;
        expect(line.fgm).toBeLessThanOrEqual(line.fga);
        expect(line.tpm).toBeLessThanOrEqual(line.tpa);
        expect(line.tpa).toBeLessThanOrEqual(line.fga);
        expect(line.ftm).toBeLessThanOrEqual(line.fta);
        expect(line.points).toBe(
          2 * (line.fgm - line.tpm) + 3 * line.tpm + line.ftm,
        );
      }
      expect(byTeam[teamA.id]).toBe(r.game.homeScore);
      expect(byTeam[teamB.id]).toBe(r.game.awayScore);
      const teamMinutes = r.boxScore.lines
        .filter((l) => l.teamId === teamA.id)
        .reduce((sum, l) => sum + l.minutes, 0);
      expect(
        Math.abs(teamMinutes - (240 + 25 * r.game.overtimes)),
      ).toBeLessThanOrEqual(8);
      expect(buildBoxScore("g-1", r.plays, r.starters, owners)).toEqual(
        r.boxScore,
      );
      expect(r.boxScore.lines.filter((l) => l.started)).toHaveLength(10);
    }
  });

  it("rejects mismatched teams", () => {
    const rng = createRng(seedState("x"));
    expect(() =>
      simulateGame(scheduledGame("g", teamA, teamB), teamB, teamA, rng),
    ).toThrow();
  });

  it("lets the stronger team win more often", () => {
    const strength = (t: Team) => t.players.reduce((s, p) => s + p.overall, 0);
    const ranked = [...teams].sort((a, b) => strength(b) - strength(a));
    const best = ranked[0] as Team;
    const worst = ranked[ranked.length - 1] as Team;
    const rng = createRng(seedState("strength"));
    let wins = 0;
    for (let n = 0; n < 60; n++) {
      const home = n % 2 === 0 ? best : worst;
      const away = n % 2 === 0 ? worst : best;
      const r = simulateGame(
        scheduledGame(`g-${n}`, home, away),
        home,
        away,
        rng,
      );
      const homeWon = (r.game.homeScore ?? 0) > (r.game.awayScore ?? 0);
      if (homeWon === (home === best)) wins++;
    }
    expect(wins).toBeGreaterThanOrEqual(42);
  });

  it("plays more trips at a faster pace", () => {
    const trips = (pace: "slow" | "fast") => {
      const home = { ...teamA, strategy: { ...teamA.strategy, pace } };
      const away = { ...teamB, strategy: { ...teamB.strategy, pace } };
      const rng = createRng(seedState("pace"));
      let total = 0;
      for (let n = 0; n < 30; n++) {
        const r = simulateGame(
          scheduledGame(`g-${n}`, home, away),
          home,
          away,
          rng,
        );
        total += r.plays.filter(
          (p) =>
            p.kind === "made-shot" ||
            p.kind === "missed-shot" ||
            p.kind === "turnover",
        ).length;
      }
      return total / 30;
    };
    expect(trips("fast")).toBeGreaterThan(trips("slow") + 8);
  });

  it("shoots more threes when told to", () => {
    const share = (focus: "low" | "high") => {
      const home = {
        ...teamA,
        strategy: { ...teamA.strategy, threePointFocus: focus },
      };
      const rng = createRng(seedState("threes"));
      let threes = 0;
      let shots = 0;
      for (let n = 0; n < 30; n++) {
        const r = simulateGame(
          scheduledGame(`g-${n}`, home, teamB),
          home,
          teamB,
          rng,
        );
        for (const p of r.plays) {
          if (p.teamId !== home.id) continue;
          if (p.kind !== "made-shot" && p.kind !== "missed-shot") continue;
          shots++;
          if (p.shotZone === "three") threes++;
        }
      }
      return threes / shots;
    };
    expect(share("high")).toBeGreaterThan(share("low") + 0.1);
  });
});

describe("league-wide averages", () => {
  it("stay in a believable range", () => {
    const rng = createRng(seedState("league-averages"));
    let games = 0;
    let points = 0;
    let fga = 0;
    let fgm = 0;
    let tpa = 0;
    let tpm = 0;
    let fta = 0;
    let ftm = 0;
    let fouls = 0;
    let homeWins = 0;
    let starterMinutes = 0;
    let starters = 0;
    for (let g = 0; g < 300; g++) {
      const home = teams[g % 30] as Team;
      const away = teams[(g + 1 + (g % 7)) % 30] as Team;
      const r = simulateGame(
        scheduledGame(`g-${g}`, home, away),
        home,
        away,
        rng,
      );
      games++;
      points += (r.game.homeScore ?? 0) + (r.game.awayScore ?? 0);
      if ((r.game.homeScore ?? 0) > (r.game.awayScore ?? 0)) homeWins++;
      for (const l of r.boxScore.lines) {
        fga += l.fga;
        fgm += l.fgm;
        tpa += l.tpa;
        tpm += l.tpm;
        fta += l.fta;
        ftm += l.ftm;
        fouls += l.fouls;
        if (l.started) {
          starterMinutes += l.minutes;
          starters++;
        }
      }
    }
    const perTeam = games * 2;
    expect(points / perTeam).toBeGreaterThan(88);
    expect(points / perTeam).toBeLessThan(118);
    expect(fgm / fga).toBeGreaterThan(0.43);
    expect(fgm / fga).toBeLessThan(0.5);
    expect(tpm / tpa).toBeGreaterThan(0.31);
    expect(tpm / tpa).toBeLessThan(0.39);
    expect(ftm / fta).toBeGreaterThan(0.72);
    expect(ftm / fta).toBeLessThan(0.83);
    expect(fouls / perTeam).toBeGreaterThan(16);
    expect(fouls / perTeam).toBeLessThan(26);
    expect(starterMinutes / starters).toBeGreaterThan(26);
    expect(starterMinutes / starters).toBeLessThan(37);
    expect(homeWins / games).toBeGreaterThan(0.47);
    expect(homeWins / games).toBeLessThan(0.68);
  });
});

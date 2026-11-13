import { attacksRight } from "@fullcourt/game-rules";
import {
  LEFT_BASKET,
  PERIOD_SECONDS,
  RIGHT_BASKET,
  type PlayEvent,
} from "@fullcourt/game-types";
import { describe, expect, it } from "vitest";
import { createRng, seedState } from "../rng/rng";
import { buildBoxScore } from "./boxscore";
import { simulateGame } from "./game";
import { scheduledGame, testTeams } from "./test-league";

const teams = testTeams();
type Team = (typeof teams)[number];
const teamA = teams[0] as Team;

/** The basket a team attacks (or, for a defensive board, defends). */
function basketFor(period: number, home: boolean, offensive: boolean | null) {
  const right = attacksRight(period, offensive === false ? !home : home);
  return right ? RIGHT_BASKET : LEFT_BASKET;
}

/** Distance from a play to the basket its team was attacking. teamA is home. */
function distanceToBasket(p: PlayEvent, homeTeamId: string): number {
  const at = p.at as { x: number; y: number };
  const basket = attacksRight(p.period, p.teamId === homeTeamId)
    ? RIGHT_BASKET
    : LEFT_BASKET;
  return Math.hypot(at.x - basket.x, at.y - basket.y);
}
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
    plays.forEach((p, i) => {
      expect(p.seq).toBe(i + 1);
    });
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
      const distance = distanceToBasket(s, teamA.id);
      if (s.shotZone === "three") expect(distance).toBeGreaterThanOrEqual(21.9);
      if (s.shotZone === "inside") expect(distance).toBeLessThanOrEqual(7.1);
      if (s.kind === "made-shot") {
        expect(s.points).toBe(s.shotZone === "three" ? 3 : 2);
      } else {
        expect(s.points).toBe(0);
      }
    }
  });

  it("places every play on the full court, near the basket it concerns", () => {
    for (let n = 0; n < 10; n++) {
      const r = play(`court-places-${n}`);
      for (const p of r.plays) {
        if (p.kind === "period-start" || p.kind === "period-end") {
          expect(p.at).toBeNull();
          continue;
        }
        if (p.kind === "substitution") {
          expect(p.at).toBeNull();
          continue;
        }
        expect(p.at).not.toBeNull();
        const { x, y } = p.at as { x: number; y: number };
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(94);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(50);
        if (p.kind === "free-throw") {
          expect(distanceToBasket(p, teamA.id)).toBeCloseTo(13.75, 0);
        }
        if (p.kind === "rebound") {
          const basket = basketFor(
            p.period,
            p.teamId === teamA.id,
            p.offensive,
          );
          expect(Math.hypot(x - basket.x, y - basket.y)).toBeLessThan(15);
        }
      }
    }
  });

  it("swaps baskets at halftime", () => {
    const r = play("halves");
    const attackX = (period: number) => {
      const xs = r.plays
        .filter(
          (p) =>
            p.period === period &&
            p.kind === "made-shot" &&
            p.teamId === teamA.id &&
            p.shotZone === "inside",
        )
        .map((p) => (p.at as { x: number }).x);
      return xs.reduce((a, b) => a + b, 0) / xs.length;
    };
    expect(attackX(1)).toBeGreaterThan(70);
    expect(attackX(2)).toBeGreaterThan(70);
    expect(attackX(3)).toBeLessThan(25);
    expect(attackX(4)).toBeLessThan(25);
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
    // NBA 2010-2020: about 100 to 112 points, 45-47% shooting, 35-36% from
    // three, 77% from the line and 20 fouls per team.
    expect(points / perTeam).toBeGreaterThan(99);
    expect(points / perTeam).toBeLessThan(112);
    expect(fgm / fga).toBeGreaterThan(0.44);
    expect(fgm / fga).toBeLessThan(0.49);
    expect(tpm / tpa).toBeGreaterThan(0.33);
    expect(tpm / tpa).toBeLessThan(0.38);
    expect(tpa / perTeam).toBeGreaterThan(23);
    expect(tpa / perTeam).toBeLessThan(33);
    expect(ftm / fta).toBeGreaterThan(0.74);
    expect(ftm / fta).toBeLessThan(0.82);
    expect(fta / perTeam).toBeGreaterThan(18);
    expect(fta / perTeam).toBeLessThan(26);
    expect(fouls / perTeam).toBeGreaterThan(17);
    expect(fouls / perTeam).toBeLessThan(24);
    expect(starterMinutes / starters).toBeGreaterThan(27);
    expect(starterMinutes / starters).toBeLessThan(35);
    expect(homeWins / games).toBeGreaterThan(0.5);
    expect(homeWins / games).toBeLessThan(0.67);
  });

  it("matches NBA-era turnovers, steals, blocks, assists and rebounds", () => {
    const rng = createRng(seedState("league-extras"));
    const sum = { tov: 0, stl: 0, blk: 0, ast: 0, reb: 0, made: 0 };
    const games = 200;
    for (let g = 0; g < games; g++) {
      const home = teams[g % 30] as Team;
      const away = teams[(g + 2 + (g % 5)) % 30] as Team;
      const r = simulateGame(
        scheduledGame(`g-${g}`, home, away),
        home,
        away,
        rng,
      );
      for (const p of r.plays) {
        if (p.kind === "turnover") sum.tov++;
        if (p.stealPlayerId) sum.stl++;
        if (p.blockPlayerId) sum.blk++;
        if (p.assistPlayerId) sum.ast++;
        if (p.kind === "rebound") sum.reb++;
        if (p.kind === "made-shot") sum.made++;
      }
    }
    const perTeam = games * 2;
    expect(sum.tov / perTeam).toBeGreaterThan(12);
    expect(sum.tov / perTeam).toBeLessThan(17);
    expect(sum.stl / perTeam).toBeGreaterThan(6.5);
    expect(sum.stl / perTeam).toBeLessThan(9.5);
    expect(sum.blk / perTeam).toBeGreaterThan(3.8);
    expect(sum.blk / perTeam).toBeLessThan(6.5);
    expect(sum.ast / perTeam).toBeGreaterThan(18);
    expect(sum.ast / perTeam).toBeLessThan(26);
    expect(sum.reb / perTeam).toBeGreaterThan(40);
    expect(sum.reb / perTeam).toBeLessThan(50);
    expect(sum.ast / sum.made).toBeGreaterThan(0.5);
    expect(sum.ast / sum.made).toBeLessThan(0.72);
  });
});

describe("fast breaks and transition", () => {
  const collect = () => {
    const rng = createRng(seedState("transition"));
    const stolen: boolean[] = [];
    const afterMade: boolean[] = [];
    const fbShots: PlayEvent[] = [];
    const slowShots: PlayEvent[] = [];
    for (let g = 0; g < 120; g++) {
      const home = teams[g % 30] as Team;
      const away = teams[(g + 3) % 30] as Team;
      const r = simulateGame(
        scheduledGame(`g-${g}`, home, away),
        home,
        away,
        rng,
      );
      r.plays.forEach((p, i) => {
        const shot = p.kind === "made-shot" || p.kind === "missed-shot";
        if (shot) (p.transition ? fbShots : slowShots).push(p);
        // The first event of the possession after a steal or a made basket.
        const next = r.plays
          .slice(i + 1)
          .find((q) => q.kind !== "substitution" && q.kind !== "foul");
        if (p.kind === "turnover" && p.stealPlayerId && next) {
          if (next.teamId !== p.teamId && next.kind !== "period-end") {
            stolen.push(next.transition);
          }
        }
        if (p.kind === "made-shot" && next) {
          if (next.teamId !== p.teamId && next.kind !== "period-end") {
            afterMade.push(next.transition);
          }
        }
      });
    }
    return { stolen, afterMade, fbShots, slowShots };
  };
  const rate = (xs: boolean[]) => xs.filter(Boolean).length / xs.length;
  const { stolen, afterMade, fbShots, slowShots } = collect();

  it("starts fast breaks far more often after a steal", () => {
    expect(stolen.length).toBeGreaterThan(300);
    expect(rate(stolen)).toBeGreaterThan(0.35);
    expect(rate(stolen)).toBeLessThan(0.7);
    expect(rate(afterMade)).toBeLessThan(0.15);
  });

  it("makes fast breaks a modest share of shots, mostly at the rim", () => {
    const share = fbShots.length / (fbShots.length + slowShots.length);
    expect(share).toBeGreaterThan(0.08);
    expect(share).toBeLessThan(0.22);
    const rim = fbShots.filter((p) => p.shotZone === "inside").length;
    expect(rim / fbShots.length).toBeGreaterThan(0.55);
  });

  it("converts fast breaks better than half-court sets", () => {
    const made = (ps: PlayEvent[]) =>
      ps.filter((p) => p.kind === "made-shot").length / ps.length;
    expect(made(fbShots)).toBeGreaterThan(made(slowShots) + 0.04);
  });

  it("credits the player who started the break with the pass", () => {
    const rng = createRng(seedState("lead-passer"));
    let led = 0;
    let involved = 0;
    let breaks = 0;
    for (let g = 0; g < 80; g++) {
      const home = teams[g % 30] as Team;
      const away = teams[(g + 5) % 30] as Team;
      const r = simulateGame(
        scheduledGame(`g-${g}`, home, away),
        home,
        away,
        rng,
      );
      r.plays.forEach((p, i) => {
        if (p.kind !== "made-shot" || !p.transition) return;
        breaks++;
        const before = r.plays
          .slice(0, i)
          .reverse()
          .find((q) => q.kind === "turnover" || q.kind === "rebound");
        const starter = before?.stealPlayerId ?? before?.playerId;
        if (p.assistPlayerId && p.assistPlayerId === starter) led++;
        if (p.playerId === starter || p.assistPlayerId === starter) involved++;
      });
    }
    expect(breaks).toBeGreaterThan(100);
    expect(led / breaks).toBeGreaterThan(0.18);
    expect(involved / breaks).toBeGreaterThan(0.45);
  });

  it("runs more of them for a fast-paced team", () => {
    const share = (pace: "slow" | "fast") => {
      const home = {
        ...teams[0],
        strategy: { ...teamA.strategy, pace },
      } as Team;
      const rng = createRng(seedState("fb-pace"));
      let fb = 0;
      let shots = 0;
      for (let n = 0; n < 40; n++) {
        const r = simulateGame(
          scheduledGame(`g-${n}`, home, teams[1] as Team),
          home,
          teams[1] as Team,
          rng,
        );
        for (const p of r.plays) {
          if (p.teamId !== home.id) continue;
          if (p.kind !== "made-shot" && p.kind !== "missed-shot") continue;
          shots++;
          if (p.transition) fb++;
        }
      }
      return fb / shots;
    };
    expect(share("fast")).toBeGreaterThan(share("slow") + 0.05);
  });
});

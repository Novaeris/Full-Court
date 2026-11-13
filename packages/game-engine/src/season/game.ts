import {
  BASKET_POINT,
  OVERTIME_SECONDS,
  PERIOD_SECONDS,
  REGULATION_PERIODS,
  type CourtPoint,
  type Game,
  type PlayEvent,
  type Pace,
  type RatingKey,
  type ShotZone,
} from "@fullcourt/game-types";
import { invariant } from "@fullcourt/shared";
import { normal, pick, weighted } from "../rng/helpers";
import type { Rng } from "../rng/rng";
import { buildBoxScore } from "./boxscore";
import type { Lineups, SimPlayer, SimTeam, SimulatedGame } from "./types";

/** Mean seconds a fresh trip down the court takes, by pace. */
const TRIP_SECONDS: Record<Pace, number> = {
  slow: 18,
  normal: 15.5,
  fast: 13.5,
};
const MAX_OVERTIMES = 20;
const FOUL_OUT = 6;
const BONUS_FOULS = 5;

/** Make-chance before ratings, by zone. */
const BASE_MAKE: Record<ShotZone, number> = {
  inside: 0.5,
  "mid-range": 0.35,
  three: 0.305,
};
/** Chance a missed shot is really a shooting foul, by zone. */
const FOUL_ON_MISS: Record<ShotZone, number> = {
  inside: 0.24,
  "mid-range": 0.09,
  three: 0.05,
};
const AND_ONE: Record<ShotZone, number> = {
  inside: 0.07,
  "mid-range": 0.02,
  three: 0.015,
};
const ASSISTED: Record<ShotZone, number> = {
  inside: 0.55,
  "mid-range": 0.5,
  three: 0.82,
};
const BLOCKED: Record<ShotZone, number> = {
  inside: 0.18,
  "mid-range": 0.07,
  three: 0.02,
};
const THREE_FOCUS = { low: 0.65, normal: 1, high: 1.45 } as const;

type Side = {
  team: SimTeam;
  home: boolean;
  onCourt: SimPlayer[];
  bench: SimPlayer[];
  energy: Map<string, number>;
  fouls: Map<string, number>;
  periodFouls: number;
  score: number;
};

const clamp = (n: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, n));
const round1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * Plays one game possession by possession.
 *
 * Pure and deterministic: the same teams, game and RNG state give the same
 * plays. The RNG is advanced in place; read `rng.state()` afterwards to save
 * it. The box score is derived from the plays, so the two always agree.
 */
export function simulateGame(
  game: Game,
  home: SimTeam,
  away: SimTeam,
  rng: Rng,
): SimulatedGame {
  invariant(game.homeTeamId === home.id, "home team doesn't match the game");
  invariant(game.awayTeamId === away.id, "away team doesn't match the game");
  invariant(home.id !== away.id, "a team can't play itself");
  for (const t of [home, away]) {
    invariant(t.players.length >= 5, `${t.id} needs at least five players`);
  }

  const sides = [makeSide(home, true), makeSide(away, false)] as const;
  const [homeSide, awaySide] = sides;
  const starters: Lineups = {
    home: homeSide.onCourt.map((p) => p.id),
    away: awaySide.onCourt.map((p) => p.id),
  };

  const plays: PlayEvent[] = [];
  let period = 0;
  let clock = 0;

  const emit = (
    kind: PlayEvent["kind"],
    side: Side | null,
    fields: Partial<PlayEvent> = {},
  ): PlayEvent => {
    const points = fields.points ?? 0;
    if (side) side.score += points;
    const event: PlayEvent = {
      gameId: game.id,
      seq: plays.length + 1,
      period,
      clock,
      kind,
      teamId: side ? side.team.id : null,
      playerId: null,
      assistPlayerId: null,
      blockPlayerId: null,
      stealPlayerId: null,
      outPlayerId: null,
      shotZone: null,
      made: null,
      offensive: null,
      points,
      homeScore: homeSide.score,
      awayScore: awaySide.score,
      at: null,
      ...fields,
    };
    plays.push(event);
    return event;
  };

  /** Spends game time: the clock runs, and players tire or rest. */
  const spend = (seconds: number): void => {
    const used = Math.min(seconds, clock);
    clock -= used;
    for (const side of sides) {
      for (const p of side.onCourt) {
        const e = side.energy.get(p.id) ?? 1;
        side.energy.set(p.id, Math.max(0, e - used / drainSeconds(p)));
      }
      for (const p of side.bench) {
        const e = side.energy.get(p.id) ?? 1;
        side.energy.set(p.id, Math.min(1, e + used / RECOVER_SECONDS));
      }
    }
  };

  const rest = (seconds: number): void => {
    for (const side of sides) {
      for (const p of [...side.onCourt, ...side.bench]) {
        const e = side.energy.get(p.id) ?? 1;
        side.energy.set(p.id, Math.min(1, e + seconds / RECOVER_SECONDS));
      }
    }
  };

  const swap = (side: Side, out: SimPlayer, incoming: SimPlayer): void => {
    side.onCourt = side.onCourt.map((p) => (p.id === out.id ? incoming : p));
    side.bench = side.bench.map((p) => (p.id === incoming.id ? out : p));
    emit("substitution", side, { playerId: incoming.id, outPlayerId: out.id });
  };

  /** A rested player who is clearly better replaces the weakest on court. */
  const bringBackBest = (side: Side): void => {
    for (;;) {
      const candidates = side.bench.filter(
        (p) =>
          (side.fouls.get(p.id) ?? 0) < FOUL_OUT &&
          (side.energy.get(p.id) ?? 1) >= FRESH,
      );
      if (candidates.length === 0) return;
      const best = candidates.reduce((a, p) =>
        value(side, p) > value(side, a) ? p : a,
      );
      const worst = side.onCourt.reduce((a, p) =>
        value(side, p) < value(side, a) ? p : a,
      );
      if (value(side, best) <= value(side, worst) + SWAP_MARGIN) return;
      swap(side, worst, best);
    }
  };

  const substitute = (side: Side): void => {
    bringBackBest(side);
    // Fouled-out players leave first, then tired ones.
    for (;;) {
      const eligible = side.bench.filter(
        (p) => (side.fouls.get(p.id) ?? 0) < FOUL_OUT,
      );
      if (eligible.length === 0) return;
      const out = [...side.onCourt]
        .sort((a, b) => stayScore(side, a) - stayScore(side, b))
        .find((p) => {
          const fouled = (side.fouls.get(p.id) ?? 0) >= FOUL_OUT;
          return fouled || (side.energy.get(p.id) ?? 1) < TIRED;
        });
      if (!out) return;
      const fouledOut = (side.fouls.get(out.id) ?? 0) >= FOUL_OUT;
      const fresh = eligible.filter(
        (p) => fouledOut || (side.energy.get(p.id) ?? 1) >= RESTED,
      );
      if (fresh.length === 0) return;
      const incoming = fresh.reduce((best, p) =>
        value(side, p) > value(side, best) ? p : best,
      );
      side.onCourt = side.onCourt.map((p) => (p.id === out.id ? incoming : p));
      side.bench = side.bench.map((p) => (p.id === incoming.id ? out : p));
      emit("substitution", side, {
        playerId: incoming.id,
        outPlayerId: out.id,
      });
    }
  };

  const freeThrows = (
    offense: Side,
    shooter: SimPlayer,
    count: number,
  ): "made" | "miss" => {
    let last: "made" | "miss" = "made";
    for (let n = 1; n <= count; n++) {
      const chance = clamp(
        0.63 + (effective(offense, shooter, "freeThrow") - 25) * 0.0042,
        0.3,
        0.95,
      );
      const made = rng.next() < chance;
      emit("free-throw", offense, {
        playerId: shooter.id,
        made,
        points: made ? 1 : 0,
      });
      last = made ? "made" : "miss";
    }
    return last;
  };

  const rebound = (
    offense: Side,
    defense: Side,
    offensiveChance: number,
  ): boolean => {
    const off = rng.next() < offensiveChance;
    const side = off ? offense : defense;
    const key: RatingKey = off ? "offRebound" : "defRebound";
    const player = weighted(
      rng,
      side.onCourt.map(
        (p) => [p, weight(effective(side, p, key)) ** 1.5] as const,
      ),
    );
    emit("rebound", side, { playerId: player.id, offensive: off });
    return off;
  };

  /**
   * One trip. Returns the side with the ball next and whether play stopped
   * for a dead ball (when substitutions may happen).
   */
  const trip = (
    offense: Side,
    defense: Side,
    continuation: boolean,
  ): { next: Side; deadBall: boolean } => {
    const flip = (deadBall: boolean) => ({ next: defense, deadBall });
    const keep = (deadBall: boolean) => ({ next: offense, deadBall });

    const mean = continuation ? 7 : TRIP_SECONDS[offense.team.strategy.pace];
    const seconds = clamp(
      Math.round(normal(rng, mean, continuation ? 3 : 3.5)),
      continuation ? 2 : 4,
      continuation ? 14 : 24,
    );

    // A non-shooting foul stops play early.
    if (rng.next() < 0.13) {
      spend(Math.min(seconds, 6));
      const fouler = pick(rng, defense.onCourt);
      foul(defense, fouler);
      if (defense.periodFouls >= BONUS_FOULS) {
        const shooter = weighted(
          rng,
          offense.onCourt.map(
            (p) => [p, weight(effective(offense, p, "freeThrow"))] as const,
          ),
        );
        const result = freeThrows(offense, shooter, 2);
        if (result === "made") return flip(true);
        return rebound(offense, defense, 0.13) ? keep(false) : flip(false);
      }
      return keep(true);
    }
    spend(seconds);

    // Turnover.
    const handle = avg(offense, "ballHandling");
    const pressure = avg(defense, "perimeterD");
    const pace = offense.team.strategy.pace === "fast" ? 0.01 : 0;
    if (
      rng.next() <
      clamp(0.133 + (pressure - handle) * 0.0018 + pace, 0.06, 0.25)
    ) {
      const loser = weighted(
        rng,
        offense.onCourt.map(
          (p) => [p, 130 - effective(offense, p, "ballHandling")] as const,
        ),
      );
      const stolen = rng.next() < 0.5;
      const thief = stolen
        ? weighted(
            rng,
            defense.onCourt.map(
              (p) => [p, weight(effective(defense, p, "perimeterD"))] as const,
            ),
          )
        : null;
      emit("turnover", offense, {
        playerId: loser.id,
        stealPlayerId: thief?.id ?? null,
      });
      return flip(true);
    }

    // Shot.
    const shooter = weighted(
      rng,
      offense.onCourt.map((p) => [p, weight(p.overall)] as const),
    );
    const zone = chooseZone(rng, offense, shooter);
    const at = shotPoint(rng, zone);
    const made = rng.next() < makeChance(offense, defense, shooter, zone);

    if (made) {
      const passer = assistant(rng, offense, shooter, zone);
      emit("made-shot", offense, {
        playerId: shooter.id,
        assistPlayerId: passer?.id ?? null,
        shotZone: zone,
        points: zone === "three" ? 3 : 2,
        made: true,
        at,
      });
      if (rng.next() < AND_ONE[zone]) {
        foul(defense, pick(rng, defense.onCourt));
        freeThrows(offense, shooter, 1);
      }
      return flip(true);
    }

    if (rng.next() < FOUL_ON_MISS[zone]) {
      foul(defense, pick(rng, defense.onCourt));
      const result = freeThrows(offense, shooter, zone === "three" ? 3 : 2);
      if (result === "made") return flip(true);
      return rebound(offense, defense, 0.13) ? keep(false) : flip(false);
    }

    const blockChance = BLOCKED[zone] * (avg(defense, "interiorD") / 60) ** 1.5;
    const blocker =
      rng.next() < blockChance
        ? weighted(
            rng,
            defense.onCourt.map(
              (p) => [p, weight(effective(defense, p, "interiorD"))] as const,
            ),
          )
        : null;
    emit("missed-shot", offense, {
      playerId: shooter.id,
      blockPlayerId: blocker?.id ?? null,
      shotZone: zone,
      made: false,
      at,
    });
    const offensiveChance = clamp(
      0.27 + (avg(offense, "offRebound") - avg(defense, "defRebound")) * 0.003,
      0.15,
      0.4,
    );
    return rebound(offense, defense, offensiveChance)
      ? keep(false)
      : flip(false);
  };

  const foul = (side: Side, player: SimPlayer): void => {
    side.fouls.set(player.id, (side.fouls.get(player.id) ?? 0) + 1);
    side.periodFouls++;
    emit("foul", side, { playerId: player.id });
  };

  // ---- Game flow ----
  const firstBall = rng.next() < 0.5 ? homeSide : awaySide;
  for (;;) {
    period++;
    clock = period <= REGULATION_PERIODS ? PERIOD_SECONDS : OVERTIME_SECONDS;
    invariant(
      period <= REGULATION_PERIODS + MAX_OVERTIMES,
      "game would not end",
    );
    if (period === 3) rest(600);
    else if (period > 1) rest(60);
    homeSide.periodFouls = 0;
    awaySide.periodFouls = 0;
    emit("period-start", null);
    substitute(homeSide);
    substitute(awaySide);

    let offense =
      period % 2 === 1
        ? firstBall
        : firstBall === homeSide
          ? awaySide
          : homeSide;
    let continuation = false;
    while (clock > 0) {
      const defense = offense === homeSide ? awaySide : homeSide;
      const outcome = trip(offense, defense, continuation);
      continuation = !outcome.deadBall && outcome.next === offense;
      offense = outcome.next;
      if (clock > 0 && !continuation) {
        substitute(homeSide);
        substitute(awaySide);
      }
    }
    emit("period-end", null);
    if (period >= REGULATION_PERIODS && homeSide.score !== awaySide.score)
      break;
  }

  const teamOf: Record<string, string> = {};
  for (const t of [home, away]) for (const p of t.players) teamOf[p.id] = t.id;

  return {
    game: {
      ...game,
      status: "final",
      homeScore: homeSide.score,
      awayScore: awaySide.score,
      overtimes: period - REGULATION_PERIODS,
    },
    plays,
    boxScore: buildBoxScore(game.id, plays, starters, teamOf),
    starters,
  };
}

// ---- Fatigue ----

/** Seconds of play to fully tire a player of stamina 25 (and a slope up). */
const drainSeconds = (p: SimPlayer): number =>
  850 + (p.ratings.stamina - 25) * 16;
const RECOVER_SECONDS = 720;
const TIRED = 0.45;
const FRESH = 0.9;
const SWAP_MARGIN = 4;
const RESTED = 0.75;

// ---- Helpers ----

function makeSide(team: SimTeam, home: boolean): Side {
  const starters = chooseStarters(team.players);
  const ids = new Set(starters.map((p) => p.id));
  return {
    team,
    home,
    onCourt: starters,
    bench: team.players.filter((p) => !ids.has(p.id)),
    energy: new Map(team.players.map((p) => [p.id, 1])),
    fouls: new Map(),
    periodFouls: 0,
    score: 0,
  };
}

/** The best player at each position, then the best of the rest. */
function chooseStarters(players: readonly SimPlayer[]): SimPlayer[] {
  const byQuality = [...players].sort(
    (a, b) => b.overall - a.overall || (a.id < b.id ? -1 : 1),
  );
  const chosen: SimPlayer[] = [];
  for (const position of ["PG", "SG", "SF", "PF", "C"] as const) {
    const best = byQuality.find((p) => p.position === position);
    if (best) chosen.push(best);
  }
  for (const p of byQuality) {
    if (chosen.length >= 5) break;
    if (!chosen.includes(p)) chosen.push(p);
  }
  return chosen.slice(0, 5);
}

/** A rating after fatigue: a spent player plays up to 12 points worse. */
function effective(side: Side, player: SimPlayer, key: RatingKey): number {
  const energy = side.energy.get(player.id) ?? 1;
  return player.ratings[key] - 12 * (1 - energy);
}

function avg(side: Side, key: RatingKey): number {
  let total = 0;
  for (const p of side.onCourt) total += effective(side, p, key);
  return total / side.onCourt.length;
}

/** How much the coach wants a player on court right now. */
const value = (side: Side, p: SimPlayer): number =>
  p.overall * (0.85 + 0.15 * (side.energy.get(p.id) ?? 1));
const stayScore = (side: Side, p: SimPlayer): number =>
  (side.energy.get(p.id) ?? 1) * 100 + p.overall * 0.01;

function chooseZone(rng: Rng, side: Side, shooter: SimPlayer): ShotZone {
  const focus = THREE_FOCUS[side.team.strategy.threePointFocus];
  return weighted<ShotZone>(rng, [
    ["inside", Math.max(1, effective(side, shooter, "inside") - 20)],
    [
      "mid-range",
      Math.max(1, effective(side, shooter, "midRange") - 20) * 0.55,
    ],
    [
      "three",
      Math.max(1, effective(side, shooter, "threePoint") - 20) * 0.85 * focus,
    ],
  ]);
}

function makeChance(
  offense: Side,
  defense: Side,
  shooter: SimPlayer,
  zone: ShotZone,
): number {
  const skill =
    zone === "inside"
      ? effective(offense, shooter, "inside")
      : zone === "mid-range"
        ? effective(offense, shooter, "midRange")
        : effective(offense, shooter, "threePoint");
  const guard =
    zone === "inside"
      ? avg(defense, "interiorD")
      : zone === "mid-range"
        ? (avg(defense, "interiorD") + avg(defense, "perimeterD")) / 2
        : avg(defense, "perimeterD");
  const style = defense.team.strategy.defense;
  const styleAdjust =
    style === "perimeter"
      ? zone === "three"
        ? -0.015
        : zone === "inside"
          ? 0.015
          : 0
      : style === "interior"
        ? zone === "inside"
          ? -0.02
          : zone === "three"
            ? 0.01
            : 0
        : 0;
  const homeEdge = offense.home ? 0.015 : 0;
  return clamp(
    BASE_MAKE[zone] +
      (skill - 55) * 0.0042 -
      (guard - 55) * 0.0032 +
      styleAdjust +
      homeEdge,
    0.15,
    0.88,
  );
}

function assistant(
  rng: Rng,
  side: Side,
  shooter: SimPlayer,
  zone: ShotZone,
): SimPlayer | null {
  const others = side.onCourt.filter((p) => p.id !== shooter.id);
  if (others.length === 0) return null;
  const passer = weighted(
    rng,
    others.map((p) => [p, weight(effective(side, p, "passing"))] as const),
  );
  const chance =
    ASSISTED[zone] *
    clamp(0.8 + (effective(side, passer, "passing") - 50) / 200, 0.6, 1.1);
  return rng.next() < chance ? passer : null;
}

function shotPoint(rng: Rng, zone: ShotZone): CourtPoint {
  const theta = (0.04 + rng.next() * 0.92) * Math.PI;
  const radius =
    zone === "inside"
      ? 1 + rng.next() * 6
      : zone === "mid-range"
        ? 9 + rng.next() * 12
        : 23.75 + rng.next() * 3.5;
  let x = radius * Math.cos(theta);
  let y = BASKET_POINT.y + radius * Math.sin(theta);
  if (zone === "three" && Math.abs(x) > 22) {
    // Corner three: a straight 22-foot line.
    x = x < 0 ? -22 : 22;
    y = 1 + rng.next() * 13;
  }
  return { x: round1(clamp(x, -24.5, 24.5)), y: round1(clamp(y, 0.5, 46.5)) };
}

/** A positive pick weight from a rating: 20 below the rating, never under 1. */
function weight(rating: number): number {
  return Math.max(1, rating - 20);
}

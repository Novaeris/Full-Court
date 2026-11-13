import { attacksRight } from "@fullcourt/game-rules";
import {
  COURT_LENGTH,
  COURT_WIDTH,
  OVERTIME_SECONDS,
  PERIOD_SECONDS,
  type PlayEvent,
  type Position,
} from "@fullcourt/game-types";

/**
 * Turns a game's plays into movement: where each of the ten players and the
 * ball are at every moment, so a viewer can show the game on a full court.
 *
 * The simulation only says what happened and where; this fills in how it
 * looked. A team that has just won the ball brings it up in a half-court set
 * (players spread to the wings, the corners and the block), or, after a steal
 * or a defensive rebound that started a fast break, runs it up the floor with
 * a ball handler in front, wings filling the lanes and the defenders trailing.
 * Passes, shots, boards, fouls, free throws and substitutions each get their
 * own movement.
 *
 * Pure and deterministic: the same plays always give the same timeline. Times
 * are animation seconds at normal speed, not game seconds, so a viewer can run
 * it at any speed. Players are in `slots`: 0 to 4 for the home team, 5 to 9
 * for the away team.
 */

export type ViewPlayer = { id: string; position: Position };
export type ViewTeam = { id: string; players: readonly ViewPlayer[] };
export type ViewRosters = { home: ViewTeam; away: ViewTeam };
export type ViewLineups = { home: readonly string[]; away: readonly string[] };

export type TimelineFrame = {
  /** Animation seconds at normal speed. */
  t: number;
  /** x, y for slots 0 to 9, in feet on the full court (see `CourtPoint`). */
  pos: readonly number[];
  ball: readonly [number, number];
  /** The slot holding the ball, or -1 while it is in the air or loose. */
  holder: number;
  /** Who is on the court in each slot. */
  ids: readonly string[];
  /** The last play whose result has been revealed (its score, its feed line); -1 before the first. */
  play: number;
};

export type GameTimeline = {
  frames: TimelineFrame[];
  /** Animation seconds from the start to the end. */
  duration: number;
  /** When each play's result is revealed. Strictly increasing. */
  playTimes: number[];
  /** The frame at which each play happens (a shooter at the spot he shot from). */
  eventFrames: number[];
};

type Pt = { x: number; y: number };

/** Animation seconds per game second: a 24 second trip takes 12 seconds to watch. */
const SCALE = 0.5;
/** The least time a play stays on screen, so zero-time plays can be followed. */
const DWELL: Record<PlayEvent["kind"], number> = {
  "period-start": 2.2,
  "period-end": 1.2,
  "made-shot": 1.3,
  "missed-shot": 1.1,
  "free-throw": 0.9,
  rebound: 0.9,
  turnover: 1.1,
  foul: 0.9,
  substitution: 0.9,
};
const BALL_IN_FLIGHT = 0.35;

const POSITION_ORDER: readonly Position[] = ["PG", "SG", "SF", "PF", "C"];

/** Half-court set, in the attacking half: x across, y from the baseline. */
const SET: readonly Pt[] = [
  { x: 0, y: 30 },
  { x: 17, y: 23 },
  { x: -17, y: 23 },
  { x: 11, y: 12 },
  { x: -8, y: 9 },
];
const BASKET: Pt = { x: 0, y: 5.25 };
/** A fast break: the lead, two wings and two trailers; two defenders back, three chasing. */
const BREAK_OFFENSE: readonly Pt[] = [
  { x: 0, y: 14 },
  { x: 14, y: 18 },
  { x: -14, y: 18 },
  { x: 6, y: 34 },
  { x: -6, y: 37 },
];
const BREAK_DEFENSE: readonly Pt[] = [
  { x: 3, y: 10 },
  { x: -3, y: 12 },
  { x: 0, y: 27 },
  { x: 9, y: 33 },
  { x: -9, y: 36 },
];
/** Free throws: the other four on offence, then the five on defence. */
const LANE_OFFENSE: readonly Pt[] = [
  { x: -6, y: 10 },
  { x: 6, y: 14 },
  { x: -15, y: 30 },
  { x: 15, y: 32 },
];
const LANE_DEFENSE: readonly Pt[] = [
  { x: 6, y: 10 },
  { x: -6, y: 14 },
  { x: 12, y: 34 },
  { x: -12, y: 36 },
  { x: 0, y: 40 },
];

/**
 * Nudges players apart where two circles would overlap, leaving the `fixed`
 * slots (a shooter and his guard) where they are.
 */
function separate(
  points: readonly Pt[],
  fixed: ReadonlySet<number>,
  minDistance = 3,
): Pt[] {
  const out = points.map((p) => ({ ...p }));
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < out.length; i++) {
      if (fixed.has(i)) continue;
      for (let j = 0; j < out.length; j++) {
        if (i === j) continue;
        const a = out[i] as Pt;
        const b = out[j] as Pt;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d >= minDistance) continue;
        const push = minDistance - d;
        const ux = d > 0.01 ? (a.x - b.x) / d : 1;
        const uy = d > 0.01 ? (a.y - b.y) / d : 0;
        out[i] = clampCourt({ x: a.x + ux * push, y: a.y + uy * push });
      }
    }
  }
  return out;
}

/**
 * Where a defender stands against an attacker at `spot`: between him and the
 * basket, at least `gap` feet away and a little to one side, so the two
 * circles never sit on top of each other.
 */
function guardSpot(spot: Pt, basket: Pt = BASKET, gap = 3.6, share = 0.25): Pt {
  const dx = basket.x - spot.x;
  const dy = basket.y - spot.y;
  const length = Math.hypot(dx, dy) || 1;
  const along = Math.min(length, Math.max(gap, length * share));
  return {
    x: spot.x + (dx / length) * along + (-dy / length) * 1.4,
    y: spot.y + (dy / length) * along + (dx / length) * 1.4,
  };
}

const lerp = (a: Pt, b: Pt, u: number): Pt => ({
  x: a.x + (b.x - a.x) * u,
  y: a.y + (b.y - a.y) * u,
});

/** Half-court coordinates for a team attacking right or left, on the full court. */
const toCourt = (right: boolean, p: Pt): Pt =>
  right ? { x: COURT_LENGTH - p.y, y: 25 + p.x } : { x: p.y, y: 25 - p.x };

const clampCourt = (p: Pt): Pt => ({
  x: Math.min(COURT_LENGTH - 0.5, Math.max(0.5, p.x)),
  y: Math.min(COURT_WIDTH - 0.5, Math.max(0.5, p.y)),
});

const periodSeconds = (period: number): number =>
  period <= 4 ? PERIOD_SECONDS : OVERTIME_SECONDS;

/** Seconds of game time from the opening tip to a play. */
function gameElapsed(play: PlayEvent): number {
  let before = 0;
  for (let p = 1; p < play.period; p++) before += periodSeconds(p);
  if (play.kind === "period-start") return before;
  if (play.kind === "period-end") return before + periodSeconds(play.period);
  return before + (periodSeconds(play.period) - play.clock);
}

/** The bench, off the court, where players wait to come on. */
const bench = (slot: number): Pt =>
  slot < 5
    ? { x: 22 + 6 * slot, y: -5 }
    : { x: 22 + 6 * (slot - 5), y: COURT_WIDTH + 5 };

/** Where the ten players stand for a jump ball at the start of a period. */
function jumpBall(): Pt[] {
  const home: Pt[] = [
    { x: 45, y: 25 },
    { x: 38, y: 17 },
    { x: 38, y: 33 },
    { x: 31, y: 21 },
    { x: 31, y: 29 },
  ];
  const away: Pt[] = [
    { x: 49, y: 25 },
    { x: 56, y: 17 },
    { x: 56, y: 33 },
    { x: 63, y: 21 },
    { x: 63, y: 29 },
  ];
  return [...home, ...away];
}

export function buildTimeline(
  plays: readonly PlayEvent[],
  rosters: ViewRosters,
  starters: ViewLineups,
): GameTimeline {
  const positionOf = new Map<string, Position>();
  for (const team of [rosters.home, rosters.away]) {
    for (const p of team.players) positionOf.set(p.id, p.position);
  }
  const sideOf = (teamId: string | null): 0 | 1 =>
    teamId === rosters.home.id ? 0 : 1;

  const ids: string[] = [...starters.home, ...starters.away];
  let cur: Pt[] = jumpBall();
  const frames: TimelineFrame[] = [];
  const playTimes: number[] = [];
  const eventFrames: number[] = [];
  /** The frame at which each play is revealed, so times can be adjusted afterwards. */
  const playFrame: number[] = [];
  let revealed = -1;
  let possession: 0 | 1 | null = null;
  /** False after a change of possession until the new team has brought the ball up. */
  let advanced = true;

  const slotsOf = (side: 0 | 1): number[] =>
    side === 0 ? [0, 1, 2, 3, 4] : [5, 6, 7, 8, 9];
  const slotOfId = (id: string | null): number =>
    id === null ? -1 : ids.indexOf(id);
  /** A side's slots in positional order: point guard first, centre last. */
  const byRole = (side: 0 | 1): number[] =>
    [...slotsOf(side)].sort(
      (a, b) =>
        POSITION_ORDER.indexOf(positionOf.get(ids[a] as string) ?? "SF") -
          POSITION_ORDER.indexOf(positionOf.get(ids[b] as string) ?? "SF") ||
        a - b,
    );
  const attackRight = (period: number, side: 0 | 1): boolean =>
    attacksRight(period, side === 0);
  const direction = (period: number, side: 0 | 1): number =>
    attackRight(period, side) ? 1 : -1;
  const ballWith = (slot: number, period: number): Pt => {
    const side = slot < 5 ? 0 : 1;
    const p = cur[slot];
    if (!p) return { x: 47, y: 25 };
    return { x: p.x + 1.4 * direction(period, side), y: p.y + 0.8 };
  };

  const snap = (t: number, ball: Pt, holder: number): void => {
    frames.push({
      t,
      pos: cur.flatMap((p) => [p.x, p.y]),
      ball: [ball.x, ball.y],
      holder,
      ids: ids.slice(),
      play: revealed,
    });
  };

  /** Everyone's place for a half-court set or a fast break, offence at its basket. */
  const formation = (
    offense: 0 | 1,
    period: number,
    mode: "set" | "break",
    lead: number,
  ): Pt[] => {
    const right = attackRight(period, offense);
    const out = cur.map((p) => ({ ...p }));
    const attackers = byRole(offense);
    const defenders = byRole(offense === 0 ? 1 : 0);
    if (mode === "set") {
      attackers.forEach((slot, role) => {
        out[slot] = toCourt(right, SET[role] as Pt);
      });
      defenders.forEach((slot, role) => {
        out[slot] = toCourt(right, guardSpot(SET[role] as Pt));
      });
    } else {
      const ordered = [
        ...(lead >= 0 && attackers.includes(lead) ? [lead] : []),
        ...attackers.filter((s) => s !== lead),
      ];
      ordered.forEach((slot, i) => {
        out[slot] = toCourt(right, BREAK_OFFENSE[i] as Pt);
      });
      defenders.forEach((slot, i) => {
        out[slot] = toCourt(right, BREAK_DEFENSE[i] as Pt);
      });
    }
    return out.map(clampCourt);
  };

  /** Everyone partway between where they are and where they are going. */
  const between = (to: readonly Pt[], u: number): Pt[] =>
    cur.map((p, i) => lerp(p, to[i] as Pt, u));

  let animT = 0;
  let lastGame = 0;
  let previous: PlayEvent | null = null;

  plays.forEach((play, i) => {
    const gameNow = gameElapsed(play);
    const delta = Math.max(0, gameNow - lastGame);
    lastGame = gameNow;
    const dur = Math.max(DWELL[play.kind], delta * SCALE);
    const t0 = animT;
    const tEv = t0 + dur;
    const at: Pt = play.at ? { x: play.at.x, y: play.at.y } : { x: 47, y: 25 };
    const ballNow = (): { ball: Pt; holder: number } => {
      const last = frames[frames.length - 1];
      return {
        ball: last ? { x: last.ball[0], y: last.ball[1] } : { x: 47, y: 25 },
        holder: last ? last.holder : -1,
      };
    };
    if (frames.length === 0) snap(0, { x: 47, y: 25 }, -1);

    const side = sideOf(play.teamId);
    const other: 0 | 1 = side === 0 ? 1 : 0;

    switch (play.kind) {
      case "period-start": {
        possession = null;
        cur = jumpBall();
        snap(tEv, { x: 47, y: 25 }, -1);
        break;
      }

      case "period-end": {
        snap(tEv, ballNow().ball, ballNow().holder);
        break;
      }

      case "substitution": {
        const slot = slotOfId(play.outPlayerId);
        if (slot >= 0 && play.playerId) {
          // Swap at once: the new player waits at the bench, then jogs on.
          const { ball, holder } = ballNow();
          snap(t0 + 0.001, ball, holder);
          ids[slot] = play.playerId;
          cur[slot] = bench(slot);
          // If the player leaving had the ball, it is loose until the next play.
          snap(t0 + 0.002, ball, holder === slot ? -1 : holder);
          const mate = possession ?? 0;
          const target = formation(mate, play.period, "set", -1)[slot] as Pt;
          const next = cur.map((p) => ({ ...p }));
          next[slot] = target;
          cur = next;
        }
        {
          const { ball, holder } = ballNow();
          snap(tEv, ball, holder);
        }
        break;
      }

      case "rebound": {
        const slot = slotOfId(play.playerId);
        const mine = play.teamId ? side : 0;
        // Everyone crashes the boards: a ring of players around the rebound.
        const next = cur.map((p, s) => {
          if (s === slot) return at;
          const angle = (s + 1) * 1.7 + play.seq * 0.3;
          const radius = 4 + (s % 3) * 2.2;
          return clampCourt({
            x: at.x + Math.cos(angle) * radius,
            y: at.y + Math.sin(angle) * radius,
          });
        });
        // The shot's ball drops toward the rim, then to the rebounder.
        cur = next;
        // A defensive board still has to be brought up the floor.
        advanced = play.offensive === true ? advanced : false;
        possession = mine;
        snap(tEv, ballWith(slot, play.period), slot);
        break;
      }

      case "foul": {
        const offense: 0 | 1 = other;
        const handler = byRole(offense)[0] as number;
        const fouler = slotOfId(play.playerId);
        const next = formation(offense, play.period, "set", -1);
        next[handler] = at;
        if (fouler >= 0) {
          next[fouler] = clampCourt({
            x: at.x - 1.2 * direction(play.period, offense),
            y: at.y + 1.2,
          });
        }
        cur = next;
        possession = offense;
        snap(tEv, ballWith(handler, play.period), handler);
        break;
      }

      case "free-throw": {
        const shooter = slotOfId(play.playerId);
        const right = attackRight(play.period, side);
        const next = cur.map((p) => ({ ...p }));
        const attackers = byRole(side).filter((s) => s !== shooter);
        const defenders = byRole(other);
        attackers.forEach((slot, k) => {
          next[slot] = clampCourt(toCourt(right, LANE_OFFENSE[k] as Pt));
        });
        defenders.forEach((slot, k) => {
          next[slot] = clampCourt(toCourt(right, LANE_DEFENSE[k] as Pt));
        });
        if (shooter >= 0) next[shooter] = at;
        cur = next;
        possession = side;
        eventFrames[i] = frames.length;
        snap(tEv, ballWith(shooter, play.period), shooter);
        if (play.made) {
          const basket = toCourt(right, BASKET);
          snap(tEv + BALL_IN_FLIGHT, basket, -1);
          animT = tEv + BALL_IN_FLIGHT;
          revealedAt(i, animT);
          return;
        }
        break;
      }

      case "turnover":
      case "made-shot":
      case "missed-shot": {
        // The team with the ball must first bring it up, unless it already has it.
        const needsAdvance = possession !== side || !advanced;
        const shooter = slotOfId(play.playerId);
        const lead = leadSlot(previous, play, shooter, side);
        if (needsAdvance) {
          const mode = play.transition ? "break" : "set";
          const goal = formation(side, play.period, mode, lead);
          cur = between(goal, play.transition ? 0.6 : 1);
          const handler = lead >= 0 ? lead : (byRole(side)[0] as number);
          snap(t0 + dur * 0.5, ballWith(handler, play.period), handler);
        }
        const mode = play.transition ? "break" : "set";
        advanced = true;
        const next = formation(side, play.period, mode, lead);
        const right = attackRight(play.period, side);
        const defendersOf = byRole(other);

        if (play.kind === "turnover") {
          const loser = slotOfId(play.playerId);
          const thief = slotOfId(play.stealPlayerId);
          if (loser >= 0) next[loser] = at;
          if (thief >= 0) {
            next[thief] = clampCourt({
              x: at.x + 1.5 * direction(play.period, side),
              y: at.y - 1.2,
            });
          }
          cur = next;
          possession = side;
          snap(
            tEv,
            thief >= 0 ? ballWith(thief, play.period) : at,
            thief >= 0 ? thief : -1,
          );
          break;
        }

        if (shooter >= 0) next[shooter] = at;
        // A defender is right on the shooter.
        const matchRole = byRole(side).indexOf(shooter);
        const guard = defendersOf[Math.max(0, matchRole)];
        if (guard !== undefined && shooter >= 0) {
          next[guard] = clampCourt(
            guardSpot(at, toCourt(right, BASKET), 3.8, 0.12),
          );
        }
        const settled = separate(next, new Set([shooter, guard ?? -1]));
        // An assist: the ball is passed to the shooter just before he shoots.
        const passer = slotOfId(play.assistPlayerId);
        if (passer >= 0 && passer !== shooter) {
          cur = between(settled, 0.85);
          snap(t0 + dur * 0.85, ballWith(passer, play.period), passer);
        }
        cur = settled;
        possession = side;
        eventFrames[i] = frames.length;
        snap(tEv, ballWith(shooter, play.period), shooter);
        if (play.kind === "made-shot") {
          snap(tEv + BALL_IN_FLIGHT, toCourt(right, BASKET), -1);
          animT = tEv + BALL_IN_FLIGHT;
          revealedAt(i, animT);
          return;
        }
        break;
      }
    }
    if (eventFrames[i] === undefined) eventFrames[i] = frames.length - 1;
    animT = tEv;
    revealedAt(i, tEv);
    previous = play;
  });

  /** Marks a play's result as revealed at a time, on the frame at that time. */
  function revealedAt(index: number, t: number): void {
    revealed = index;
    playTimes[index] = t;
    playFrame[index] = frames.length - 1;
    const last = frames[frames.length - 1];
    if (last && last.t === t)
      frames[frames.length - 1] = { ...last, play: index };
    previous = plays[index] ?? previous;
  }

  /** Who runs the break: the player who just stole or rebounded the ball, if it was a break. */
  function leadSlot(
    before: PlayEvent | null,
    play: PlayEvent,
    shooter: number,
    side: 0 | 1,
  ): number {
    if (!play.transition) return -1;
    const fromSteal = before?.kind === "turnover" ? before.stealPlayerId : null;
    const fromBoard = before?.kind === "rebound" ? before.playerId : null;
    const wanted = slotOfId(fromSteal ?? fromBoard);
    if (wanted >= 0 && (wanted < 5 ? 0 : 1) === side) return wanted;
    return shooter >= 0 ? shooter : -1;
  }

  limitSpeed(frames);
  playFrame.forEach((frame, index) => {
    playTimes[index] = (frames[frame] as TimelineFrame).t;
  });
  const last = frames[frames.length - 1];
  return {
    frames,
    duration: last ? last.t : 0,
    playTimes,
    eventFrames,
  };
}

/**
 * The fastest a player may move, in feet per animation second: a sprint of
 * about 25 feet per game second, at the viewer's normal double speed. Where a
 * segment would need more, it is stretched in time, which also delays
 * everything after it.
 */
const MAX_SPEED = 48;

function limitSpeed(frames: TimelineFrame[]): void {
  let shift = 0;
  for (let k = 1; k < frames.length; k++) {
    const a = frames[k - 1] as TimelineFrame;
    const b = frames[k] as TimelineFrame;
    if (a.ids.every((id, s) => id === b.ids[s])) {
      let farthest = 0;
      for (let s = 0; s < 10; s++) {
        farthest = Math.max(
          farthest,
          Math.hypot(
            (b.pos[s * 2] as number) - (a.pos[s * 2] as number),
            (b.pos[s * 2 + 1] as number) - (a.pos[s * 2 + 1] as number),
          ),
        );
      }
      const available = b.t + shift - a.t;
      const needed = farthest / MAX_SPEED;
      if (available < needed) shift += needed - available;
    }
    frames[k] = { ...b, t: b.t + shift };
  }
}

/** What a viewer draws at one moment. */
export type TimelineSample = {
  players: { slot: number; id: string; team: 0 | 1; x: number; y: number }[];
  ball: { x: number; y: number };
  holder: number;
  /** Index of the last play revealed at this moment; -1 before the first. */
  play: number;
};

const ease = (u: number): number => u * u * (3 - 2 * u);

/** Positions at animation time `t`, smoothly interpolated between frames. */
export function sampleTimeline(
  timeline: GameTimeline,
  t: number,
): TimelineSample {
  const { frames } = timeline;
  const first = frames[0];
  if (!first) {
    return { players: [], ball: { x: 47, y: 25 }, holder: -1, play: -1 };
  }
  const clamped = Math.min(Math.max(t, 0), timeline.duration);
  // The last frame at or before t.
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((frames[mid] as TimelineFrame).t <= clamped) lo = mid;
    else hi = mid - 1;
  }
  const a = frames[lo] as TimelineFrame;
  const b = frames[Math.min(lo + 1, frames.length - 1)] as TimelineFrame;
  const span = b.t - a.t;
  const u =
    span > 0 ? ease(Math.min(1, Math.max(0, (clamped - a.t) / span))) : 0;
  // A player swapped in between two frames is shown where he is going.
  const sameLineup = a.ids.every((id, i) => id === b.ids[i]);
  const players = a.ids.map((id, slot) => {
    const ax = a.pos[slot * 2] as number;
    const ay = a.pos[slot * 2 + 1] as number;
    const bx = (sameLineup ? b : a).pos[slot * 2] as number;
    const by = (sameLineup ? b : a).pos[slot * 2 + 1] as number;
    return {
      slot,
      id,
      team: (slot < 5 ? 0 : 1) as 0 | 1,
      x: ax + (bx - ax) * u,
      y: ay + (by - ay) * u,
    };
  });
  return {
    players,
    ball: {
      x: a.ball[0] + (b.ball[0] - a.ball[0]) * u,
      y: a.ball[1] + (b.ball[1] - a.ball[1]) * u,
    },
    holder: u < 0.5 ? a.holder : b.holder,
    play: a.play,
  };
}

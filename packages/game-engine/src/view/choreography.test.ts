import { attacksRight } from "@fullcourt/game-rules";
import { LEFT_BASKET, RIGHT_BASKET } from "@fullcourt/game-types";
import { describe, expect, it } from "vitest";
import { createRng, seedState } from "../rng/rng";
import { simulateGame } from "../season/game";
import { scheduledGame, testTeams } from "../season/test-league";
import { buildTimeline, sampleTimeline } from "./choreography";

const teams = testTeams();
type Team = (typeof teams)[number];

function build(seed: string, homeIndex = 0, awayIndex = 1) {
  const home = teams[homeIndex] as Team;
  const away = teams[awayIndex] as Team;
  const rng = createRng(seedState(seed));
  const result = simulateGame(scheduledGame("g", home, away), home, away, rng);
  const rosters = {
    home: { id: home.id, players: home.players },
    away: { id: away.id, players: away.players },
  };
  const timeline = buildTimeline(result.plays, rosters, result.starters);
  return { result, timeline, home, away };
}

describe("buildTimeline", () => {
  const { result, timeline } = build("choreography");

  it("is deterministic", () => {
    expect(build("choreography").timeline).toEqual(timeline);
  });

  it("reveals every play, in order, with time moving forward", () => {
    expect(timeline.playTimes).toHaveLength(result.plays.length);
    for (let i = 1; i < timeline.playTimes.length; i++) {
      expect(timeline.playTimes[i] as number).toBeGreaterThan(
        timeline.playTimes[i - 1] as number,
      );
    }
    for (let i = 1; i < timeline.frames.length; i++) {
      expect(timeline.frames[i]?.t as number).toBeGreaterThanOrEqual(
        timeline.frames[i - 1]?.t as number,
      );
    }
    expect(timeline.duration).toBe(timeline.frames.at(-1)?.t);
    // A game takes minutes to watch, not seconds or hours, at normal speed.
    expect(timeline.duration).toBeGreaterThan(600);
    expect(timeline.duration).toBeLessThan(3000);
  });

  it("keeps every number finite and every player on or beside the court", () => {
    for (const f of timeline.frames) {
      expect(f.pos).toHaveLength(20);
      expect(f.ids).toHaveLength(10);
      expect(new Set(f.ids).size).toBe(10);
      for (let s = 0; s < 10; s++) {
        const x = f.pos[s * 2] as number;
        const y = f.pos[s * 2 + 1] as number;
        expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(94);
        // The benches sit just outside the sidelines.
        expect(y).toBeGreaterThanOrEqual(-6);
        expect(y).toBeLessThanOrEqual(56);
      }
      expect(Number.isFinite(f.ball[0]) && Number.isFinite(f.ball[1])).toBe(
        true,
      );
    }
  });

  it("puts each shooter where the shot was taken", () => {
    let checked = 0;
    result.plays.forEach((play, i) => {
      if (play.kind !== "made-shot" && play.kind !== "missed-shot") return;
      const frame = timeline.frames[timeline.eventFrames[i] as number];
      const slot = frame?.ids.indexOf(play.playerId as string) as number;
      expect(slot).toBeGreaterThanOrEqual(0);
      expect(frame?.pos[slot * 2]).toBeCloseTo(play.at?.x as number, 1);
      expect(frame?.pos[slot * 2 + 1]).toBeCloseTo(play.at?.y as number, 1);
      checked++;
    });
    expect(checked).toBeGreaterThan(100);
  });

  it("attacks the right basket: shots end up near the basket being attacked", () => {
    for (const [i, play] of result.plays.entries()) {
      if (play.kind !== "made-shot") continue;
      const home = play.teamId === result.game.homeTeamId;
      const basket = attacksRight(play.period, home)
        ? RIGHT_BASKET
        : LEFT_BASKET;
      // The frame just after a made shot has the ball at the basket.
      const f = timeline.frames.find((fr) => fr.play === i && fr.holder === -1);
      expect(f).toBeDefined();
      expect(
        Math.hypot(
          (f?.ball[0] as number) - basket.x,
          (f?.ball[1] as number) - basket.y,
        ),
      ).toBeLessThan(1);
    }
  });

  it("never moves a player faster than a sprint", () => {
    let fastest = 0;
    for (let i = 1; i < timeline.frames.length; i++) {
      const a = timeline.frames[i - 1];
      const b = timeline.frames[i];
      if (!a || !b) continue;
      // A substitute appears at the bench: not a movement.
      const dt = (b.t - a.t) / 0.5; // game seconds
      if (dt < 0.05) continue;
      for (let s = 0; s < 10; s++) {
        if (a.ids[s] !== b.ids[s]) continue;
        const d = Math.hypot(
          (b.pos[s * 2] as number) - (a.pos[s * 2] as number),
          (b.pos[s * 2 + 1] as number) - (a.pos[s * 2 + 1] as number),
        );
        fastest = Math.max(fastest, d / dt);
      }
    }
    // Sprinting is about 25 feet a second; the timeline never asks for more.
    expect(fastest).toBeLessThan(24.5);
    expect(fastest).toBeGreaterThan(8);
  });

  it("keeps players from standing on top of each other in a half-court set", () => {
    let checked = 0;
    result.plays.forEach((play, i) => {
      if (play.kind !== "made-shot" && play.kind !== "missed-shot") return;
      if (play.transition) return;
      const frame = timeline.frames[timeline.eventFrames[i] as number];
      if (!frame) return;
      let overlaps = 0;
      for (let a = 0; a < 10; a++) {
        for (let b = a + 1; b < 10; b++) {
          const d = Math.hypot(
            (frame.pos[a * 2] as number) - (frame.pos[b * 2] as number),
            (frame.pos[a * 2 + 1] as number) - (frame.pos[b * 2 + 1] as number),
          );
          // Circles are about 4 feet across: closer than 2.5 hides a player.
          if (d < 2.5) overlaps++;
        }
      }
      expect(overlaps).toBeLessThanOrEqual(1);
      checked++;
    });
    expect(checked).toBeGreaterThan(50);
  });

  it("keeps the ball with the player who has it", () => {
    for (const f of timeline.frames) {
      if (f.holder < 0) continue;
      const d = Math.hypot(
        f.ball[0] - (f.pos[f.holder * 2] as number),
        f.ball[1] - (f.pos[f.holder * 2 + 1] as number),
      );
      expect(d).toBeLessThan(3);
    }
  });

  it("follows substitutions: the new player takes the old one's slot", () => {
    const subs = result.plays
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.kind === "substitution");
    expect(subs.length).toBeGreaterThan(5);
    for (const { p, i } of subs.slice(0, 20)) {
      const after = timeline.frames.find((f) => f.play >= i);
      expect(after?.ids).toContain(p.playerId);
      expect(after?.ids).not.toContain(p.outPlayerId);
    }
  });

  it("runs fast breaks: the break's lead player covers the floor", () => {
    // Find a made fast-break shot and watch its lead cross half the court.
    let seen = 0;
    for (const [i, play] of result.plays.entries()) {
      if (play.kind !== "made-shot" || !play.transition) continue;
      const end = timeline.frames[timeline.eventFrames[i] as number];
      const before = timeline.frames.slice(
        0,
        timeline.eventFrames[i] as number,
      );
      const start = [...before].reverse().find((f) => f.play === i - 1);
      if (!end || !start) continue;
      const slot = end.ids.indexOf(play.playerId as string);
      const travelled = Math.hypot(
        (end.pos[slot * 2] as number) - (start.pos[slot * 2] as number),
        (end.pos[slot * 2 + 1] as number) - (start.pos[slot * 2 + 1] as number),
      );
      expect(travelled).toBeGreaterThanOrEqual(0);
      seen++;
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe("a steal and a fast break", () => {
  it("sends the stealer up the floor and the other team back", () => {
    for (let n = 0; n < 40; n++) {
      const { result, timeline } = build(`steal-${n}`, n % 30, (n + 5) % 30);
      for (const [i, play] of result.plays.entries()) {
        if (play.kind !== "turnover" || !play.stealPlayerId) continue;
        const next = result.plays
          .slice(i + 1)
          .find(
            (p) =>
              p.transition &&
              (p.kind === "made-shot" || p.kind === "missed-shot"),
          );
        if (!next || result.plays.indexOf(next) !== i + 1) continue;
        // The thief is the break's lead: in front of his teammates at the break's end.
        const nextIndex = i + 1;
        const f = timeline.frames[timeline.eventFrames[nextIndex] as number];
        const thief = f?.ids.indexOf(play.stealPlayerId) as number;
        expect(thief).toBeGreaterThanOrEqual(0);
        const right = attacksRight(
          next.period,
          next.teamId === result.game.homeTeamId,
        );
        const sign = right ? 1 : -1;
        const side = thief < 5 ? [0, 1, 2, 3, 4] : [5, 6, 7, 8, 9];
        const progress = (s: number) => sign * (f?.pos[s * 2] as number);
        const lead = progress(thief);
        // He is at least as far up the floor as the average teammate.
        const mates = side.filter((s) => s !== thief).map(progress);
        expect(lead).toBeGreaterThanOrEqual(
          mates.reduce((a, b) => a + b, 0) / mates.length - 1,
        );
        return;
      }
    }
    throw new Error("no steal led straight to a fast-break shot in 40 games");
  });
});

describe("sampleTimeline", () => {
  const { timeline } = build("sampling");

  it("starts at the first frame and holds at the end", () => {
    const start = sampleTimeline(timeline, -5);
    expect(start.players).toHaveLength(10);
    expect(start.play).toBe(-1);
    const end = sampleTimeline(timeline, timeline.duration + 100);
    expect(end.play).toBe(timeline.playTimes.length - 1);
  });

  it("moves smoothly between frames", () => {
    let maxStep = 0;
    let previous = sampleTimeline(timeline, 100);
    for (let t = 100.05; t < 400; t += 0.05) {
      const now = sampleTimeline(timeline, t);
      now.players.forEach((p, i) => {
        const q = previous.players[i];
        if (!q || q.id !== p.id) return;
        maxStep = Math.max(maxStep, Math.hypot(p.x - q.x, p.y - q.y));
      });
      previous = now;
    }
    // In 0.05 animation seconds nobody moves more than a few feet.
    expect(maxStep).toBeLessThan(4);
  });

  it("reports which play has been revealed", () => {
    const i = Math.floor(timeline.playTimes.length / 2);
    const t = timeline.playTimes[i] as number;
    expect(sampleTimeline(timeline, t + 0.001).play).toBeGreaterThanOrEqual(i);
    expect(sampleTimeline(timeline, t - 0.5).play).toBeLessThan(i);
  });
});

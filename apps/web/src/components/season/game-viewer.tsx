"use client";

import {
  buildTimeline,
  describePlay,
  formatClock,
  periodLabel,
  replayGame,
  restoreTeams,
  sampleTimeline,
  type GameTimeline,
  type ReplaySnapshot,
} from "@fullcourt/game-engine";
import type { PlayEvent } from "@fullcourt/game-types";
import type {
  GamePlays,
  GameReplayPayload,
  GameSummary,
} from "@fullcourt/validation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Court } from "./court";

export type ViewerTeam = {
  id: string;
  name: string;
  abbreviation: string;
  primaryColor: string;
  secondaryColor: string;
};

export type ViewerPlayer = { id: string; name: string; jersey: number };

type Prepared = { plays: PlayEvent[]; timeline: GameTimeline };

const SPEEDS = [1, 2, 4, 8] as const;

type Roster = Parameters<typeof buildTimeline>[1];
type Starters = Parameters<typeof buildTimeline>[2];

function toTimeline(
  plays: PlayEvent[],
  snapshot: ReplaySnapshot,
  starters: Starters,
): Prepared {
  const { home, away } = restoreTeams(snapshot);
  const rosters: Roster = {
    home: { id: home.id, players: home.players },
    away: { id: away.id, players: away.players },
  };
  return { plays, timeline: buildTimeline(plays, rosters, starters) };
}

/**
 * Replays the game on this device from its saved recipe. The replay has to end
 * on the stored final score; if it doesn't (a browser that rounds a number
 * differently, say) the caller asks the server for the plays instead.
 */
function prepare(
  game: GameSummary,
  replay: GameReplayPayload,
): Prepared | null {
  try {
    const snapshot = replay.snapshot as unknown as ReplaySnapshot;
    const state = replay.rngState;
    const result = replayGame(
      {
        id: game.id,
        day: game.day,
        homeTeamId: game.homeTeamId,
        awayTeamId: game.awayTeamId,
      },
      snapshot,
      [
        state[0] as number,
        state[1] as number,
        state[2] as number,
        state[3] as number,
      ],
    );
    if (
      result.game.homeScore !== game.homeScore ||
      result.game.awayScore !== game.awayScore
    ) {
      return null;
    }
    return toTimeline(result.plays, snapshot, result.starters);
  } catch {
    return null;
  }
}

/**
 * Watch a game on the full court: ten players and the ball move from play to
 * play (fast breaks, steals, passes, rebounds, substitutions) with a
 * scoreboard and a feed. Starts paused; nothing plays until asked.
 */
export function GameViewer({
  leagueId,
  game,
  home,
  away,
  players,
  replay,
}: {
  leagueId: string;
  game: GameSummary;
  home: ViewerTeam;
  away: ViewerTeam;
  players: readonly ViewerPlayer[];
  replay: GameReplayPayload;
}) {
  const local = useMemo(() => prepare(game, replay), [game, replay]);
  const [fallback, setFallback] = useState<Prepared | null>(null);
  const [failed, setFailed] = useState(false);

  // The server replays the game when this device's replay doesn't match.
  useEffect(() => {
    if (local) return;
    let cancelled = false;
    fetch(`/api/v1/leagues/${leagueId}/games/${game.id}/plays`)
      .then((r) => (r.ok ? (r.json() as Promise<GamePlays>) : Promise.reject()))
      .then((body) => {
        if (cancelled) return;
        setFallback(
          toTimeline(
            body.plays as PlayEvent[],
            replay.snapshot as unknown as ReplaySnapshot,
            body.starters,
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [local, leagueId, game.id, replay.snapshot]);

  const prepared = local ?? fallback;
  if (!prepared) {
    return (
      <p
        role={failed ? "alert" : "status"}
        className="rounded-lg border border-border bg-surface p-5 text-text-muted"
      >
        {failed
          ? "This game can't be replayed right now. The box score is still available."
          : "Getting the game ready…"}
      </p>
    );
  }
  return (
    <Player prepared={prepared} home={home} away={away} players={players} />
  );
}

function Player({
  prepared,
  home,
  away,
  players,
}: {
  prepared: Prepared;
  home: ViewerTeam;
  away: ViewerTeam;
  players: readonly ViewerPlayer[];
}) {
  const { plays, timeline } = prepared;
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [showAll, setShowAll] = useState(false);
  const tRef = useRef(0);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const who = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const nameOf = (id: string | null) =>
    id ? (who.get(id)?.name ?? "A player") : "";

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const next = Math.min(
        timeline.duration,
        tRef.current + ((now - last) / 1000) * speed,
      );
      last = now;
      setT(next);
      if (next >= timeline.duration) {
        setPlaying(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, timeline.duration]);

  const sample = sampleTimeline(timeline, t);
  const current = sample.play >= 0 ? plays[sample.play] : undefined;
  const atEnd = t >= timeline.duration;
  const homeScore = current?.homeScore ?? 0;
  const awayScore = current?.awayScore ?? 0;
  const period = current?.period ?? 1;
  const clockText =
    current && current.kind !== "period-start"
      ? formatClock(current.clock)
      : "12:00";
  const periodText = periodLabel(period);

  const seek = (index: number) => {
    const target =
      timeline.playTimes[Math.max(0, Math.min(index, plays.length - 1))];
    setT(target ?? 0);
    setPlaying(false);
  };

  const feed = plays
    .slice(0, sample.play + 1)
    .slice(-8)
    .reverse();

  const colorOf = (team: 0 | 1) => (team === 0 ? home : away);

  return (
    <section aria-label="Game viewer" className="flex flex-col gap-4">
      <div
        className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface px-4 py-3"
        role="group"
        aria-label="Scoreboard"
      >
        <TeamScore team={away} score={awayScore} />
        <div className="text-center">
          <p className="text-2xl font-black tabular-nums">{clockText}</p>
          <p className="text-sm font-semibold text-text-muted">{periodText}</p>
        </div>
        <TeamScore team={home} score={homeScore} />
      </div>

      <Court
        label={`Court: ${away.name} at ${home.name}, ${periodText} ${clockText}`}
      >
        {/* Benches' players and the five on the floor for each team. */}
        {sample.players.map((p) => {
          const team = colorOf(p.team);
          const holder = sample.holder === p.slot;
          return (
            <g
              key={p.slot}
              transform={`translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`}
            >
              <circle
                r={holder ? 2.5 : 2.1}
                fill={team.primaryColor}
                stroke={holder ? "var(--fc-color-accent)" : team.secondaryColor}
                strokeWidth={holder ? 0.7 : 0.5}
              />
              <text
                y={0.75}
                textAnchor="middle"
                fontSize={2.2}
                fontWeight={700}
                // Team colours come from data, not the theme: white on a
                // primary colour is the one pairing guaranteed to be legible.
                fill="#ffffff"
              >
                {who.get(p.id)?.jersey ?? ""}
              </text>
            </g>
          );
        })}
        <circle
          cx={sample.ball.x}
          cy={sample.ball.y}
          r={1}
          fill="var(--fc-color-accent)"
          stroke="var(--fc-color-text)"
          strokeWidth={0.3}
        />
      </Court>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            onClick={() => {
              if (atEnd) setT(0);
              setPlaying((p) => !p);
            }}
          >
            {playing
              ? "Pause"
              : atEnd
                ? "Watch again"
                : t > 0
                  ? "Resume"
                  : "Play"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => seek(sample.play - 1)}
            disabled={sample.play <= 0}
          >
            Previous play
          </Button>
          <Button
            variant="secondary"
            onClick={() => seek(sample.play + 1)}
            disabled={sample.play >= plays.length - 1}
          >
            Next play
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setT(timeline.duration);
              setPlaying(false);
            }}
            disabled={atEnd}
          >
            Skip to end
          </Button>
        </div>

        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Playback speed"
        >
          <span className="text-sm font-semibold text-text-muted">Speed</span>
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={speed === s}
              onClick={() => setSpeed(s)}
              className={[
                "inline-flex min-h-touch min-w-touch items-center justify-center rounded-md border px-3 font-semibold",
                speed === s
                  ? "border-accent bg-accent-soft text-on-accent-soft"
                  : "border-border bg-surface text-text hover:bg-surface-muted",
              ].join(" ")}
            >
              {s}×
            </button>
          ))}
        </div>

        <label className="flex flex-col gap-1 text-sm font-semibold text-text-muted">
          Game progress
          <input
            type="range"
            min={0}
            max={Math.round(timeline.duration * 10)}
            value={Math.round(t * 10)}
            aria-valuetext={`${periodText} ${clockText}`}
            onChange={(e) => {
              setT(Number(e.target.value) / 10);
              setPlaying(false);
            }}
            className="min-h-touch w-full accent-accent"
          />
        </label>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <h3 className="mb-2 text-lg font-bold">Latest plays</h3>
        {feed.length === 0 ? (
          <p className="text-text-muted">Press play to start the game.</p>
        ) : (
          <ol className="flex flex-col gap-1">
            {feed.map((p) => (
              <PlayLine
                key={p.seq}
                play={p}
                text={describePlay(p, nameOf)}
                home={home}
                away={away}
              />
            ))}
          </ol>
        )}
        <details
          className="mt-3"
          onToggle={(e) =>
            setShowAll((e.currentTarget as HTMLDetailsElement).open)
          }
        >
          <summary className="min-h-touch cursor-pointer py-2 font-semibold">
            Full play-by-play so far
          </summary>
          {showAll ? (
            <div
              role="region"
              aria-label="Full play-by-play"
              tabIndex={0}
              className="max-h-96 overflow-y-auto rounded-md border border-border p-2"
            >
              <ol className="flex flex-col gap-1">
                {plays
                  .slice(0, sample.play + 1)
                  .filter(
                    (p) => p.kind !== "period-start" && p.kind !== "period-end",
                  )
                  .reverse()
                  .map((p) => (
                    <PlayLine
                      key={p.seq}
                      play={p}
                      text={describePlay(p, nameOf)}
                      home={home}
                      away={away}
                    />
                  ))}
              </ol>
            </div>
          ) : null}
        </details>
      </div>
    </section>
  );
}

function TeamScore({ team, score }: { team: ViewerTeam; score: number }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden="true"
        className="inline-flex h-9 w-12 shrink-0 items-center justify-center rounded-md border-b-4 text-sm font-black"
        style={{
          color: "#ffffff",
          backgroundColor: team.primaryColor,
          borderBottomColor: team.secondaryColor,
        }}
      >
        {team.abbreviation}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-text-muted">
          {team.name}
        </span>
        <span className="block text-3xl font-black tabular-nums">{score}</span>
      </span>
    </div>
  );
}

function PlayLine({
  play,
  text,
  home,
  away,
}: {
  play: PlayEvent;
  text: string;
  home: ViewerTeam;
  away: ViewerTeam;
}) {
  const team =
    play.teamId === home.id ? home : play.teamId === away.id ? away : null;
  return (
    <li className="flex items-baseline gap-2 text-sm tablet:text-base">
      <span className="w-20 shrink-0 whitespace-nowrap text-text-muted tabular-nums">
        {periodLabel(play.period)} {formatClock(play.clock)}
      </span>
      {team ? (
        <span className="w-9 shrink-0 font-semibold">{team.abbreviation}</span>
      ) : (
        <span className="w-9 shrink-0" />
      )}
      <span className={play.points > 0 ? "font-semibold" : ""}>{text}</span>
    </li>
  );
}

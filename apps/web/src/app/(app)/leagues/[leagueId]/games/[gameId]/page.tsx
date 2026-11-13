import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { teamName, TeamBadge } from "@/components/leagues/team-badge";
import { BoxScore } from "@/components/season/box-score";
import { GameViewer } from "@/components/season/game-viewer";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { ApiError } from "@/server/api/handler";
import { loadLeague } from "@/server/leagues/load";
import { getGame } from "@/server/services/season";
import { listTeams } from "@/server/services/world";

export const metadata: Metadata = { title: "Game" };

export default function GamePage({
  params,
  searchParams,
}: PageProps<"/leagues/[leagueId]/games/[gameId]">) {
  return (
    <Suspense
      fallback={
        <div className="h-96 animate-pulse rounded-lg bg-surface-muted" />
      }
    >
      <Game params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const tab = (active: boolean) =>
  [
    "inline-flex min-h-touch items-center rounded-md border px-4 font-semibold",
    active
      ? "border-accent bg-accent-soft text-on-accent-soft"
      : "border-border bg-surface text-text hover:bg-surface-muted",
  ].join(" ");

async function Game({
  params,
  searchParams,
}: {
  params: PageProps<"/leagues/[leagueId]/games/[gameId]">["params"];
  searchParams: PageProps<"/leagues/[leagueId]/games/[gameId]">["searchParams"];
}) {
  const { leagueId, gameId } = await params;
  const query = await searchParams;
  const { ctx, league } = await loadLeague(leagueId);

  let detail;
  try {
    detail = await getGame(ctx, league.id, gameId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  const teams = await listTeams(ctx, league.id);
  const home = teams.find((t) => t.id === detail.game.homeTeamId);
  const away = teams.find((t) => t.id === detail.game.awayTeamId);
  if (!home || !away) notFound();

  const { game } = detail;
  const base = `/leagues/${league.id}/games/${game.id}`;
  const final = game.status === "final";
  const canWatch = final && detail.replay !== null;
  const view = query.tab === "box" || !canWatch ? "box" : "watch";
  const overtime =
    game.overtimes === 0
      ? ""
      : game.overtimes === 1
        ? " · OT"
        : ` · ${game.overtimes}OT`;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/leagues/${league.id}/schedule`}
        className="-ml-2 inline-flex min-h-touch w-fit items-center gap-1 rounded-md px-2 font-semibold text-text-muted hover:text-text"
      >
        <Icon name="arrowRight" className="size-4 rotate-180" />
        Schedule
      </Link>

      <header className="flex flex-col gap-3">
        <h2 className="text-2xl font-black tracking-tight break-words desktop:text-3xl">
          {teamName(away)} at {teamName(home)}
        </h2>
        <p className="text-text-muted">
          Day {game.day} · {final ? `Final${overtime}` : "Not played yet"}
        </p>
        {final ? (
          <div
            role="group"
            aria-label="Final score"
            className="flex items-center gap-6 rounded-lg border border-border bg-surface px-4 py-3"
          >
            {[
              { team: away, score: game.awayScore },
              { team: home, score: game.homeScore },
            ].map(({ team, score }) => (
              <span key={team.id} className="flex items-center gap-3">
                <TeamBadge team={team} size="md" />
                <span className="text-3xl font-black tabular-nums">
                  {score}
                </span>
              </span>
            ))}
          </div>
        ) : null}
      </header>

      {!final ? (
        <EmptyState
          icon="calendar"
          title="This game hasn't been played yet"
          description="Simulate the season from the schedule and the game will appear here, with its box score and a replay you can watch."
        />
      ) : (
        <>
          {detail.replayStatus === "engine-updated" ? (
            <p
              role="note"
              className="rounded-md border border-border bg-surface px-4 py-3"
            >
              This game was played before a game engine update, so it can&apos;t
              be replayed exactly. Its score and box score are unchanged.
            </p>
          ) : null}
          {detail.replayStatus === "missing" ? (
            <p
              role="note"
              className="rounded-md border border-border bg-surface px-4 py-3"
            >
              Replays are only kept for the current season.
            </p>
          ) : null}
          <nav aria-label="Game view" className="flex gap-2">
            {canWatch ? (
              <Link
                href={base}
                aria-current={view === "watch" ? "true" : undefined}
                className={tab(view === "watch")}
              >
                Watch
              </Link>
            ) : null}
            <Link
              href={`${base}?tab=box`}
              aria-current={view === "box" ? "true" : undefined}
              className={tab(view === "box")}
            >
              Box score
            </Link>
          </nav>
          {view === "watch" && detail.replay ? (
            <GameViewer
              leagueId={league.id}
              game={game}
              home={{
                id: home.id,
                name: teamName(home),
                abbreviation: home.abbreviation,
                primaryColor: home.primaryColor,
                secondaryColor: home.secondaryColor,
              }}
              away={{
                id: away.id,
                name: teamName(away),
                abbreviation: away.abbreviation,
                primaryColor: away.primaryColor,
                secondaryColor: away.secondaryColor,
              }}
              players={detail.lines.map((l) => ({
                id: l.playerId,
                name: `${l.firstName[0]}. ${l.lastName}`,
                jersey: l.jersey,
              }))}
              replay={detail.replay}
            />
          ) : (
            <BoxScore
              leagueId={league.id}
              game={game}
              lines={detail.lines}
              home={home}
              away={away}
              selected={query.team === "away" ? "away" : "home"}
            />
          )}
        </>
      )}
    </div>
  );
}

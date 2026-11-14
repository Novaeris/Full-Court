import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import type { HistoryResponse, Team } from "@fullcourt/validation";
import { EmptyState } from "@/components/ui/empty-state";
import { loadLeague } from "@/server/leagues/load";
import { getHistory } from "@/server/services/history";
import { listTeams } from "@/server/services/world";

export const metadata: Metadata = { title: "History" };

export default function HistoryPage({
  params,
}: PageProps<"/leagues/[leagueId]/history">) {
  return (
    <Suspense
      fallback={
        <div className="h-64 animate-pulse rounded-lg bg-surface-muted" />
      }
    >
      <History params={params} />
    </Suspense>
  );
}

const teamName = (teams: readonly Team[], id: string | null) => {
  const t = teams.find((x) => x.id === id);
  return t ? `${t.city} ${t.nickname}` : "Unknown team";
};

function PlayerLink({
  leagueId,
  playerId,
  name,
}: {
  leagueId: string;
  playerId: string;
  name: string;
}) {
  return (
    <Link
      href={`/leagues/${leagueId}/players/${playerId}`}
      className="font-semibold text-accent underline underline-offset-4"
    >
      {name}
    </Link>
  );
}

async function History({
  params,
}: {
  params: PageProps<"/leagues/[leagueId]/history">["params"];
}) {
  const { leagueId } = await params;
  const { ctx, league } = await loadLeague(leagueId);
  const [history, teams] = await Promise.all([
    getHistory(ctx, league.id),
    listTeams(ctx, league.id),
  ]);

  if (history.seasons.length === 0) {
    return (
      <EmptyState
        icon="trophy"
        title="No history yet"
        description="Champions, awards and records appear here once a season has been played and the next one begins."
      />
    );
  }
  return (
    <div className="flex flex-col gap-8">
      <Titles history={history} teams={teams} />
      <Records leagueId={league.id} history={history} teams={teams} />
      <Seasons leagueId={league.id} history={history} teams={teams} />
    </div>
  );
}

function Titles({
  history,
  teams,
}: {
  history: HistoryResponse;
  teams: readonly Team[];
}) {
  if (history.titles.length === 0) return null;
  return (
    <section
      aria-labelledby="titles-heading"
      className="rounded-lg border border-border bg-surface p-5"
    >
      <h2 id="titles-heading" className="text-xl font-bold">
        Championships
      </h2>
      <ul className="mt-2">
        {history.titles.map((t) => (
          <li
            key={t.teamId}
            className="flex flex-wrap justify-between gap-3 border-t border-border py-2 first:border-t-0"
          >
            <span className="font-semibold">{teamName(teams, t.teamId)}</span>
            <span className="text-text-muted">
              {t.titles} {t.titles === 1 ? "title" : "titles"} · {t.finals}{" "}
              {t.finals === 1 ? "final" : "finals"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Records({
  leagueId,
  history,
  teams,
}: {
  leagueId: string;
  history: HistoryResponse;
  teams: readonly Team[];
}) {
  const { game, season, teams: best } = history.records;
  if (game.length + season.length + best.length === 0) return null;
  return (
    <section
      aria-labelledby="records-heading"
      className="rounded-lg border border-border bg-surface p-5"
    >
      <h2 id="records-heading" className="text-xl font-bold">
        Record book
      </h2>
      {game.length > 0 ? (
        <>
          <h3 className="mt-3 font-bold">Single game</h3>
          <ul>
            {game.map((r) => (
              <li
                key={r.label}
                className="border-t border-border py-2 first:border-t-0"
              >
                <span className="font-semibold tabular-nums">{r.value}</span>{" "}
                {r.label.toLowerCase().replace(" in a game", "")} ·{" "}
                <PlayerLink
                  leagueId={leagueId}
                  playerId={r.playerId}
                  name={r.name}
                />
                <span className="block text-sm text-text-muted">
                  {teamName(teams, r.teamId)} against{" "}
                  {teamName(teams, r.opponentId)}, day {r.day} of {r.year}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {season.length > 0 ? (
        <>
          <h3 className="mt-4 font-bold">Single season</h3>
          <ul>
            {season.map((r) => (
              <li
                key={r.label}
                className="border-t border-border py-2 first:border-t-0"
              >
                <span className="font-semibold tabular-nums">{r.value}</span>{" "}
                {r.label.toLowerCase().replace(" in a season", "")} ·{" "}
                <PlayerLink
                  leagueId={leagueId}
                  playerId={r.playerId}
                  name={r.name}
                />
                <span className="block text-sm text-text-muted">
                  {teamName(teams, r.teamId)}, {r.year}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {best.length > 0 ? (
        <>
          <h3 className="mt-4 font-bold">Best team records</h3>
          <ul>
            {best.map((r) => (
              <li
                key={`${r.teamId}-${r.year}`}
                className="border-t border-border py-2 first:border-t-0"
              >
                <span className="font-semibold tabular-nums">
                  {r.wins}-{r.losses}
                </span>{" "}
                {teamName(teams, r.teamId)}, {r.year}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

function Seasons({
  leagueId,
  history,
  teams,
}: {
  leagueId: string;
  history: HistoryResponse;
  teams: readonly Team[];
}) {
  return (
    <section aria-labelledby="seasons-heading" className="flex flex-col gap-4">
      <h2 id="seasons-heading" className="text-xl font-bold">
        Season by season
      </h2>
      {history.seasons.map((s) => (
        <article
          key={s.year}
          aria-labelledby={`season-${s.year}`}
          className="rounded-lg border border-border bg-surface p-5"
        >
          <h3 id={`season-${s.year}`} className="text-lg font-bold">
            {s.year}
          </h3>
          <p className="mt-1">
            <span className="font-semibold">Champion:</span>{" "}
            {s.championId ? teamName(teams, s.championId) : "none"}
            {s.finalistId ? (
              <span className="text-text-muted">
                {" "}
                (beat {teamName(teams, s.finalistId)})
              </span>
            ) : null}
          </p>
          {s.awards.length > 0 ? (
            <ul className="mt-2">
              {s.awards.map((a) => (
                <li
                  key={`${a.award}-${a.playerId}`}
                  className="flex flex-wrap justify-between gap-x-3 border-t border-border py-1.5 first:border-t-0"
                >
                  <span className="text-text-muted">{a.label}</span>
                  <span>
                    <PlayerLink
                      leagueId={leagueId}
                      playerId={a.playerId}
                      name={a.name}
                    />{" "}
                    <span className="text-text-muted">
                      {teamName(teams, a.teamId)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {s.allLeague.map((t) => (
            <div key={t.team} className="mt-3">
              <h4 className="font-semibold">
                All-league{" "}
                {t.team === 1 ? "first" : t.team === 2 ? "second" : "third"}{" "}
                team
              </h4>
              <p className="text-sm">
                {t.players.map((p, i) => (
                  <span key={p.playerId}>
                    {i > 0 ? ", " : ""}
                    <PlayerLink
                      leagueId={leagueId}
                      playerId={p.playerId}
                      name={p.name}
                    />{" "}
                    <span className="text-text-muted">{p.position}</span>
                  </span>
                ))}
              </p>
            </div>
          ))}
        </article>
      ))}
    </section>
  );
}

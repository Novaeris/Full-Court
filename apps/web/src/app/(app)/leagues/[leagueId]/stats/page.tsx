import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import type { Team } from "@fullcourt/validation";
import { EmptyState } from "@/components/ui/empty-state";
import { loadLeague } from "@/server/leagues/load";
import { getStats } from "@/server/services/stats";
import { listTeams } from "@/server/services/world";

export const metadata: Metadata = { title: "Stats" };

export default function StatsPage({
  params,
  searchParams,
}: PageProps<"/leagues/[leagueId]/stats">) {
  return (
    <Suspense
      fallback={
        <div className="h-64 animate-pulse rounded-lg bg-surface-muted" />
      }
    >
      <Stats params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Stats({
  params,
  searchParams,
}: {
  params: PageProps<"/leagues/[leagueId]/stats">["params"];
  searchParams: PageProps<"/leagues/[leagueId]/stats">["searchParams"];
}) {
  const { leagueId } = await params;
  const query = await searchParams;
  const playoffs = query.phase === "playoffs";
  const { ctx, league } = await loadLeague(leagueId);
  const [stats, teams] = await Promise.all([
    getStats(ctx, league.id, playoffs),
    listTeams(ctx, league.id),
  ]);
  const abbr = (id: string) =>
    teams.find((t: Team) => t.id === id)?.abbreviation ?? "";
  const base = `/leagues/${league.id}`;

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Statistics" className="flex flex-wrap gap-2">
        {[
          { label: "Regular season", href: `${base}/stats`, on: !playoffs },
          {
            label: "Playoffs",
            href: `${base}/stats?phase=playoffs`,
            on: playoffs,
          },
        ].map((t) => (
          <Link
            key={t.label}
            href={t.href}
            aria-current={t.on ? "page" : undefined}
            className={[
              "inline-flex min-h-touch items-center rounded-md border px-4 font-semibold",
              t.on
                ? "border-accent bg-accent-soft text-on-accent-soft"
                : "border-border text-text-muted hover:text-text",
            ].join(" ")}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {!stats.season || stats.games === 0 ? (
        <EmptyState
          icon="trophy"
          title={playoffs ? "No playoff games yet" : "No games yet"}
          description={
            playoffs
              ? "Playoff leaders appear once the playoffs begin."
              : "League leaders appear once the season has games to count. Simulate a day from the schedule."
          }
        />
      ) : (
        <>
          <p className="text-text-muted">
            {stats.season.year} {playoffs ? "playoffs" : "season"} · players
            need at least half the games of the most-used player to be ranked
          </p>
          <div className="grid gap-4 tablet:grid-cols-2">
            {stats.boards.map((b) => (
              <section
                key={b.id}
                aria-labelledby={`board-${b.id}`}
                className="rounded-lg border border-border bg-surface p-5"
              >
                <h2 id={`board-${b.id}`} className="text-lg font-bold">
                  {b.label}
                </h2>
                {b.leaders.length === 0 ? (
                  <p className="mt-2 text-text-muted">Nobody qualifies yet.</p>
                ) : (
                  <ol className="mt-2">
                    {b.leaders.map((l) => (
                      <li
                        key={l.playerId}
                        className="flex items-baseline justify-between gap-3 border-t border-border py-1.5 first:border-t-0"
                      >
                        <span className="min-w-0">
                          <span className="tabular-nums text-text-muted">
                            {l.rank}.
                          </span>{" "}
                          <Link
                            href={`${base}/players/${l.playerId}`}
                            className="font-semibold text-accent underline underline-offset-4"
                          >
                            {l.name}
                          </Link>{" "}
                          <span className="text-sm text-text-muted">
                            {l.position} {abbr(l.teamId)}
                          </span>
                        </span>
                        <span className="font-bold tabular-nums">
                          {b.unit === "percent"
                            ? `${l.value.toFixed(1)}%`
                            : l.value.toFixed(1)}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

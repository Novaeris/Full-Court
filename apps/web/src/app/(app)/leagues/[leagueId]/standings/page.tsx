import { powerRankings } from "@fullcourt/game-rules";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { TeamBadge, teamName } from "@/components/leagues/team-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { StandingsTables } from "@/components/season/standings-table";
import { loadLeague } from "@/server/leagues/load";
import { getStandings } from "@/server/services/season";
import { getStructure, listTeams } from "@/server/services/world";

export const metadata: Metadata = { title: "Standings" };

export default function StandingsPage({
  params,
  searchParams,
}: PageProps<"/leagues/[leagueId]/standings">) {
  return (
    <Suspense
      fallback={
        <div className="h-64 animate-pulse rounded-lg bg-surface-muted" />
      }
    >
      <Standings params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Standings({
  params,
  searchParams,
}: {
  params: PageProps<"/leagues/[leagueId]/standings">["params"];
  searchParams: PageProps<"/leagues/[leagueId]/standings">["searchParams"];
}) {
  const { leagueId } = await params;
  const power = (await searchParams).view === "power";
  const { ctx, league } = await loadLeague(leagueId);
  const { season, rows } = await getStandings(ctx, league.id);

  if (!season) {
    return (
      <EmptyState
        icon="trophy"
        title="No standings yet"
        description="Standings appear once the season starts. Simulate a day from the schedule to begin."
      />
    );
  }

  const [teams, structure] = await Promise.all([
    listTeams(ctx, league.id),
    getStructure(ctx, league.id),
  ]);
  const played = rows.reduce((n, r) => n + r.wins, 0);
  return (
    <div className="flex flex-col gap-6">
      <p className="text-text-muted">
        {season.year} season ·{" "}
        {played === 0
          ? "No games played yet"
          : `${played} ${played === 1 ? "game" : "games"} played`}
      </p>
      <nav aria-label="Standings views" className="flex flex-wrap gap-2">
        {[
          {
            label: "Standings",
            href: `/leagues/${league.id}/standings`,
            on: !power,
          },
          {
            label: "Power rankings",
            href: `/leagues/${league.id}/standings?view=power`,
            on: power,
          },
        ].map((v) => (
          <Link
            key={v.label}
            href={v.href}
            aria-current={v.on ? "page" : undefined}
            className={[
              "inline-flex min-h-touch items-center rounded-md border px-4 font-semibold",
              v.on
                ? "border-accent bg-accent-soft text-on-accent-soft"
                : "border-border text-text-muted hover:text-text",
            ].join(" ")}
          >
            {v.label}
          </Link>
        ))}
      </nav>
      {power ? (
        <section aria-labelledby="power-heading">
          <h2 id="power-heading" className="text-xl font-bold">
            Power rankings
          </h2>
          <p className="text-sm text-text-muted">
            How good each team looks right now: its record (45%), how much it
            wins and loses by (35%) and its last ten games (20%).
          </p>
          <ol className="mt-3 rounded-lg border border-border bg-surface">
            {powerRankings(rows).map((r) => {
              const team = teams.find((t) => t.id === r.teamId);
              const line = rows.find((x) => x.teamId === r.teamId);
              if (!team || !line) return null;
              const gap = line.rank - r.rank;
              return (
                <li
                  key={r.teamId}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-3 first:border-t-0"
                >
                  <span className="w-8 text-right text-xl font-black tabular-nums">
                    {r.rank}
                  </span>
                  <Link
                    href={`/leagues/${league.id}/teams/${team.id}`}
                    className="inline-flex min-h-touch min-w-0 items-center gap-2 font-semibold hover:underline"
                  >
                    <TeamBadge team={team} size="sm" />
                    <span className="break-words">{teamName(team)}</span>
                  </Link>
                  <span className="text-sm tabular-nums text-text-muted">
                    {line.wins}-{line.losses} · {r.margin > 0 ? "+" : ""}
                    {r.margin.toFixed(1)} a game · {line.lastTen || "-"} last
                    ten
                  </span>
                  <span className="ml-auto text-sm tabular-nums">
                    <span className="font-bold">{r.score.toFixed(1)}</span>
                    <span className="text-text-muted">
                      {" "}
                      · standings {line.rank}
                      {gap !== 0
                        ? ` · ${Math.abs(gap)} ${Math.abs(gap) === 1 ? "spot" : "spots"} ${gap > 0 ? "higher" : "lower"} here`
                        : ""}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      ) : (
        <StandingsTables
          leagueId={league.id}
          rows={rows}
          teams={teams}
          structure={structure}
        />
      )}
    </div>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { StandingsTables } from "@/components/season/standings-table";
import { loadLeague } from "@/server/leagues/load";
import { getStandings } from "@/server/services/season";
import { getStructure, listTeams } from "@/server/services/world";

export const metadata: Metadata = { title: "Standings" };

export default function StandingsPage({
  params,
}: PageProps<"/leagues/[leagueId]/standings">) {
  return (
    <Suspense
      fallback={
        <div className="h-64 animate-pulse rounded-lg bg-surface-muted" />
      }
    >
      <Standings params={params} />
    </Suspense>
  );
}

async function Standings({
  params,
}: {
  params: PageProps<"/leagues/[leagueId]/standings">["params"];
}) {
  const { leagueId } = await params;
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
      <StandingsTables
        leagueId={league.id}
        rows={rows}
        teams={teams}
        structure={structure}
      />
    </div>
  );
}

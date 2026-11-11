import type { Metadata } from "next";
import { Suspense } from "react";
import { TeamGroups } from "@/components/leagues/team-groups";
import { loadLeague } from "@/server/leagues/load";
import { listTeams } from "@/server/services/world";

export const metadata: Metadata = { title: "Teams" };

export default function TeamsPage({
  params,
}: PageProps<"/leagues/[leagueId]/teams">) {
  return (
    <Suspense
      fallback={
        <div className="h-64 animate-pulse rounded-lg bg-surface-muted" />
      }
    >
      <Teams params={params} />
    </Suspense>
  );
}

async function Teams({
  params,
}: {
  params: PageProps<"/leagues/[leagueId]/teams">["params"];
}) {
  const { leagueId } = await params;
  const { ctx, league } = await loadLeague(leagueId);
  const teams = await listTeams(ctx, league.id);
  return (
    <TeamGroups
      leagueId={league.id}
      teams={teams}
      highlightTeamId={league.userTeamId}
    />
  );
}

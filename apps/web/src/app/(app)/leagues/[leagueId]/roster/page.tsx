import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { loadLeague } from "@/server/leagues/load";

export const metadata: Metadata = { title: "Roster" };

/** Your team's roster; before choosing a team, a prompt to choose one. */
export default function RosterPage({
  params,
}: PageProps<"/leagues/[leagueId]/roster">) {
  return (
    <Suspense
      fallback={
        <div className="h-64 animate-pulse rounded-lg bg-surface-muted" />
      }
    >
      <Roster params={params} />
    </Suspense>
  );
}

async function Roster({
  params,
}: {
  params: PageProps<"/leagues/[leagueId]/roster">["params"];
}) {
  const { leagueId } = await params;
  const { league } = await loadLeague(leagueId);
  if (league.userTeamId) {
    redirect(`/leagues/${league.id}/teams/${league.userTeamId}`);
  }
  return (
    <EmptyState
      icon="user"
      title="Choose your team first"
      description="Your roster appears here once you've picked the team you'll run."
      action={
        <ButtonLink href={`/leagues/${league.id}`}>Choose a team</ButtonLink>
      }
    />
  );
}

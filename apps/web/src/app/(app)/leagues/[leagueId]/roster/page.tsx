import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import Link from "next/link";
import { TeamBadge, teamName } from "@/components/leagues/team-badge";
import { loadLeague } from "@/server/leagues/load";
import { listTeams } from "@/server/services/world";

export const metadata: Metadata = { title: "Roster" };

/**
 * The roster of the team you run. With several teams, a list to choose from;
 * before choosing a team, a prompt to choose one.
 */
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
  const { ctx, league } = await loadLeague(leagueId);
  const mine = (await listTeams(ctx, league.id)).filter(
    (t) => t.localPlayerSlot !== null,
  );
  const only = mine[0];
  if (mine.length === 1 && only) {
    redirect(`/leagues/${league.id}/teams/${only.id}`);
  }
  if (mine.length > 1) {
    return (
      <section aria-label="Your teams" className="flex flex-col gap-3">
        <h2 className="text-2xl font-bold">Choose a roster</h2>
        <ul className="flex flex-col gap-2">
          {mine.map((team) => (
            <li key={team.id}>
              <Link
                href={`/leagues/${league.id}/teams/${team.id}`}
                className="flex min-h-touch items-center gap-3 rounded-lg border border-border bg-surface p-3 hover:bg-surface-muted"
              >
                <TeamBadge team={team} />
                <span className="min-w-0">
                  <span className="block font-semibold break-words">
                    {teamName(team)}
                  </span>
                  {league.localPlayerCount > 1 ? (
                    <span className="block text-sm text-text-muted">
                      Player {team.localPlayerSlot}
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );
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

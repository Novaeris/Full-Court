import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { TeamBadge, teamName } from "@/components/leagues/team-badge";
import { TeamGroups } from "@/components/leagues/team-groups";
import { buttonClasses, ButtonLink } from "@/components/ui/button";
import { chooseTeamAction } from "@/server/leagues/actions";
import { loadLeague } from "@/server/leagues/load";
import { listTeams } from "@/server/services/world";

export const metadata: Metadata = { title: "League" };

export default function LeagueOverviewPage({
  params,
  searchParams,
}: PageProps<"/leagues/[leagueId]">) {
  return (
    <Suspense
      fallback={
        <div className="h-64 animate-pulse rounded-lg bg-surface-muted" />
      }
    >
      <Overview params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Overview({
  params,
  searchParams,
}: {
  params: PageProps<"/leagues/[leagueId]">["params"];
  searchParams: PageProps<"/leagues/[leagueId]">["searchParams"];
}) {
  const { leagueId } = await params;
  const { ctx, league } = await loadLeague(leagueId);
  const [teams, query] = await Promise.all([
    listTeams(ctx, league.id),
    searchParams,
  ]);

  if (league.status === "setup" || !league.userTeamId) {
    return (
      <div className="flex flex-col gap-6">
        <div className="rounded-lg border border-accent bg-accent-soft p-5 text-on-accent-soft">
          <h2 className="text-xl font-bold">Choose your team</h2>
          <p className="mt-1">
            Pick the franchise you&apos;ll run. Strength is the average overall
            of each team&apos;s best eight players. Open a team to see its
            roster first. You can only choose once.
          </p>
        </div>
        <TeamGroups
          leagueId={league.id}
          teams={teams}
          action={(team) => (
            <form action={chooseTeamAction}>
              <input type="hidden" name="leagueId" value={league.id} />
              <input type="hidden" name="teamId" value={team.id} />
              <button
                type="submit"
                className={buttonClasses("primary", "px-4")}
                aria-label={`Choose ${teamName(team)}`}
              >
                Choose
              </button>
            </form>
          )}
        />
      </div>
    );
  }

  const mine = teams.find((t) => t.id === league.userTeamId);
  const ranked = [...teams].sort((a, b) => b.strength - a.strength);
  const rank = mine ? ranked.findIndex((t) => t.id === mine.id) + 1 : 0;

  return (
    <div className="flex flex-col gap-6">
      {query.notice === "team-chosen" ? (
        <p
          role="status"
          className="rounded-md border border-win bg-surface px-4 py-3"
        >
          You&apos;re now running the {mine ? teamName(mine) : "team"}. Good
          luck!
        </p>
      ) : null}
      {mine ? (
        <section
          aria-label="Your team"
          className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 tablet:flex-row tablet:items-center tablet:justify-between"
        >
          <div className="flex items-center gap-4">
            <TeamBadge team={mine} size="lg" />
            <div>
              <p className="text-sm font-semibold text-text-muted">Your team</p>
              <h2 className="text-2xl font-bold">{teamName(mine)}</h2>
              <p className="text-text-muted">
                {mine.conference} Conference · {mine.division} Division ·
                Strength {mine.strength} (#{rank} of {teams.length})
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 tablet:flex-row">
            <ButtonLink href={`/leagues/${league.id}/teams/${mine.id}`}>
              View roster
            </ButtonLink>
            <ButtonLink
              href={`/leagues/${league.id}/teams`}
              variant="secondary"
            >
              All teams
            </ButtonLink>
          </div>
        </section>
      ) : null}
      <p className="text-text-muted">
        Games and the season schedule arrive in the next update. Meanwhile,{" "}
        <Link
          href={`/leagues/${league.id}/teams`}
          className="font-semibold text-accent underline underline-offset-4"
        >
          scout the other teams
        </Link>
        .
      </p>
    </div>
  );
}

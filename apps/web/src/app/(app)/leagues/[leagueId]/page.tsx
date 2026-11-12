import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import type { Team } from "@fullcourt/validation";
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

  const myTeams = teams.filter((t) => t.localPlayerSlot !== null);
  const ranked = [...teams].sort((a, b) => b.strength - a.strength);
  const rankOf = (team: Team) => ranked.findIndex((t) => t.id === team.id) + 1;
  const first = myTeams[0];

  return (
    <div className="flex flex-col gap-6">
      {query.notice === "team-chosen" ? (
        <p
          role="status"
          className="rounded-md border border-win bg-surface px-4 py-3"
        >
          You&apos;re now running the {first ? teamName(first) : "team"}. Good
          luck!
        </p>
      ) : null}
      {myTeams.length === 1 && first ? (
        <section
          aria-label="Your team"
          className="rounded-lg border border-border bg-surface p-5"
        >
          <MyTeam
            leagueId={league.id}
            team={first}
            rank={rankOf(first)}
            total={teams.length}
            heading="Your team"
          />
        </section>
      ) : null}
      {myTeams.length > 1 ? (
        <section aria-label="Your teams" className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold">Your teams</h2>
          {Array.from(new Set(myTeams.map((t) => t.localPlayerSlot)))
            .sort((a, b) => (a ?? 0) - (b ?? 0))
            .map((slot) => (
              <div key={slot} className="flex flex-col gap-3">
                {league.localPlayerCount > 1 ? (
                  <h3 className="text-lg font-bold">Player {slot}</h3>
                ) : null}
                {myTeams
                  .filter((t) => t.localPlayerSlot === slot)
                  .map((team) => (
                    <div
                      key={team.id}
                      className="rounded-lg border border-border bg-surface p-5"
                    >
                      <MyTeam
                        leagueId={league.id}
                        team={team}
                        rank={rankOf(team)}
                        total={teams.length}
                        heading={
                          league.localPlayerCount > 1
                            ? `Player ${slot}`
                            : "Your team"
                        }
                      />
                    </div>
                  ))}
              </div>
            ))}
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

/** One team a person runs, with the way to its roster. */
function MyTeam({
  leagueId,
  team,
  rank,
  total,
  heading,
}: {
  leagueId: string;
  team: Team;
  rank: number;
  total: number;
  heading: string;
}) {
  return (
    <div className="flex flex-col gap-4 tablet:flex-row tablet:items-center tablet:justify-between">
      <div className="flex items-center gap-4">
        <TeamBadge team={team} size="lg" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-muted">{heading}</p>
          <h3 className="text-2xl font-bold break-words">{teamName(team)}</h3>
          <p className="text-text-muted">
            {team.conference} Conference · {team.division} Division · Strength{" "}
            {team.strength} (#{rank} of {total})
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2 tablet:flex-row">
        <ButtonLink href={`/leagues/${leagueId}/teams/${team.id}`}>
          View roster
        </ButtonLink>
        <ButtonLink href={`/leagues/${leagueId}/teams`} variant="secondary">
          All teams
        </ButtonLink>
      </div>
    </div>
  );
}

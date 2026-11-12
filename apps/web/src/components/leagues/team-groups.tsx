import type { Team } from "@fullcourt/validation";
import Link from "next/link";
import type { ReactNode } from "react";
import { controlLabel } from "./control";
import { TeamBadge, teamName } from "./team-badge";

/**
 * Teams grouped by conference, then division. Each team links to its roster;
 * `action` can add a control per team (such as "Choose team").
 */
export function TeamGroups({
  leagueId,
  teams,
  action,
}: {
  leagueId: string;
  teams: readonly Team[];
  action?: (team: Team) => ReactNode;
}) {
  const conferences = groupBy(teams, (t) => t.conferenceId);
  const localPlayers = new Set(
    teams.flatMap((t) =>
      t.localPlayerSlot === null ? [] : [t.localPlayerSlot],
    ),
  ).size;
  return (
    <div className="flex flex-col gap-8">
      {[...conferences].map(([conferenceId, inConference]) => (
        <section key={conferenceId} aria-labelledby={`conf-${conferenceId}`}>
          <h2 id={`conf-${conferenceId}`} className="text-2xl font-bold">
            {inConference[0]?.conference} Conference
          </h2>
          <div className="mt-4 grid gap-6 desktop:grid-cols-2 wide:grid-cols-3">
            {[...groupBy(inConference, (t) => t.divisionId)].map(
              ([divisionId, inDivision]) => (
                <div key={divisionId}>
                  <h3 className="mb-2 text-sm font-semibold tracking-wide text-text-muted uppercase">
                    {inDivision[0]?.division} Division
                  </h3>
                  <ul className="flex flex-col gap-2">
                    {inDivision.map((team) => (
                      <li
                        key={team.id}
                        className={[
                          "flex flex-wrap items-center gap-3 rounded-lg border bg-surface p-3",
                          team.localPlayerSlot !== null
                            ? "border-accent"
                            : "border-border",
                        ].join(" ")}
                      >
                        <Link
                          href={`/leagues/${leagueId}/teams/${team.id}`}
                          className="flex min-h-touch min-w-0 flex-1 items-center gap-3 rounded-md hover:underline"
                        >
                          <TeamBadge team={team} />
                          <span className="min-w-0">
                            <span className="block font-semibold break-words">
                              {teamName(team)}
                            </span>
                            <span className="block text-sm text-text-muted">
                              Strength {team.strength}
                              {team.localPlayerSlot !== null
                                ? ` · ${controlLabel(team.localPlayerSlot, localPlayers)}`
                                : ""}
                            </span>
                          </span>
                        </Link>
                        {action ? action(team) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

function groupBy<T>(items: readonly T[], key: (item: T) => string) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    map.set(k, [...(map.get(k) ?? []), item]);
  }
  return map;
}

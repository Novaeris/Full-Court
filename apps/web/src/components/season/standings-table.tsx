import Link from "next/link";
import type { LeagueStructure, StandingRow, Team } from "@fullcourt/validation";
import { TeamBadge, teamName } from "@/components/leagues/team-badge";
import { ResponsiveTable, type Column } from "@/components/ui/responsive-table";

/** .667 for two wins in three; ".000" before a game is played. */
export function formatPct(winPct: number): string {
  return winPct >= 1 ? "1.000" : winPct.toFixed(3).replace(/^0/, "");
}

type Row = StandingRow & { team: Team; place: number };

/**
 * Standings by conference, best record first. Phones show the record,
 * tablets add form and desktops add home, away, division, conference and
 * scoring. Your own teams are marked.
 */
export function StandingsTables({
  leagueId,
  rows,
  teams,
  structure,
}: {
  leagueId: string;
  rows: readonly StandingRow[];
  teams: readonly Team[];
  structure: LeagueStructure;
}) {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  return (
    <div className="flex flex-col gap-8">
      {structure.conferences.map((conference) => {
        const inConference: Row[] = rows
          .filter((r) => r.conferenceId === conference.id)
          .flatMap((r) => {
            const team = teamById.get(r.teamId);
            return team ? [{ ...r, team, place: 0 }] : [];
          })
          .map((r, index) => ({ ...r, place: index + 1 }));
        const divisionName = new Map(
          conference.divisions.map((d) => [d.id, d.name]),
        );
        const columns: Column<Row>[] = [
          {
            key: "team",
            header: "Team",
            cell: (r) => (
              <Link
                href={`/leagues/${leagueId}/teams/${r.teamId}`}
                className="inline-flex min-h-touch items-center gap-2 font-semibold hover:underline"
              >
                <span className="w-5 text-right text-text-muted">
                  {r.place}
                </span>
                <TeamBadge team={r.team} size="sm" />
                <span>
                  {teamName(r.team)}
                  {r.team.localPlayerSlot !== null ? (
                    <span className="ml-2 rounded bg-accent-soft px-1.5 py-0.5 text-xs font-bold text-on-accent-soft">
                      You
                    </span>
                  ) : null}
                </span>
              </Link>
            ),
          },
          {
            key: "wins",
            header: "Wins",
            abbr: "W",
            align: "end",
            cell: (r) => r.wins,
          },
          {
            key: "losses",
            header: "Losses",
            abbr: "L",
            align: "end",
            cell: (r) => r.losses,
          },
          {
            key: "pct",
            header: "Win %",
            abbr: "PCT",
            align: "end",
            cell: (r) => formatPct(r.winPct),
          },
          {
            key: "streak",
            header: "Streak",
            priority: 2,
            align: "end",
            cell: (r) => r.streak || "–",
          },
          {
            key: "last10",
            header: "Last 10",
            abbr: "L10",
            priority: 2,
            align: "end",
            cell: (r) => r.lastTen || "–",
          },
          {
            key: "division",
            header: "Division",
            priority: 3,
            cell: (r) => divisionName.get(r.divisionId) ?? "",
          },
          {
            key: "home",
            header: "Home",
            priority: 3,
            align: "end",
            cell: (r) => `${r.homeWins}-${r.homeLosses}`,
          },
          {
            key: "away",
            header: "Away",
            priority: 3,
            align: "end",
            cell: (r) => `${r.awayWins}-${r.awayLosses}`,
          },
          {
            key: "div",
            header: "Division record",
            abbr: "DIV",
            priority: 3,
            align: "end",
            cell: (r) => `${r.divisionWins}-${r.divisionLosses}`,
          },
          {
            key: "conf",
            header: "Conference record",
            abbr: "CONF",
            priority: 3,
            align: "end",
            cell: (r) => `${r.conferenceWins}-${r.conferenceLosses}`,
          },
          {
            key: "pf",
            header: "Points for",
            abbr: "PF",
            priority: 3,
            align: "end",
            cell: (r) => r.pointsFor,
          },
          {
            key: "pa",
            header: "Points against",
            abbr: "PA",
            priority: 3,
            align: "end",
            cell: (r) => r.pointsAgainst,
          },
        ];
        return (
          <section
            key={conference.id}
            aria-labelledby={`conference-${conference.id}`}
          >
            <h2
              id={`conference-${conference.id}`}
              className="mb-3 text-2xl font-bold"
            >
              {conference.name}
            </h2>
            <ResponsiveTable
              caption={`${conference.name} standings`}
              columns={columns}
              rows={inConference}
              rowKey={(r) => r.teamId}
            />
          </section>
        );
      })}
    </div>
  );
}

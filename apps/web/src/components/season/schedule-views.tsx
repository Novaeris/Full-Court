import Link from "next/link";
import type { GameSummary, Team } from "@fullcourt/validation";
import { TeamBadge, teamName } from "@/components/leagues/team-badge";
import { ResponsiveTable, type Column } from "@/components/ui/responsive-table";

type Teams = ReadonlyMap<string, Team>;

const overtime = (g: GameSummary): string =>
  g.overtimes === 0 ? "" : g.overtimes === 1 ? " (OT)" : ` (${g.overtimes}OT)`;

/** One team's season: each game with its opponent and result. */
export function TeamSchedule({
  leagueId,
  teamId,
  games,
  teams,
}: {
  leagueId: string;
  teamId: string;
  games: readonly GameSummary[];
  teams: Teams;
}) {
  const columns: Column<GameSummary>[] = [
    {
      key: "day",
      header: "Day",
      cell: (g) => (
        <span className="font-semibold">
          Day {g.day}
          {g.round ? (
            <span className="ml-2 text-xs font-bold text-text-muted">
              R{g.round} G{g.gameNumber}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "opponent",
      header: "Opponent",
      cell: (g) => {
        const home = g.homeTeamId === teamId;
        const opponent = teams.get(home ? g.awayTeamId : g.homeTeamId);
        return (
          <span className="inline-flex items-center gap-2 py-1">
            <span className="w-6 text-text-muted">{home ? "vs" : "@"}</span>
            {opponent ? (
              <>
                <TeamBadge team={opponent} size="sm" />
                <span>{teamName(opponent)}</span>
              </>
            ) : null}
          </span>
        );
      },
    },
    {
      key: "result",
      header: "Result",
      align: "end",
      cell: (g) => {
        if (
          g.status !== "final" ||
          g.homeScore === null ||
          g.awayScore === null
        ) {
          return <span className="text-text-muted">Not played</span>;
        }
        const home = g.homeTeamId === teamId;
        const mine = home ? g.homeScore : g.awayScore;
        const theirs = home ? g.awayScore : g.homeScore;
        const won = mine > theirs;
        return (
          <Link
            href={`/leagues/${leagueId}/games/${g.id}`}
            className="inline-flex min-h-touch items-center gap-2 font-semibold hover:underline"
          >
            <span className={won ? "text-win" : "text-loss"}>
              {won ? "W" : "L"}
            </span>
            <span>
              {mine}–{theirs}
              {overtime(g)}
            </span>
          </Link>
        );
      },
    },
  ];
  return (
    <ResponsiveTable
      caption="Season schedule and results"
      columns={columns}
      rows={games}
      rowKey={(g) => g.id}
    />
  );
}

/** One day's games, each with its score once played. */
export function DaySchedule({
  leagueId,
  games,
  teams,
}: {
  leagueId: string;
  games: readonly GameSummary[];
  teams: Teams;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {games.map((g) => {
        const away = teams.get(g.awayTeamId);
        const home = teams.get(g.homeTeamId);
        const final =
          g.status === "final" && g.homeScore !== null && g.awayScore !== null;
        const content = (
          <>
            <span className="flex min-w-0 flex-1 flex-col gap-2 tablet:flex-row tablet:items-center tablet:gap-4">
              <Side
                team={away}
                score={final ? g.awayScore : null}
                winner={final && (g.awayScore ?? 0) > (g.homeScore ?? 0)}
              />
              <span
                className="hidden text-text-muted tablet:inline"
                aria-hidden="true"
              >
                @
              </span>
              <Side
                team={home}
                score={final ? g.homeScore : null}
                winner={final && (g.homeScore ?? 0) > (g.awayScore ?? 0)}
              />
            </span>
            <span className="shrink-0 text-sm font-semibold text-text-muted">
              {g.round ? `R${g.round} G${g.gameNumber} · ` : ""}
              {final ? `Final${overtime(g)}` : "Scheduled"}
            </span>
          </>
        );
        return (
          <li key={g.id}>
            {final ? (
              <Link
                href={`/leagues/${leagueId}/games/${g.id}`}
                className="flex min-h-touch items-center justify-between gap-4 rounded-lg border border-border bg-surface px-4 py-3 hover:bg-surface-muted"
              >
                {content}
              </Link>
            ) : (
              <div className="flex min-h-touch items-center justify-between gap-4 rounded-lg border border-border bg-surface px-4 py-3">
                {content}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Side({
  team,
  score,
  winner,
}: {
  team: Team | undefined;
  score: number | null;
  winner: boolean;
}) {
  if (!team) return null;
  return (
    <span className="flex min-w-0 flex-1 items-center gap-3">
      <TeamBadge team={team} size="sm" />
      <span className={`min-w-0 flex-1 truncate ${winner ? "font-bold" : ""}`}>
        {teamName(team)}
      </span>
      {score !== null ? (
        <span
          className={`tabular-nums ${winner ? "font-bold" : "text-text-muted"}`}
        >
          {score}
        </span>
      ) : null}
    </span>
  );
}

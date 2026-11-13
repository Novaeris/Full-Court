import Link from "next/link";
import type {
  PlayoffSeries,
  PlayoffsResponse,
  Team,
} from "@fullcourt/validation";
import { TeamBadge, teamName } from "@/components/leagues/team-badge";

type Round = PlayoffsResponse["rounds"][number];

/** One team's line in a series: seed, name, and games won. */
function SeriesTeam({
  team,
  seed,
  wins,
  winner,
  eliminated,
}: {
  team: Team | undefined;
  seed: number;
  wins: number;
  winner: boolean;
  eliminated: boolean;
}) {
  if (!team) return null;
  return (
    <div
      className={[
        "flex items-center gap-2 px-3 py-2",
        winner ? "font-bold" : "",
        eliminated ? "text-text-muted" : "",
      ].join(" ")}
    >
      <TeamBadge team={team} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="mr-1 text-sm text-text-muted">{seed}</span>
        {teamName(team)}
        {team.localPlayerSlot !== null ? (
          <span className="ml-2 rounded bg-accent-soft px-1.5 py-0.5 text-xs font-bold text-on-accent-soft">
            You
          </span>
        ) : null}
      </span>
      <span className="text-lg tabular-nums">{wins}</span>
    </div>
  );
}

function SeriesCard({
  leagueId,
  series,
  teams,
}: {
  leagueId: string;
  series: PlayoffSeries;
  teams: ReadonlyMap<string, Team>;
}) {
  const a = teams.get(series.a.teamId);
  const b = teams.get(series.b.teamId);
  const done = series.winnerTeamId !== null;
  const leader =
    series.a.wins === series.b.wins
      ? null
      : series.a.wins > series.b.wins
        ? a
        : b;
  const status = done
    ? `${teamName((series.winnerTeamId === series.a.teamId ? a : b) as Team)} win ${Math.max(series.a.wins, series.b.wins)}–${Math.min(series.a.wins, series.b.wins)}`
    : series.a.wins + series.b.wins === 0
      ? `Best of ${series.bestOf}`
      : leader
        ? `${teamName(leader)} lead ${Math.max(series.a.wins, series.b.wins)}–${Math.min(series.a.wins, series.b.wins)}`
        : `Series tied ${series.a.wins}–${series.b.wins}`;
  const next = series.games.find((g) => g.status === "scheduled");
  return (
    <li className="rounded-lg border border-border bg-surface">
      <div className="divide-y divide-border">
        <SeriesTeam
          team={a}
          seed={series.a.seed}
          wins={series.a.wins}
          winner={series.winnerTeamId === series.a.teamId}
          eliminated={done && series.winnerTeamId !== series.a.teamId}
        />
        <SeriesTeam
          team={b}
          seed={series.b.seed}
          wins={series.b.wins}
          winner={series.winnerTeamId === series.b.teamId}
          eliminated={done && series.winnerTeamId !== series.b.teamId}
        />
      </div>
      <p className="border-t border-border px-3 py-2 text-sm font-semibold text-text-muted">
        {status}
        {!done && next
          ? ` · Game ${next.gameNumber} at ${teamName(teams.get(next.homeTeamId) as Team)}`
          : ""}
      </p>
      {series.games.some((g) => g.status === "final") ? (
        <ol
          aria-label="Games"
          className="flex flex-wrap gap-1 border-t border-border px-3 py-2"
        >
          {series.games
            .filter((g) => g.status === "final")
            .map((g) => {
              const winnerIsHome = (g.homeScore ?? 0) > (g.awayScore ?? 0);
              const winner = teams.get(
                winnerIsHome ? g.homeTeamId : g.awayTeamId,
              );
              return (
                <li key={g.id}>
                  <Link
                    href={`/leagues/${leagueId}/games/${g.id}`}
                    className="inline-flex min-h-touch items-center rounded-md border border-border px-3 text-sm font-semibold hover:bg-surface-muted"
                  >
                    G{g.gameNumber} {winner?.abbreviation}{" "}
                    {Math.max(g.homeScore ?? 0, g.awayScore ?? 0)}–
                    {Math.min(g.homeScore ?? 0, g.awayScore ?? 0)}
                  </Link>
                </li>
              );
            })}
        </ol>
      ) : null}
    </li>
  );
}

/**
 * The playoff bracket. Each round is a column on wide screens (scrolling
 * inside its own region) and stacks on phones and tablets. A round that
 * hasn't started yet shows only the rounds before it.
 */
export function PlayoffBracket({
  leagueId,
  rounds,
  series,
  teams,
}: {
  leagueId: string;
  rounds: readonly Round[];
  series: readonly PlayoffSeries[];
  teams: readonly Team[];
}) {
  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const played = rounds.filter((r) => series.some((s) => s.round === r.round));
  return (
    <div
      role="region"
      aria-label="Playoff bracket"
      tabIndex={0}
      className="overflow-x-auto"
    >
      <div className="flex flex-col gap-8 desktop:min-w-max desktop:flex-row">
        {played.map((r) => (
          <section
            key={r.round}
            aria-labelledby={`round-${r.round}`}
            className="desktop:w-80"
          >
            <h2 id={`round-${r.round}`} className="mb-3 text-xl font-bold">
              {r.label}
            </h2>
            <ul className="flex flex-col gap-3">
              {series
                .filter((s) => s.round === r.round)
                .map((s) => (
                  <SeriesCard
                    key={s.id}
                    leagueId={leagueId}
                    series={s}
                    teams={teamMap}
                  />
                ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

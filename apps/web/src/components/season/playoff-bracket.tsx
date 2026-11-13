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
function PlayoffRounds({
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

/** One side of a series in the bracket diagram: seed, badge, abbreviation, wins. */
function MiniTeam({
  team,
  seed,
  wins,
  winner,
  eliminated,
}: {
  team: Team | undefined;
  seed?: number;
  wins?: number;
  winner?: boolean;
  eliminated?: boolean;
}) {
  return (
    <div
      className={[
        "flex items-center gap-2 px-2 py-1.5 text-sm",
        winner ? "font-bold" : "",
        eliminated ? "text-text-muted" : "",
      ].join(" ")}
    >
      <span className="w-4 text-xs text-text-muted">{seed ?? ""}</span>
      {team ? (
        <>
          <TeamBadge team={team} size="sm" />
          <span className="min-w-0 flex-1 truncate">{team.abbreviation}</span>
          {team.localPlayerSlot !== null ? (
            <span className="rounded bg-accent-soft px-1 text-xs font-bold text-on-accent-soft">
              You
            </span>
          ) : null}
        </>
      ) : (
        <span className="flex-1 text-text-muted">TBD</span>
      )}
      <span className="w-4 text-right text-base tabular-nums">
        {wins ?? ""}
      </span>
    </div>
  );
}

function MiniSeries({
  series,
  teams,
}: {
  series: PlayoffSeries | undefined;
  teams: ReadonlyMap<string, Team>;
}) {
  const done = series?.winnerTeamId != null;
  return (
    <div className="w-44 rounded-lg border border-border bg-surface">
      {[series?.a, series?.b].map((side, i) => (
        <div key={i} className={i === 1 ? "border-t border-border" : ""}>
          <MiniTeam
            team={side ? teams.get(side.teamId) : undefined}
            seed={side?.seed}
            wins={side?.wins}
            winner={done && side?.teamId === series?.winnerTeamId}
            eliminated={done && side?.teamId !== series?.winnerTeamId}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * The bracket diagram, drawn like the broadcast graphic: the first round on
 * the outer edges, each round meeting in the middle at the finals. A round
 * that hasn't been created yet shows empty slots so the shape is always
 * complete. Series cards are summaries; every game links from the round
 * lists below.
 */
function BracketDiagram({
  rounds,
  series,
  teams,
}: {
  rounds: readonly Round[];
  series: readonly PlayoffSeries[];
  teams: ReadonlyMap<string, Team>;
}) {
  const total = rounds.length;
  const find = (round: number, slot: number) =>
    series.find((s) => s.round === round && s.slot === slot);
  const label = (round: number) =>
    rounds.find((r) => r.round === round)?.label ?? "";

  /** The series of one round on one side, top to bottom, as pairs when a later round exists. */
  function Column({ round, side }: { round: number; side: "left" | "right" }) {
    const perSide = 2 ** (total - round) / 2;
    const offset = side === "left" ? 0 : perSide;
    const slots = Array.from({ length: perSide }, (_, i) => offset + i);
    const outward = side === "left" ? "right" : "left";
    const line = "border-border";
    // Cards that meet in the next round share a bracket line.
    const groups: number[][] = [];
    if (perSide === 1) groups.push(slots);
    else
      for (let i = 0; i < slots.length; i += 2)
        groups.push(slots.slice(i, i + 2));
    return (
      <div className="flex flex-col">
        <p className="mb-2 text-center text-sm font-bold">{label(round)}</p>
        <div className="flex flex-1 flex-col">
          {groups.map((g) => (
            <div key={g[0]} className="relative flex flex-1 flex-col py-1">
              {g.map((slot) => (
                <div key={slot} className="flex flex-1 items-center py-1">
                  <MiniSeries series={find(round, slot)} teams={teams} />
                </div>
              ))}
              {g.length === 2 ? (
                <>
                  <span
                    aria-hidden
                    className={`absolute top-1/4 bottom-1/4 w-3 border-y ${line} ${outward === "right" ? "-right-3 border-r" : "-left-3 border-l"}`}
                  />
                  <span
                    aria-hidden
                    className={`absolute top-1/2 w-3 border-t ${line} ${outward === "right" ? "-right-6" : "-left-6"}`}
                  />
                </>
              ) : (
                <span
                  aria-hidden
                  className={`absolute top-1/2 w-6 border-t ${line} ${outward === "right" ? "-right-6" : "-left-6"}`}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const early = Array.from({ length: total - 1 }, (_, i) => i + 1);
  return (
    <div
      role="region"
      aria-label="Playoff bracket diagram"
      tabIndex={0}
      className="hidden overflow-x-auto desktop:block"
    >
      <div className="mx-auto flex min-w-max justify-center gap-6">
        {early.map((r) => (
          <Column key={`l${r}`} round={r} side="left" />
        ))}
        <div className="flex flex-col">
          <p className="mb-2 text-center text-sm font-bold">{label(total)}</p>
          <div className="flex flex-1 items-center">
            <MiniSeries series={find(total, 0)} teams={teams} />
          </div>
        </div>
        {[...early].reverse().map((r) => (
          <Column key={`r${r}`} round={r} side="right" />
        ))}
      </div>
    </div>
  );
}

/**
 * The playoffs: the bracket diagram on wide screens, and below it (or alone on
 * phones) each round with its series and games.
 */
export function PlayoffBracket(props: {
  leagueId: string;
  rounds: readonly Round[];
  series: readonly PlayoffSeries[];
  teams: readonly Team[];
}) {
  const teamMap = new Map(props.teams.map((t) => [t.id, t]));
  return (
    <div className="flex flex-col gap-10">
      <BracketDiagram
        rounds={props.rounds}
        series={props.series}
        teams={teamMap}
      />
      <PlayoffRounds {...props} />
    </div>
  );
}

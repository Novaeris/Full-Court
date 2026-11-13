import Link from "next/link";
import type {
  PlayoffSeries,
  PlayoffsResponse,
  Team,
} from "@fullcourt/validation";
import { TeamBadge, teamName } from "@/components/leagues/team-badge";

type Round = PlayoffsResponse["rounds"][number];

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
        "flex items-center gap-1.5 px-1.5 py-1.5 text-sm",
        winner ? "font-bold" : "",
        eliminated ? "text-text-muted" : "",
      ].join(" ")}
    >
      <span className="w-3 text-xs text-text-muted">{seed ?? ""}</span>
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
      <span className="w-4 text-right text-sm tabular-nums">{wins ?? ""}</span>
    </div>
  );
}

function MiniSeries({
  leagueId,
  series,
  teams,
  final = false,
}: {
  leagueId: string;
  series: PlayoffSeries | undefined;
  teams: ReadonlyMap<string, Team>;
  final?: boolean;
}) {
  const done = series?.winnerTeamId != null;
  const card = (
    <>
      {[series?.a, series?.b].map((side, i) => (
        <div key={i} className={i === 1 ? "border-t border-text-muted" : ""}>
          <MiniTeam
            team={side ? teams.get(side.teamId) : undefined}
            seed={side?.seed}
            wins={side?.wins}
            winner={done && side?.teamId === series?.winnerTeamId}
            eliminated={done && side?.teamId !== series?.winnerTeamId}
          />
        </div>
      ))}
    </>
  );
  const frame = [
    "rounded-lg border bg-surface text-left",
    final
      ? "w-44 border-2 border-accent shadow-md"
      : "w-[8.5rem] border-border",
  ].join(" ");
  const played = series?.games.filter((g) => g.status === "final") ?? [];
  if (!series || played.length === 0)
    return <div className={frame}>{card}</div>;

  const id = `series-${series.id}`;
  const a = teams.get(series.a.teamId);
  const b = teams.get(series.b.teamId);
  const winner = done
    ? series.winnerTeamId === series.a.teamId
      ? a
      : b
    : null;
  const hi = Math.max(series.a.wins, series.b.wins);
  const lo = Math.min(series.a.wins, series.b.wins);
  return (
    <>
      <button
        type="button"
        popoverTarget={id}
        className={`${frame} block cursor-pointer hover:bg-surface-muted`}
      >
        {card}
        <span className="sr-only">Show the games in this series</span>
      </button>
      <div
        id={id}
        popover="auto"
        className="m-auto w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-4 text-text shadow-lg backdrop:bg-black/40"
      >
        <h3 className="text-lg font-bold">
          {a?.abbreviation} vs {b?.abbreviation}
        </h3>
        <p className="mb-3 text-sm text-text-muted">
          {winner
            ? `${teamName(winner)} win ${hi}–${lo}`
            : hi === lo
              ? `Series tied ${hi}–${lo}`
              : `${teamName((series.a.wins > series.b.wins ? a : b) as Team)} lead ${hi}–${lo}`}
        </p>
        <ol aria-label="Games" className="flex flex-wrap gap-2">
          {played.map((g) => {
            const home = (g.homeScore ?? 0) > (g.awayScore ?? 0);
            const w = teams.get(home ? g.homeTeamId : g.awayTeamId);
            return (
              <li key={g.id}>
                <Link
                  href={`/leagues/${leagueId}/games/${g.id}`}
                  className="inline-flex min-h-touch items-center rounded-md border border-border px-3 text-sm font-semibold hover:bg-surface-muted"
                >
                  G{g.gameNumber} {w?.abbreviation}{" "}
                  {Math.max(g.homeScore ?? 0, g.awayScore ?? 0)}–
                  {Math.min(g.homeScore ?? 0, g.awayScore ?? 0)}
                </Link>
              </li>
            );
          })}
        </ol>
        <button
          type="button"
          popoverTarget={id}
          popoverTargetAction="hide"
          className="mt-4 inline-flex min-h-touch items-center rounded-md border border-border px-4 text-sm font-semibold hover:bg-surface-muted"
        >
          Close
        </button>
      </div>
    </>
  );
}

/**
 * The bracket diagram, drawn like the broadcast graphic: the first round on
 * the outer edges, each round meeting in the middle at the finals. A round
 * that hasn't been created yet shows empty slots so the shape is always
 * complete. Scrolls sideways on narrow screens.
 */
export function PlayoffBracket({
  leagueId,
  rounds,
  series,
  teams: teamList,
}: {
  leagueId: string;
  rounds: readonly Round[];
  series: readonly PlayoffSeries[];
  teams: readonly Team[];
}) {
  const teams = new Map(teamList.map((t) => [t.id, t]));
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
    const line = "border-text-muted";
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
                  <MiniSeries
                    leagueId={leagueId}
                    series={find(round, slot)}
                    teams={teams}
                  />
                </div>
              ))}
              {g.length === 2 ? (
                <>
                  <span
                    aria-hidden
                    className={`absolute top-1/4 bottom-1/4 w-2 border-y ${line} ${outward === "right" ? "-right-2 border-r" : "-left-2 border-l"}`}
                  />
                  <span
                    aria-hidden
                    className={`absolute top-1/2 w-2 border-t ${line} ${outward === "right" ? "-right-4" : "-left-4"}`}
                  />
                </>
              ) : (
                <span
                  aria-hidden
                  className={`absolute top-1/2 w-4 border-t ${line} ${outward === "right" ? "-right-4" : "-left-4"}`}
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
      aria-label="Playoff bracket"
      tabIndex={0}
      className="overflow-x-auto pb-2"
    >
      <div className="mx-auto flex min-w-max justify-center gap-4">
        {early.map((r) => (
          <Column key={`l${r}`} round={r} side="left" />
        ))}
        <div className="flex flex-col">
          <p className="mb-2 text-center text-sm font-bold">{label(total)}</p>
          <div className="flex flex-1 items-center">
            <MiniSeries
              leagueId={leagueId}
              series={find(total, 0)}
              teams={teams}
              final
            />
          </div>
        </div>
        {[...early].reverse().map((r) => (
          <Column key={`r${r}`} round={r} side="right" />
        ))}
      </div>
    </div>
  );
}

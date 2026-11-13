import type {
  PlayoffSeries,
  PlayoffsResponse,
  Team,
} from "@fullcourt/validation";
import { TeamBadge } from "@/components/leagues/team-badge";

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
        "flex items-center gap-2 px-3 py-2 text-base",
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
    <div className="w-52 rounded-lg border border-border bg-surface">
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
    </div>
  );
}

/**
 * The bracket diagram, drawn like the broadcast graphic: the first round on
 * the outer edges, each round meeting in the middle at the finals. A round
 * that hasn't been created yet shows empty slots so the shape is always
 * complete. Scrolls sideways on narrow screens.
 */
export function PlayoffBracket({
  rounds,
  series,
  teams: teamList,
}: {
  leagueId?: string;
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
      aria-label="Playoff bracket"
      tabIndex={0}
      className="overflow-x-auto pb-2"
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

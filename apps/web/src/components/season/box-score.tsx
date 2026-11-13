import Link from "next/link";
import type { BoxScoreLine, GameSummary, Team } from "@fullcourt/validation";
import { TeamBadge, teamName } from "@/components/leagues/team-badge";
import { ResponsiveTable, type Column } from "@/components/ui/responsive-table";

type Row =
  | { kind: "player"; line: BoxScoreLine }
  | {
      kind: "total";
      line: Omit<
        BoxScoreLine,
        | "playerId"
        | "firstName"
        | "lastName"
        | "jersey"
        | "position"
        | "started"
        | "teamId"
      >;
    };

const sum = (lines: readonly BoxScoreLine[], key: keyof BoxScoreLine): number =>
  lines.reduce((n, l) => n + (l[key] as number), 0);

/** The numbers in a box score, as one row of totals. */
function totals(
  lines: readonly BoxScoreLine[],
): Extract<Row, { kind: "total" }> {
  const keys = [
    "minutes",
    "points",
    "rebounds",
    "assists",
    "steals",
    "blocks",
    "turnovers",
    "fouls",
    "fgm",
    "fga",
    "tpm",
    "tpa",
    "ftm",
    "fta",
  ] as const;
  const line = Object.fromEntries(
    keys.map((k) => [k, sum(lines, k)]),
  ) as Extract<Row, { kind: "total" }>["line"];
  return { kind: "total", line };
}

function columns(): Column<Row>[] {
  const num =
    (
      key:
        | "points"
        | "rebounds"
        | "assists"
        | "steals"
        | "blocks"
        | "turnovers"
        | "fouls"
        | "minutes",
    ) =>
    (r: Row) =>
      r.line[key];
  const split =
    (made: "fgm" | "tpm" | "ftm", tried: "fga" | "tpa" | "fta") => (r: Row) =>
      `${r.line[made]}-${r.line[tried]}`;
  return [
    {
      key: "player",
      header: "Player",
      cell: (r) =>
        r.kind === "total" ? (
          <span className="font-bold">Team totals</span>
        ) : (
          <span className="inline-flex min-h-touch items-center gap-2">
            <span className="w-6 text-right text-text-muted">
              {r.line.jersey}
            </span>
            <span className={r.line.started ? "font-semibold" : ""}>
              {r.line.firstName[0]}. {r.line.lastName}
            </span>
            <span className="text-xs text-text-muted">{r.line.position}</span>
          </span>
        ),
    },
    {
      key: "min",
      header: "Minutes",
      abbr: "MIN",
      align: "end",
      cell: num("minutes"),
    },
    {
      key: "pts",
      header: "Points",
      abbr: "PTS",
      align: "end",
      cell: num("points"),
    },
    {
      key: "reb",
      header: "Rebounds",
      abbr: "REB",
      align: "end",
      cell: num("rebounds"),
    },
    {
      key: "ast",
      header: "Assists",
      abbr: "AST",
      align: "end",
      cell: num("assists"),
    },
    {
      key: "stl",
      header: "Steals",
      abbr: "STL",
      priority: 2,
      align: "end",
      cell: num("steals"),
    },
    {
      key: "blk",
      header: "Blocks",
      abbr: "BLK",
      priority: 2,
      align: "end",
      cell: num("blocks"),
    },
    {
      key: "tov",
      header: "Turnovers",
      abbr: "TO",
      priority: 2,
      align: "end",
      cell: num("turnovers"),
    },
    {
      key: "pf",
      header: "Fouls",
      abbr: "PF",
      priority: 2,
      align: "end",
      cell: num("fouls"),
    },
    {
      key: "fg",
      header: "Field goals",
      abbr: "FG",
      priority: 3,
      align: "end",
      cell: split("fgm", "fga"),
    },
    {
      key: "tp",
      header: "Three-pointers",
      abbr: "3PT",
      priority: 3,
      align: "end",
      cell: split("tpm", "tpa"),
    },
    {
      key: "ft",
      header: "Free throws",
      abbr: "FT",
      priority: 3,
      align: "end",
      cell: split("ftm", "fta"),
    },
  ];
}

/**
 * Both teams' box scores. On phones one team shows at a time, chosen with the
 * toggle (`?team=home|away`); on larger screens both are shown.
 */
export function BoxScore({
  leagueId,
  game,
  lines,
  home,
  away,
  selected,
}: {
  leagueId: string;
  game: GameSummary;
  lines: readonly BoxScoreLine[];
  home: Team;
  away: Team;
  selected: "home" | "away";
}) {
  const sides = [
    { key: "away" as const, team: away, teamId: game.awayTeamId },
    { key: "home" as const, team: home, teamId: game.homeTeamId },
  ];
  const base = `/leagues/${leagueId}/games/${game.id}?tab=box`;
  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Team" className="flex gap-2 tablet:hidden">
        {sides.map((s) => (
          <Link
            key={s.key}
            href={`${base}&team=${s.key}`}
            aria-current={selected === s.key ? "true" : undefined}
            className={[
              "inline-flex min-h-touch flex-1 items-center justify-center gap-2 rounded-md border px-3 font-semibold",
              selected === s.key
                ? "border-accent bg-accent-soft text-on-accent-soft"
                : "border-border bg-surface text-text hover:bg-surface-muted",
            ].join(" ")}
          >
            <TeamBadge team={s.team} size="sm" />
            {s.team.abbreviation}
          </Link>
        ))}
      </nav>
      {sides.map((s) => {
        const teamLines = lines
          .filter((l) => l.teamId === s.teamId)
          .sort(
            (a, b) =>
              Number(b.started) - Number(a.started) || b.minutes - a.minutes,
          );
        const rows: Row[] = [
          ...teamLines.map((line): Row => ({ kind: "player", line })),
          totals(teamLines),
        ];
        return (
          <section
            key={s.key}
            aria-label={`${teamName(s.team)} box score`}
            className={selected === s.key ? "" : "hidden tablet:block"}
          >
            <h3 className="mb-2 flex items-center gap-2 text-lg font-bold">
              <TeamBadge team={s.team} size="sm" />
              {teamName(s.team)}
            </h3>
            <ResponsiveTable
              caption={`${teamName(s.team)} box score`}
              columns={columns()}
              rows={rows}
              rowKey={(r) => (r.kind === "total" ? "total" : r.line.playerId)}
            />
          </section>
        );
      })}
    </div>
  );
}

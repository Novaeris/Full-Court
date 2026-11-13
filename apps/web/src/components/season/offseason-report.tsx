import Link from "next/link";
import { CAMP_PROGRAM_INFO } from "@fullcourt/game-rules";
import type {
  CampReportRow,
  OffseasonPlayer,
  OffseasonResponse,
  Team,
} from "@fullcourt/validation";
import { TeamBadge } from "@/components/leagues/team-badge";
import { ResponsiveTable, type Column } from "@/components/ui/responsive-table";

type Mover = OffseasonPlayer & { change: number };

/** 1st, 2nd, 3rd, 4th, 11th, 21st. */
function ordinal(n: number): string {
  const tail = n % 100;
  if (tail >= 11 && tail <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

function PlayerLink({
  leagueId,
  player,
}: {
  leagueId: string;
  player: OffseasonPlayer;
}) {
  return (
    <Link
      href={`/leagues/${leagueId}/players/${player.id}`}
      className="inline-flex min-h-touch items-center font-semibold hover:underline"
    >
      {player.name}
    </Link>
  );
}

function TeamCell({ team }: { team: Team | undefined }) {
  if (!team) return <span className="text-text-muted">Free agent</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <TeamBadge team={team} size="sm" />
      <span>{team.abbreviation}</span>
      {team.localPlayerSlot !== null ? (
        <span className="rounded bg-accent-soft px-1.5 py-0.5 text-xs font-bold text-on-accent-soft">
          You
        </span>
      ) : null}
    </span>
  );
}

/**
 * What the latest offseason did: the draft pick by pick, the biggest
 * improvements and declines, and who retired. Every list is its own section.
 */
export function OffseasonReport({
  leagueId,
  report,
  teams,
}: {
  leagueId: string;
  report: OffseasonResponse;
  teams: readonly Team[];
}) {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const team = (id: string | null) => (id ? teamById.get(id) : undefined);

  type DraftRow = OffseasonResponse["draft"][number];
  const lotteryRows = report.draft
    .filter((d) => d.round === 1 && d.lotteryOdds !== null)
    .sort((a, b) => a.expectedPick - b.expectedPick);
  const moved = (r: DraftRow) => r.expectedPick - r.pick;
  const lotteryColumns: Column<DraftRow>[] = [
    {
      key: "team",
      header: "Team",
      cell: (r) => <TeamCell team={team(r.teamId)} />,
    },
    {
      key: "finish",
      header: "Finished",
      priority: 2,
      align: "end",
      cell: (r) => (
        <span className="tabular-nums">{ordinal(r.finishRank)}</span>
      ),
    },
    {
      key: "odds",
      header: "Chance of No. 1",
      abbr: "Odds",
      align: "end",
      cell: (r) => (
        <span className="tabular-nums">
          {((r.lotteryOdds ?? 0) * 100).toFixed(1)}%
        </span>
      ),
    },
    {
      key: "expected",
      header: "Without the lottery",
      abbr: "Was",
      priority: 2,
      align: "end",
      cell: (r) => <span className="tabular-nums">{r.expectedPick}</span>,
    },
    {
      key: "pick",
      header: "Pick",
      align: "end",
      cell: (r) => <span className="font-semibold tabular-nums">{r.pick}</span>,
    },
    {
      key: "moved",
      header: "Moved",
      align: "end",
      cell: (r) => (
        <span className="tabular-nums">
          {moved(r) > 0
            ? `Up ${moved(r)}`
            : moved(r) < 0
              ? `Down ${-moved(r)}`
              : "-"}
        </span>
      ),
    },
  ];
  const draftColumns: Column<DraftRow>[] = [
    {
      key: "pick",
      header: "Pick",
      cell: (r) => (
        <span className="font-semibold tabular-nums">
          {r.pick}
          <span className="ml-1 text-sm font-normal text-text-muted">
            R{r.round}
          </span>
        </span>
      ),
    },
    {
      key: "player",
      header: "Player",
      cell: (r) => <PlayerLink leagueId={leagueId} player={r.player} />,
    },
    {
      key: "team",
      header: "Team",
      cell: (r) => <TeamCell team={team(r.teamId)} />,
    },
    {
      key: "pos",
      header: "Position",
      abbr: "POS",
      priority: 2,
      cell: (r) => r.player.position,
    },
    {
      key: "age",
      header: "Age",
      priority: 2,
      align: "end",
      cell: (r) => r.player.age,
    },
    {
      key: "ovr",
      header: "Overall",
      abbr: "OVR",
      align: "end",
      cell: (r) => <span className="tabular-nums">{r.player.overall}</span>,
    },
    {
      key: "pot",
      header: "Potential",
      abbr: "POT",
      priority: 2,
      align: "end",
      cell: (r) => <span className="tabular-nums">{r.player.potential}</span>,
    },
  ];

  const moverColumns = (verb: string): Column<Mover>[] => [
    {
      key: "player",
      header: "Player",
      cell: (r) => <PlayerLink leagueId={leagueId} player={r} />,
    },
    {
      key: "team",
      header: "Team",
      priority: 2,
      cell: (r) => <TeamCell team={team(r.teamId)} />,
    },
    {
      key: "age",
      header: "Age",
      priority: 2,
      align: "end",
      cell: (r) => r.age,
    },
    {
      key: "ovr",
      header: "Overall",
      abbr: "OVR",
      align: "end",
      cell: (r) => <span className="tabular-nums">{r.overall}</span>,
    },
    {
      key: "change",
      header: verb,
      align: "end",
      cell: (r) => (
        <span className="font-semibold tabular-nums">
          {r.change > 0 ? `+${r.change}` : r.change}
        </span>
      ),
    },
  ];

  const campColumns: Column<CampReportRow>[] = [
    {
      key: "player",
      header: "Player",
      cell: (r) => <PlayerLink leagueId={leagueId} player={r.player} />,
    },
    {
      key: "team",
      header: "Team",
      priority: 2,
      cell: (r) => <TeamCell team={team(r.player.teamId)} />,
    },
    {
      key: "program",
      header: "Program",
      cell: (r) => CAMP_PROGRAM_INFO[r.program].label,
    },
    {
      key: "overall",
      header: "Overall",
      abbr: "OVR",
      align: "end",
      cell: (r) => (
        <span className="tabular-nums">
          {r.before} to {r.after}
        </span>
      ),
    },
    {
      key: "gain",
      header: "Change",
      align: "end",
      cell: (r) => (
        <span className="font-semibold tabular-nums">
          {r.after > r.before ? `+${r.after - r.before}` : r.after - r.before}
        </span>
      ),
    },
  ];

  const retiredColumns: Column<OffseasonPlayer>[] = [
    {
      key: "player",
      header: "Player",
      cell: (r) => <PlayerLink leagueId={leagueId} player={r} />,
    },
    { key: "pos", header: "Position", abbr: "POS", cell: (r) => r.position },
    { key: "age", header: "Age", align: "end", cell: (r) => r.age },
    {
      key: "ovr",
      header: "Overall",
      abbr: "OVR",
      align: "end",
      cell: (r) => <span className="tabular-nums">{r.overall}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-10">
      {lotteryRows.length > 0 ? (
        <section aria-labelledby="lottery-heading">
          <h2 id="lottery-heading" className="mb-1 text-xl font-bold">
            Draft lottery
          </h2>
          <p className="mb-3 text-text-muted">
            Teams that missed the playoffs are in the lottery, with the best
            odds for the worst records. The first four picks are drawn; the rest
            follow the standings, and the playoff teams pick after, ordered by
            how far they got.
          </p>
          <ResponsiveTable
            caption={`The ${report.year} draft lottery`}
            columns={lotteryColumns}
            rows={lotteryRows}
            rowKey={(r) => String(r.pick)}
          />
        </section>
      ) : null}

      <section aria-labelledby="draft-heading">
        <h2 id="draft-heading" className="mb-3 text-xl font-bold">
          {report.year} draft
        </h2>
        <ResponsiveTable
          caption={`The ${report.year} draft, pick by pick`}
          columns={draftColumns}
          rows={report.draft}
          rowKey={(r) => String(r.pick)}
        />
      </section>

      <div className="grid gap-10 desktop:grid-cols-2">
        <section aria-labelledby="risers-heading">
          <h2 id="risers-heading" className="mb-3 text-xl font-bold">
            Biggest improvements
          </h2>
          {report.risers.length > 0 ? (
            <ResponsiveTable
              caption="Players whose overall rating rose the most"
              columns={moverColumns("Change")}
              rows={report.risers}
              rowKey={(r) => r.id}
            />
          ) : (
            <p className="text-text-muted">Nobody improved.</p>
          )}
        </section>
        <section aria-labelledby="fallers-heading">
          <h2 id="fallers-heading" className="mb-3 text-xl font-bold">
            Biggest declines
          </h2>
          {report.fallers.length > 0 ? (
            <ResponsiveTable
              caption="Players whose overall rating fell the most"
              columns={moverColumns("Change")}
              rows={report.fallers}
              rowKey={(r) => r.id}
            />
          ) : (
            <p className="text-text-muted">Nobody declined.</p>
          )}
        </section>
      </div>

      {report.campReport.length > 0 ? (
        <section aria-labelledby="camp-report-heading">
          <h2 id="camp-report-heading" className="mb-3 text-xl font-bold">
            Training camp report
          </h2>
          <ResponsiveTable
            caption="Players who went to training camp and what changed"
            columns={campColumns}
            rows={report.campReport}
            rowKey={(r) => r.player.id}
          />
        </section>
      ) : null}

      <section aria-labelledby="retired-heading">
        <h2 id="retired-heading" className="mb-3 text-xl font-bold">
          Retired
        </h2>
        {report.retired.length > 0 ? (
          <ResponsiveTable
            caption={`Players who retired before the ${report.year} season`}
            columns={retiredColumns}
            rows={report.retired}
            rowKey={(r) => r.id}
          />
        ) : (
          <p className="text-text-muted">Nobody retired.</p>
        )}
      </section>
    </div>
  );
}

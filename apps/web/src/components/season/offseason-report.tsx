import Link from "next/link";
import type {
  OffseasonPlayer,
  OffseasonResponse,
  Team,
} from "@fullcourt/validation";
import { TeamBadge } from "@/components/leagues/team-badge";
import { ResponsiveTable, type Column } from "@/components/ui/responsive-table";

type Mover = OffseasonPlayer & { change: number };

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

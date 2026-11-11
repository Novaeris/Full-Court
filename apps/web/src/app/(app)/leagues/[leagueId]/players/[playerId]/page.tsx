import { formatHeight } from "@fullcourt/game-rules";
import {
  POSITION_NAMES,
  RATING_LABELS,
  type RatingKey,
} from "@fullcourt/game-types";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TeamBadge, teamName } from "@/components/leagues/team-badge";
import { ApiError } from "@/server/api/handler";
import { loadLeague } from "@/server/leagues/load";
import { getPlayer } from "@/server/services/world";

export const metadata: Metadata = { title: "Player" };

const GROUPS: readonly { title: string; keys: readonly RatingKey[] }[] = [
  { title: "Scoring", keys: ["inside", "midRange", "threePoint", "freeThrow"] },
  { title: "Playmaking", keys: ["passing", "ballHandling"] },
  { title: "Rebounding", keys: ["offRebound", "defRebound"] },
  { title: "Defense", keys: ["perimeterD", "interiorD"] },
  { title: "Athleticism", keys: ["speed", "strength", "stamina"] },
];

export default function PlayerPage({
  params,
}: PageProps<"/leagues/[leagueId]/players/[playerId]">) {
  return (
    <Suspense
      fallback={
        <div className="h-96 animate-pulse rounded-lg bg-surface-muted" />
      }
    >
      <PlayerProfile params={params} />
    </Suspense>
  );
}

async function PlayerProfile({
  params,
}: {
  params: PageProps<"/leagues/[leagueId]/players/[playerId]">["params"];
}) {
  const { leagueId, playerId } = await params;
  const { ctx, league } = await loadLeague(leagueId);
  const { player, team } = await getPlayer(ctx, league.id, playerId).catch(
    (error) => {
      if (error instanceof ApiError && error.status === 404) notFound();
      throw error;
    },
  );

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-label="Player"
        className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 tablet:flex-row tablet:items-center tablet:justify-between"
      >
        <div>
          <p className="text-sm font-semibold text-text-muted">
            #{player.jersey} · {POSITION_NAMES[player.position]}
          </p>
          <h2 className="text-3xl font-black tracking-tight">
            {player.firstName} {player.lastName}
          </h2>
          <p className="mt-1 text-text-muted">
            Age {player.age} · {formatHeight(player.heightInches)} ·{" "}
            {player.weightPounds} lb
          </p>
          {team ? (
            <Link
              href={`/leagues/${league.id}/teams/${team.id}`}
              className="mt-3 inline-flex min-h-touch items-center gap-2 font-semibold hover:underline"
            >
              <TeamBadge team={team} size="sm" />
              {teamName(team)}
            </Link>
          ) : (
            <p className="mt-3 font-semibold">Free agent</p>
          )}
        </div>
        <dl className="flex gap-6">
          <BigNumber label="Overall" value={player.overall} />
          <BigNumber label="Potential" value={player.potential} />
        </dl>
      </section>

      <div className="grid gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
        {GROUPS.map((group) => (
          <section
            key={group.title}
            aria-labelledby={`group-${group.title}`}
            className="rounded-lg border border-border bg-surface p-5"
          >
            <h3 id={`group-${group.title}`} className="text-lg font-bold">
              {group.title}
            </h3>
            <ul className="mt-3 flex flex-col gap-3">
              {group.keys.map((key) => (
                <RatingBar
                  key={key}
                  label={RATING_LABELS[key].name}
                  value={player.ratings[key]}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function BigNumber({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <dt className="text-sm font-semibold text-text-muted">{label}</dt>
      <dd className="text-4xl font-black tabular-nums">{value}</dd>
    </div>
  );
}

/** A 25–99 rating as a number and a bar. The number carries the meaning. */
function RatingBar({ label, value }: { label: string; value: number }) {
  const percent = Math.round(((value - 25) / (99 - 25)) * 100);
  const tone =
    value >= 80 ? "bg-win" : value >= 60 ? "bg-accent" : "bg-text-muted";
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <span>{label}</span>
        <span className="font-bold tabular-nums">{value}</span>
      </div>
      <div
        aria-hidden="true"
        className="mt-1 h-2 overflow-hidden rounded-full bg-surface-muted"
      >
        <div
          className={`h-full rounded-full ${tone}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </li>
  );
}

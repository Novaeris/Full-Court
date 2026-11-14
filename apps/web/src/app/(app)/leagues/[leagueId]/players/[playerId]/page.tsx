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
import { getHallOfFame, getRetiredYear } from "@/server/services/hall-of-fame";
import { getCareer } from "@/server/services/history";
import { getPlayerSeason, type Line } from "@/server/services/stats";
import { getPlayer, listTeams } from "@/server/services/world";

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

  const [career, teams, season, retiredYear, hall] = await Promise.all([
    getCareer(ctx, league.id, player.id),
    listTeams(ctx, league.id),
    getPlayerSeason(ctx, league.id, player.id),
    getRetiredYear(ctx, league.id, player.id),
    getHallOfFame(ctx, league.id, player.id),
  ]);
  const inducted = hall.members[0] ?? null;

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
          {player.injuryDays > 0 ? (
            <p role="status" className="mt-2 font-semibold text-danger">
              Injured: {player.injuryKind}. Out {player.injuryDays}{" "}
              {player.injuryDays === 1 ? "more day" : "more days"}.
            </p>
          ) : null}
          {team ? (
            <Link
              href={`/leagues/${league.id}/teams/${team.id}`}
              className="mt-3 inline-flex min-h-touch items-center gap-2 font-semibold hover:underline"
            >
              <TeamBadge team={team} size="sm" />
              {teamName(team)}
            </Link>
          ) : retiredYear !== null ? (
            <p className="mt-3 font-semibold">Retired {retiredYear}</p>
          ) : (
            <p className="mt-3 font-semibold">Free agent</p>
          )}
          {inducted ? (
            <p className="mt-1 font-semibold text-accent">
              <Link
                href={`/leagues/${league.id}/hall-of-fame`}
                className="inline-flex min-h-touch items-center underline underline-offset-4"
              >
                Hall of Fame · inducted {inducted.inductedYear}
              </Link>
            </p>
          ) : null}
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

      {season && (season.regular || season.playoffs) ? (
        <section
          aria-labelledby="season-heading"
          className="rounded-lg border border-border bg-surface p-5"
        >
          <h3 id="season-heading" className="text-lg font-bold">
            {season.year} season
          </h3>
          {season.regular ? (
            <StatLine title="Regular season" line={season.regular} />
          ) : null}
          {season.playoffs ? (
            <StatLine title="Playoffs" line={season.playoffs} />
          ) : null}
          <h4 className="mt-4 font-semibold">Latest games</h4>
          <ul className="mt-1">
            {season.recent.map((g) => {
              const opponent = teams.find((t) => t.id === g.opponentId);
              return (
                <li
                  key={g.gameId}
                  className="flex flex-wrap justify-between gap-x-3 border-t border-border py-1.5 first:border-t-0"
                >
                  <Link
                    href={`/leagues/${league.id}/games/${g.gameId}`}
                    className="inline-flex min-h-touch items-center text-accent underline underline-offset-4"
                  >
                    Day {g.day}: {g.home ? "vs" : "at"}{" "}
                    {opponent ? opponent.abbreviation : "?"} {g.won ? "W" : "L"}{" "}
                    {g.score}
                    {g.playoff ? " (playoffs)" : ""}
                  </Link>
                  <span className="tabular-nums">
                    {g.minutes} min · {g.points} pts · {g.rebounds} reb ·{" "}
                    {g.assists} ast
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {career.awards.length > 0 ? (
        <section
          aria-labelledby="awards-heading"
          className="rounded-lg border border-border bg-surface p-5"
        >
          <h3 id="awards-heading" className="text-lg font-bold">
            Awards
          </h3>
          <ul className="mt-2">
            {career.awards.map((a) => (
              <li
                key={`${a.year}-${a.award}`}
                className="flex justify-between gap-3 border-t border-border py-1.5 first:border-t-0"
              >
                <span>{a.label}</span>
                <span className="tabular-nums text-text-muted">{a.year}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {career.seasons.length > 0 ? (
        <section
          aria-labelledby="career-heading"
          className="rounded-lg border border-border bg-surface p-5"
        >
          <h3 id="career-heading" className="text-lg font-bold">
            Career
          </h3>
          <p className="text-sm text-text-muted">Regular season, per game.</p>
          <ul className="mt-2">
            {career.seasons.map((s) => {
              const t = teams.find((x) => x.id === s.teamId);
              return (
                <li
                  key={`${s.year}-${s.teamId}`}
                  className="flex flex-wrap justify-between gap-x-3 border-t border-border py-1.5 first:border-t-0"
                >
                  <span>
                    <span className="font-semibold tabular-nums">{s.year}</span>{" "}
                    {t ? t.abbreviation : ""} · {s.games} games
                  </span>
                  <span className="tabular-nums">
                    {s.points.toFixed(1)} pts · {s.rebounds.toFixed(1)} reb ·{" "}
                    {s.assists.toFixed(1)} ast
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** A season line: per-game averages and shooting. */
function StatLine({ title, line }: { title: string; line: Line }) {
  const per = (n: number) => (n / line.games).toFixed(1);
  const pct = (made: number, tried: number) =>
    tried > 0 ? `${((100 * made) / tried).toFixed(1)}%` : "-";
  return (
    <div className="mt-3">
      <p className="font-semibold">
        {title}{" "}
        <span className="font-normal text-text-muted">
          {line.games} {line.games === 1 ? "game" : "games"}, {line.started}{" "}
          started
        </span>
      </p>
      <dl className="mt-1 grid grid-cols-3 gap-x-4 gap-y-1 text-sm tablet:grid-cols-6">
        {[
          ["MPG", per(line.minutes)],
          ["PTS", per(line.points)],
          ["REB", per(line.rebounds)],
          ["AST", per(line.assists)],
          ["STL", per(line.steals)],
          ["BLK", per(line.blocks)],
          ["TO", per(line.turnovers)],
          ["FG%", pct(line.fgm, line.fga)],
          ["3P%", pct(line.tpm, line.tpa)],
          ["FT%", pct(line.ftm, line.fta)],
        ].map(([label, value]) => (
          <div key={label} className="flex flex-col">
            <dt className="text-text-muted">{label}</dt>
            <dd className="font-bold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
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

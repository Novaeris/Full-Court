"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  canSeedByConference,
  playoffTeamOptions,
  reconcilePlayoffConfig,
  samePlayoffs,
  sameSchedule,
  scheduleFor,
  scheduleGames,
  schedulePresetLengths,
  seasonRulesIssues,
} from "@fullcourt/game-rules";
import type {
  PlayoffConfig,
  ScheduleRule,
  ScheduleTiers,
  SeriesLength,
} from "@fullcourt/game-types";
import type { LeagueSettings, LeagueStructure } from "@fullcourt/validation";
import { SelectField } from "@/components/forms/form";
import { Button } from "@/components/ui/button";
import { roundName } from "./setup/draft";

type ErrorBody = { error?: { message?: string } };

const PRESET_LABEL = {
  short: "Short",
  standard: "Standard",
  long: "Long",
  custom: "Custom",
} as const;

const COUNTS = Array.from({ length: 8 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}));

/**
 * The schedule and playoff format for the next season. They take over when the
 * next season is created; the season being played keeps the rules it began
 * with.
 */
export function SeasonRulesForm({
  leagueId,
  settings,
  structure,
}: {
  leagueId: string;
  settings: LeagueSettings;
  structure: LeagueStructure;
}) {
  const router = useRouter();
  const start = {
    schedule: settings.next?.schedule ?? settings.schedule,
    playoffs: settings.next?.playoffs ?? settings.playoffs,
  };
  const [schedule, setSchedule] = useState<ScheduleRule>(start.schedule);
  const [playoffs, setPlayoffs] = useState<PlayoffConfig>(start.playoffs);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lengths = useMemo(() => schedulePresetLengths(structure), [structure]);
  const issues = seasonRulesIssues(structure, schedule, playoffs);
  const games = scheduleGames(structure, schedule);
  const total = structure.conferences
    .flatMap((c) => c.divisions)
    .reduce((n, d) => n + d.teamCount, 0);
  const conferences = structure.conferences.length;
  const spots =
    playoffs.seeding === "conference"
      ? playoffs.teams / conferences
      : playoffs.teams;
  const inForce =
    sameSchedule(schedule, settings.schedule) &&
    samePlayoffs(playoffs, settings.playoffs);
  const unchanged =
    sameSchedule(schedule, start.schedule) &&
    samePlayoffs(playoffs, start.playoffs);

  function patchPlayoffs(patch: Partial<PlayoffConfig>) {
    setMessage(null);
    setPlayoffs((now) =>
      reconcilePlayoffConfig(structure, { ...now, ...patch }),
    );
  }

  function setPreset(preset: ScheduleRule["preset"]) {
    setMessage(null);
    setSchedule(scheduleFor(preset, schedule.tiers));
  }

  function setTier(key: keyof ScheduleTiers, value: number) {
    setMessage(null);
    setSchedule({
      preset: "custom",
      tiers: { ...schedule.tiers, [key]: value },
    });
  }

  async function save() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/v1/leagues/${leagueId}/season-rules`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ schedule, playoffs }),
      });
      const json: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError(
          (json as ErrorBody | null)?.error?.message ??
            "Something went wrong. Please try again.",
        );
        return;
      }
      setMessage(
        inForce
          ? "Saved. These are the rules this league plays by now, so nothing changes."
          : "Saved. These rules start with the next season.",
      );
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {settings.next ? (
        <p role="status" className="rounded-md border border-border px-4 py-3">
          Changes are waiting for the next season. They start when it is
          created.
        </p>
      ) : null}

      <section className="flex flex-col gap-4" aria-labelledby="schedule-h">
        <h3 id="schedule-h" className="text-lg font-bold">
          Season length
        </h3>
        <SelectField
          label="Schedule"
          name="schedulePreset"
          value={schedule.preset}
          onChange={(e) => setPreset(e.target.value as ScheduleRule["preset"])}
          options={[
            ...(["short", "standard", "long"] as const).map((p) => ({
              value: p as string,
              label: `${PRESET_LABEL[p]}${lengths[p] === null ? "" : `: ${lengths[p]} games`}`,
            })),
            { value: "custom", label: "Custom" },
          ]}
        />
        <div className="grid gap-3 tablet:grid-cols-3">
          <SelectField
            label="Games against each division rival"
            name="tierDivision"
            value={String(schedule.tiers.division)}
            onChange={(e) => setTier("division", Number(e.target.value))}
            options={COUNTS}
          />
          <SelectField
            label="Games against each other team in the conference"
            name="tierConference"
            value={String(schedule.tiers.conference)}
            onChange={(e) => setTier("conference", Number(e.target.value))}
            options={COUNTS}
          />
          <SelectField
            label="Games against each team in the other conference"
            name="tierInterconference"
            value={String(schedule.tiers.interconference)}
            onChange={(e) => setTier("interconference", Number(e.target.value))}
            options={COUNTS}
          />
        </div>
        <p className="text-text-muted">
          {games === null
            ? "These counts don't give every team the same number of games."
            : `Every team plays ${games} games.`}
        </p>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="po-h">
        <h3 id="po-h" className="text-lg font-bold">
          Playoffs
        </h3>
        <SelectField
          label="Playoff teams"
          name="playoffTeams"
          value={String(playoffs.teams)}
          onChange={(e) => patchPlayoffs({ teams: Number(e.target.value) })}
          options={playoffTeamOptions(structure).map((n) => ({
            value: String(n),
            label: `${n} of ${total} teams`,
          }))}
        />
        <SelectField
          label="Seeding"
          name="playoffSeeding"
          value={playoffs.seeding}
          onChange={(e) =>
            patchPlayoffs({
              seeding: e.target.value as "conference" | "league",
            })
          }
          options={[
            ...(canSeedByConference(structure, playoffs.teams)
              ? [{ value: "conference", label: "By conference" }]
              : []),
            { value: "league", label: "League-wide" },
          ]}
        />
        <label className="flex min-h-touch items-center gap-3 font-semibold">
          <input
            type="checkbox"
            className="size-6 shrink-0 accent-accent"
            checked={playoffs.autoQualifyDivisionLeaders}
            onChange={(e) =>
              patchPlayoffs({ autoQualifyDivisionLeaders: e.target.checked })
            }
          />
          Division leaders qualify automatically
        </label>
        {playoffs.autoQualifyDivisionLeaders ? (
          <SelectField
            label="Division leaders seeded first"
            name="topSeeds"
            value={
              playoffs.divisionLeaderTopSeeds === null
                ? "all"
                : String(playoffs.divisionLeaderTopSeeds)
            }
            onChange={(e) =>
              patchPlayoffs({
                divisionLeaderTopSeeds:
                  e.target.value === "all" ? null : Number(e.target.value),
              })
            }
            options={[
              { value: "all", label: "Every division leader" },
              ...Array.from({ length: spots }, (_, i) => ({
                value: String(i + 1),
                label: `The best ${i + 1}`,
              })),
            ]}
          />
        ) : null}
        <fieldset className="grid gap-3 tablet:grid-cols-2">
          <legend className="mb-1 font-semibold">Series length</legend>
          {playoffs.roundSeriesLengths.map((length, i) => (
            <SelectField
              key={i}
              label={roundName(i, playoffs.roundSeriesLengths.length)}
              name={`round-${i}`}
              value={String(length)}
              onChange={(e) =>
                patchPlayoffs({
                  roundSeriesLengths: playoffs.roundSeriesLengths.map((n, j) =>
                    j === i ? (Number(e.target.value) as SeriesLength) : n,
                  ),
                })
              }
              options={[3, 5, 7].map((n) => ({
                value: String(n),
                label: `Best of ${n}`,
              }))}
            />
          ))}
        </fieldset>
      </section>

      {issues.length > 0 ? (
        <ul className="font-semibold text-danger">
          {issues.map((i) => (
            <li key={i.code}>{i.message}</li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={busy || issues.length > 0 || unchanged}
          onClick={() => void save()}
        >
          Save for the next season
        </Button>
        {message ? <p role="status">{message}</p> : null}
      </div>
      {error ? (
        <p role="alert" className="font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

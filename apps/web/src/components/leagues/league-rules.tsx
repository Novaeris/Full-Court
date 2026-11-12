import { REGION_NAMES } from "@fullcourt/game-types";
import type { LeagueSettings, LeagueStructure } from "@fullcourt/validation";
import { roundName } from "./setup/draft";

/** What a league was created with, read back from what was stored. */
export function LeagueRules({
  settings,
  structure,
}: {
  settings: LeagueSettings;
  structure: LeagueStructure;
}) {
  const { playoffs } = settings;
  const teams = structure.conferences
    .flatMap((c) => c.divisions)
    .reduce((n, d) => n + d.teamCount, 0);
  const divisions = structure.conferences.flatMap((c) => c.divisions).length;
  const spots =
    playoffs.seeding === "conference"
      ? playoffs.teams / structure.conferences.length
      : playoffs.teams;
  const rows: [string, string][] = [
    [
      "Structure",
      `${settings.preset === "standard" ? "Standard" : "Custom"}: ${teams} teams in ${structure.conferences.length} ${structure.conferences.length === 1 ? "conference" : "conferences"} and ${divisions} ${divisions === 1 ? "division" : "divisions"}`,
    ],
    [
      "Region",
      settings.region ? REGION_NAMES[settings.region] : "Fictional cities",
    ],
    [
      "Playoffs",
      `${playoffs.teams} of ${teams} teams, ${playoffs.seeding === "conference" ? `${spots} per conference` : "league-wide seeding"}`,
    ],
    [
      "Division leaders",
      !playoffs.autoQualifyDivisionLeaders
        ? "No automatic spot"
        : playoffs.divisionLeaderTopSeeds === null
          ? "Qualify automatically, seeded first"
          : `Qualify automatically, the best ${playoffs.divisionLeaderTopSeeds} seeded first`,
    ],
    [
      "Series",
      playoffs.roundSeriesLengths
        .map(
          (n, i) =>
            `${roundName(i, playoffs.roundSeriesLengths.length)}: best of ${n}`,
        )
        .join(" · "),
    ],
    ["Fantasy draft", settings.fantasyDraft ? "On" : "Off"],
  ];
  return (
    <>
      {settings.legacy ? (
        <p className="mb-3 text-sm text-text-muted">
          This league was created before league rules could be chosen, so these
          are the standard rules for its size.
        </p>
      ) : null}
      <dl className="divide-y divide-border rounded-lg border border-border">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex flex-col gap-0.5 px-4 py-3 tablet:flex-row tablet:gap-4"
          >
            <dt className="font-semibold text-text-muted tablet:w-40 tablet:shrink-0">
              {label}
            </dt>
            <dd className="min-w-0 break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

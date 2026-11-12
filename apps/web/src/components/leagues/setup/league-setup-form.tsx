"use client";

import { citiesIn } from "@fullcourt/game-engine";
import {
  canSeedByConference,
  playoffTeamOptions,
  supportedShapes,
  supportedTeamCounts,
  type RuleIssue,
} from "@fullcourt/game-rules";
import {
  MAX_LOCAL_PLAYERS,
  REGIONS,
  REGION_NAMES,
  SERIES_LENGTHS,
  type SeriesLength,
} from "@fullcourt/game-types";
import {
  useActionState,
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  CheckboxField,
  Field,
  FormMessage,
  IDLE,
  SelectField,
  SubmitButton,
} from "@/components/forms/form";
import { Button } from "@/components/ui/button";
import { createLeagueAction } from "@/server/leagues/actions";
import {
  describeShape,
  draftIssues,
  draftReducer,
  draftToRequest,
  initialDraft,
  roundName,
  structureOf,
  teamCount,
} from "./draft";

const STEPS = [
  "Basics",
  "Playoffs and options",
  "Your franchises",
  "Review",
] as const;
const LAST = STEPS.length - 1;

/**
 * League setup: name, structure, region, playoffs, fantasy draft and local
 * players. Rules and validation come from @fullcourt/game-rules, so the form
 * can never offer a combination the server would reject.
 */
export function LeagueSetupForm({ identitySeed }: { identitySeed: string }) {
  const [draft, dispatch] = useReducer(draftReducer, undefined, initialDraft);
  const [state, action] = useActionState(createLeagueAction, IDLE);
  const [step, setStep] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const issues = draftIssues(draft);
  const stepIssues =
    step === 0 ? issues.basics : step === 1 ? issues.rules : [];
  const structure = structureOf(draft.shape);
  const total = teamCount(draft.shape);

  // Move focus to the step heading so screen readers announce the change.
  useEffect(() => {
    if (step > 0) heading.current?.focus();
  }, [step]);

  return (
    <form
      noValidate
      action={action}
      // Enter in a field moves nothing forward: only the Create button on the
      // last step submits.
      onSubmit={(event) => {
        if (step !== LAST) event.preventDefault();
      }}
      className="flex flex-col gap-6"
    >
      <StepIndicator current={step} />
      <h2
        ref={heading}
        tabIndex={-1}
        className="text-2xl font-bold outline-none"
      >
        {STEPS[step]}
      </h2>

      {step === 0 ? (
        <BasicsStep
          draft={draft}
          dispatch={dispatch}
          total={total}
          nameError={issues.basics.find((i) => i.code === "name")?.message}
        />
      ) : null}
      {step === 1 ? (
        <RulesStep
          draft={draft}
          dispatch={dispatch}
          structure={structure}
          total={total}
        />
      ) : null}
      {step === 2 ? <FranchisesStep draft={draft} dispatch={dispatch} /> : null}
      {step === LAST ? (
        <>
          <ReviewStep draft={draft} total={total} />
          <input
            type="hidden"
            name="request"
            value={JSON.stringify(draftToRequest(draft, identitySeed))}
          />
          <FormMessage state={state} />
        </>
      ) : null}

      <IssueList issues={stepIssues.filter((i) => i.code !== "name")} />

      <div className="flex flex-col-reverse gap-3 tablet:flex-row tablet:justify-between">
        {step > 0 ? (
          <Button variant="secondary" onClick={() => setStep(step - 1)}>
            Back
          </Button>
        ) : (
          <span />
        )}
        {step < LAST ? (
          <Button
            onClick={() => setStep(step + 1)}
            disabled={stepIssues.length > 0}
          >
            Next: {STEPS[step + 1]}
          </Button>
        ) : (
          <SubmitButton pendingLabel="Generating your league…">
            Create league
          </SubmitButton>
        )}
      </div>
    </form>
  );
}

function StepIndicator({ current }: { current: number }) {
  return (
    <ol
      aria-label="Progress"
      className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-muted"
    >
      {STEPS.map((label, i) => (
        <li
          key={label}
          aria-current={i === current ? "step" : undefined}
          className={i === current ? "font-bold text-text" : undefined}
        >
          {i + 1}. {label}
        </li>
      ))}
    </ol>
  );
}

function IssueList({ issues }: { issues: readonly RuleIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <div
      role="alert"
      data-testid="issues"
      className="flex flex-col gap-1 rounded-md border border-danger bg-surface px-4 py-3 text-danger"
    >
      {issues.map((issue) => (
        <p key={`${issue.code}-${issue.message}`}>{issue.message}</p>
      ))}
    </div>
  );
}

type Dispatch = (action: Parameters<typeof draftReducer>[1]) => void;

function BasicsStep({
  draft,
  dispatch,
  total,
  nameError,
}: {
  draft: ReturnType<typeof initialDraft>;
  dispatch: Dispatch;
  total: number;
  nameError: string | undefined;
}) {
  const shapes = supportedShapes(total);
  return (
    <div className="flex flex-col gap-6">
      <Field
        label="League name"
        name="name"
        required
        maxLength={40}
        autoComplete="off"
        hint="Up to 40 characters. You can rename it later."
        value={draft.name}
        onChange={(e) => dispatch({ type: "name", value: e.target.value })}
        error={draft.name.length > 0 ? nameError : undefined}
      />

      <ChoiceGroup
        legend="League structure"
        name="preset"
        value={draft.preset}
        onChange={(value) =>
          dispatch({ type: "preset", value: value as "standard" | "custom" })
        }
        options={[
          {
            value: "standard",
            label: "Standard",
            detail: "30 teams in 2 conferences of 3 divisions, 5 teams each.",
          },
          {
            value: "custom",
            label: "Custom",
            detail: "Up to 32 teams. Choose how they split into divisions.",
          },
        ]}
      />

      {draft.preset === "custom" ? (
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
          <SelectField
            label="Number of teams"
            name="teamCount"
            hint="Only sizes that split into equal divisions are listed."
            value={String(total)}
            onChange={(e) =>
              dispatch({ type: "teamCount", value: Number(e.target.value) })
            }
            options={supportedTeamCounts().map((n) => ({
              value: String(n),
              label: `${n} teams`,
            }))}
          />
          <SelectField
            label="Conferences and divisions"
            name="shape"
            value={shapes
              .findIndex((s) => sameShape(s, draft.shape))
              .toString()}
            onChange={(e) => {
              const shape = shapes[Number(e.target.value)];
              if (shape) dispatch({ type: "shape", value: shape });
            }}
            options={shapes.map((shape, i) => ({
              value: String(i),
              label: describeShape(shape),
            }))}
          />
        </div>
      ) : null}

      <ChoiceGroup
        legend="Region of play"
        name="region"
        value={draft.region}
        onChange={(value) =>
          dispatch({ type: "region", value: value as (typeof REGIONS)[number] })
        }
        options={REGIONS.map((region) => ({
          value: region,
          label: REGION_NAMES[region],
        }))}
        hint="Every franchise gets a real city from this region. No two teams share a city."
      />
    </div>
  );
}

function sameShape(
  a: ReturnType<typeof supportedShapes>[number],
  b: ReturnType<typeof supportedShapes>[number],
): boolean {
  return (
    a.conferences === b.conferences &&
    a.divisionsPerConference === b.divisionsPerConference &&
    a.teamsPerDivision === b.teamsPerDivision
  );
}

function RulesStep({
  draft,
  dispatch,
  structure,
  total,
}: {
  draft: ReturnType<typeof initialDraft>;
  dispatch: Dispatch;
  structure: ReturnType<typeof structureOf>;
  total: number;
}) {
  const { playoffs } = draft;
  const conferenceSeeding = canSeedByConference(structure, playoffs.teams);
  const conferences = structure.conferences.length;
  const spots =
    playoffs.seeding === "conference"
      ? playoffs.teams / conferences
      : playoffs.teams;
  const rounds = playoffs.roundSeriesLengths.length;
  const maxPlayers = Math.min(MAX_LOCAL_PLAYERS, total);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-5" aria-labelledby="playoffs-h">
        <h3 id="playoffs-h" className="text-xl font-bold">
          Playoffs
        </h3>
        <SelectField
          label="Playoff teams"
          name="playoffTeams"
          value={String(playoffs.teams)}
          onChange={(e) =>
            dispatch({
              type: "playoffs",
              patch: { teams: Number(e.target.value) },
            })
          }
          options={playoffTeamOptions(structure).map((n) => ({
            value: String(n),
            label: `${n} of ${total} teams`,
          }))}
        />

        <ChoiceGroup
          legend="Seeding"
          name="seeding"
          value={playoffs.seeding}
          onChange={(value) =>
            dispatch({
              type: "playoffs",
              patch: { seeding: value as "conference" | "league" },
            })
          }
          options={[
            {
              value: "conference",
              label: "By conference",
              detail: conferenceSeeding
                ? `${playoffs.teams / conferences === 1 ? "The best team" : `The best ${playoffs.teams / conferences} teams`} from each conference, seeded within ${conferences === 1 ? "it" : "each"}.`
                : "Needs 1, 2 or 4 conferences that each send the same number of teams.",
              disabled: !conferenceSeeding,
            },
            {
              value: "league",
              label: "League-wide",
              detail: `The best ${playoffs.teams} teams overall, seeded 1 to ${playoffs.teams}.`,
            },
          ]}
        />

        <div className="flex flex-col gap-3">
          <CheckboxField
            name="autoQualify"
            checked={playoffs.autoQualifyDivisionLeaders}
            onChange={(e) =>
              dispatch({
                type: "playoffs",
                patch: { autoQualifyDivisionLeaders: e.target.checked },
              })
            }
            label="Division leaders qualify automatically"
          />
          {playoffs.autoQualifyDivisionLeaders ? (
            <SelectField
              label="Division leaders seeded first"
              name="topSeeds"
              hint="These leaders take the top seeds. Other leaders still qualify and are seeded by record, and the remaining spots go to the best records."
              value={
                playoffs.divisionLeaderTopSeeds === null
                  ? "all"
                  : String(playoffs.divisionLeaderTopSeeds)
              }
              onChange={(e) =>
                dispatch({
                  type: "playoffs",
                  patch: {
                    divisionLeaderTopSeeds:
                      e.target.value === "all" ? null : Number(e.target.value),
                  },
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
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 font-semibold">Series length</legend>
          <div className="flex flex-wrap gap-2">
            {SERIES_LENGTHS.map((n) => (
              <Button
                key={n}
                variant="secondary"
                onClick={() => dispatch({ type: "allRounds", value: n })}
              >
                All best-of-{n}
              </Button>
            ))}
          </div>
          <div className="grid gap-3 tablet:grid-cols-2">
            {playoffs.roundSeriesLengths.map((length, i) => (
              <SelectField
                key={i}
                label={roundName(i, rounds)}
                name={`round-${i}`}
                value={String(length)}
                onChange={(e) =>
                  dispatch({
                    type: "round",
                    index: i,
                    value: Number(e.target.value) as SeriesLength,
                  })
                }
                options={SERIES_LENGTHS.map((n) => ({
                  value: String(n),
                  label: `Best of ${n}`,
                }))}
              />
            ))}
          </div>
        </fieldset>
      </section>

      <section className="flex flex-col gap-5" aria-labelledby="options-h">
        <h3 id="options-h" className="text-xl font-bold">
          Options
        </h3>
        <CheckboxField
          name="fantasyDraft"
          checked={draft.fantasyDraft}
          onChange={(e) =>
            dispatch({ type: "fantasyDraft", value: e.target.checked })
          }
          label="Start with a fantasy draft"
        />
        <SelectField
          label="Local players"
          name="localPlayers"
          hint="People sharing this device. Each runs at least one franchise, which you'll choose next."
          value={String(draft.localPlayers)}
          onChange={(e) =>
            dispatch({ type: "localPlayers", value: Number(e.target.value) })
          }
          options={Array.from({ length: maxPlayers }, (_, i) => ({
            value: String(i + 1),
            label: i === 0 ? "1 player" : `${i + 1} players`,
          }))}
        />
      </section>
    </div>
  );
}

function FranchisesStep({
  draft,
  dispatch,
}: {
  draft: ReturnType<typeof initialDraft>;
  dispatch: Dispatch;
}) {
  const cities = citiesIn(draft.region);
  return (
    <div className="flex flex-col gap-5">
      <p className="text-text-muted">
        {draft.localPlayers === 1
          ? "Pick the city you will run."
          : "Pick the city each player will run."}{" "}
        Every other team in {REGION_NAMES[draft.region]} is generated for you,
        with its own city, name, colours and logo.
      </p>
      {draft.franchiseCities.map((cityId, index) => (
        <SelectField
          key={index}
          label={
            draft.localPlayers === 1
              ? "Your franchise city"
              : `Player ${index + 1}'s franchise city`
          }
          name={`city-${index}`}
          value={cityId}
          onChange={(e) =>
            dispatch({ type: "franchiseCity", index, cityId: e.target.value })
          }
          options={cities.map((city) => ({
            value: city.id,
            label: `${city.name}, ${city.subdivision}`,
          }))}
        />
      ))}
    </div>
  );
}

function ReviewStep({
  draft,
  total,
}: {
  draft: ReturnType<typeof initialDraft>;
  total: number;
}) {
  const { playoffs } = draft;
  const structure = structureOf(draft.shape);
  const rounds = playoffs.roundSeriesLengths.length;
  const spots =
    playoffs.seeding === "conference"
      ? playoffs.teams / structure.conferences.length
      : playoffs.teams;
  const rows: [string, ReactNode][] = [
    ["League name", draft.name.trim()],
    [
      "Structure",
      `${draft.preset === "standard" ? "Standard" : "Custom"}: ${total} teams, ${describeShape(draft.shape)}`,
    ],
    ["Region", REGION_NAMES[draft.region]],
    [
      "Playoffs",
      `${playoffs.teams} of ${total} teams, ${playoffs.seeding === "conference" ? `${spots} per conference` : "league-wide seeding"}`,
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
        .map((n, i) => `${roundName(i, rounds)}: best of ${n}`)
        .join(" · "),
    ],
    ["Fantasy draft", draft.fantasyDraft ? "Yes" : "No"],
    [
      "Local players",
      draft.localPlayers === 1 ? "1 player" : `${draft.localPlayers} players`,
    ],
    [
      "Franchises",
      draft.franchiseCities
        .map((id, i) => {
          const city = citiesIn(draft.region).find((c) => c.id === id);
          const label = city ? `${city.name}, ${city.subdivision}` : id;
          return draft.localPlayers === 1 ? label : `Player ${i + 1}: ${label}`;
        })
        .join(" · "),
    ],
  ];
  return (
    <div className="flex flex-col gap-4">
      <dl className="divide-y divide-border rounded-lg border border-border bg-surface">
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
    </div>
  );
}

type Choice = {
  value: string;
  label: string;
  detail?: string;
  disabled?: boolean;
};

/** Radio cards, like the league size choice. Arrow keys move between them. */
function ChoiceGroup({
  legend,
  name,
  value,
  onChange,
  options,
  hint,
}: {
  legend: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly Choice[];
  hint?: string;
}) {
  const hintId = useId();
  return (
    <fieldset
      className="flex flex-col gap-2"
      aria-describedby={hint ? hintId : undefined}
    >
      <legend className="mb-1.5 font-semibold">{legend}</legend>
      {options.map((option) => (
        <label
          key={option.value}
          className={[
            "flex min-h-touch items-start gap-3 rounded-md border border-border bg-surface p-3 has-checked:border-accent has-checked:bg-accent-soft",
            option.disabled
              ? "cursor-not-allowed opacity-60"
              : "cursor-pointer",
          ].join(" ")}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            disabled={option.disabled}
            onChange={() => onChange(option.value)}
            className="mt-1 size-5 shrink-0 accent-(--color-accent)"
          />
          <span className="min-w-0">
            <span className="block font-semibold">{option.label}</span>
            {option.detail ? (
              <span className="block text-sm text-text-muted">
                {option.detail}
              </span>
            ) : null}
          </span>
        </label>
      ))}
      {hint ? (
        <p id={hintId} className="text-sm text-text-muted">
          {hint}
        </p>
      ) : null}
    </fieldset>
  );
}

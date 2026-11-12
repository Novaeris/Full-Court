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
  AI_ASSIST_KEYS,
  AI_ASSIST_LABELS,
  LOGO_IDS,
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
  useMemo,
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
import { TeamBadge } from "@/components/leagues/team-badge";
import { TeamLogo, logoLabel } from "@/components/leagues/team-logo";
import { Button } from "@/components/ui/button";
import { createLeagueAction } from "@/server/leagues/actions";
import {
  describeShape,
  draftIssues,
  draftReducer,
  draftToRequest,
  franchiseLabel,
  initialDraft,
  previewLeague,
  roundName,
  structureOf,
  teamCount,
  type Draft,
  type Preview,
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
  const [draft, dispatch] = useReducer(
    draftReducer,
    identitySeed,
    initialDraft,
  );
  const [state, action] = useActionState(createLeagueAction, IDLE);
  const [step, setStep] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const preview = useMemo(() => previewLeague(draft), [draft]);
  const issues = useMemo(() => draftIssues(draft, preview), [draft, preview]);
  const stepIssues = [
    issues.basics,
    issues.rules,
    issues.franchises,
    issues.review,
  ][step] as RuleIssue[];
  const anyIssues =
    issues.basics.length +
      issues.rules.length +
      issues.franchises.length +
      issues.review.length >
    0;
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
      {step === 2 ? (
        <FranchisesStep draft={draft} dispatch={dispatch} preview={preview} />
      ) : null}
      {step === LAST ? (
        <>
          <ReviewStep
            draft={draft}
            total={total}
            dispatch={dispatch}
            preview={preview}
          />
          <input
            type="hidden"
            name="request"
            value={JSON.stringify(draftToRequest(draft, preview))}
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
          <SubmitButton
            pendingLabel="Generating your league…"
            disabled={anyIssues}
          >
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
  preview,
}: {
  draft: Draft;
  dispatch: Dispatch;
  preview: Preview;
}) {
  const cities = citiesIn(draft.region);
  const players = Array.from({ length: draft.localPlayers }, (_, i) => i + 1);
  const full = draft.franchises.length >= teamCount(draft.shape);
  return (
    <div className="flex flex-col gap-5">
      <p className="text-text-muted">
        Set up the franchises people will run. Every other team in{" "}
        {REGION_NAMES[draft.region]} is generated for you, with its own city,
        name, colours and logo, and anything you leave blank here is generated
        too.
      </p>
      {draft.franchises.map((franchise, index) => {
        const generated = preview.generated?.teams.find(
          (t) => t.cityId === franchise.cityId,
        );
        const canRemove =
          draft.franchises.filter(
            (f) => f.localPlayerSlot === franchise.localPlayerSlot,
          ).length > 1;
        const customised =
          franchise.nickname.trim() !== "" ||
          franchise.primaryColor !== null ||
          franchise.secondaryColor !== null ||
          franchise.logoId !== null;
        const primary =
          franchise.primaryColor ?? generated?.primaryColor ?? "#1d4ed8";
        const secondary =
          franchise.secondaryColor ?? generated?.secondaryColor ?? "#facc15";
        const logo = franchise.logoId ?? generated?.logoId ?? LOGO_IDS[0];
        const patch = (change: Parameters<typeof dispatchPatch>[2]) =>
          dispatchPatch(dispatch, franchise.key, change);
        return (
          <fieldset
            key={franchise.key}
            className="flex flex-col gap-4 rounded-lg border border-border p-4"
          >
            <legend className="px-1 font-bold">
              {franchiseLabel(draft, index)}
            </legend>
            {draft.localPlayers > 1 ? (
              <SelectField
                label="Run by"
                name={`owner-${franchise.key}`}
                value={String(franchise.localPlayerSlot)}
                onChange={(e) =>
                  patch({ localPlayerSlot: Number(e.target.value) })
                }
                options={players.map((n) => ({
                  value: String(n),
                  label: `Player ${n}`,
                }))}
              />
            ) : null}
            <SelectField
              label="City"
              name={`city-${franchise.key}`}
              value={franchise.cityId}
              onChange={(e) => patch({ cityId: e.target.value })}
              options={cities.map((city) => ({
                value: city.id,
                label: `${city.name}, ${city.subdivision}`,
              }))}
            />
            <Field
              label="Team name"
              name={`nickname-${franchise.key}`}
              maxLength={40}
              autoComplete="off"
              placeholder={generated?.nickname ?? ""}
              hint={
                generated
                  ? `Leave blank to be the ${generated.city} ${generated.nickname}.`
                  : undefined
              }
              value={franchise.nickname}
              onChange={(e) => patch({ nickname: e.target.value })}
            />
            <div className="grid gap-4 tablet:grid-cols-2">
              <ColorField
                label="Primary colour"
                value={primary}
                onChange={(value) => patch({ primaryColor: value })}
              />
              <ColorField
                label="Secondary colour"
                value={secondary}
                onChange={(value) => patch({ secondaryColor: value })}
              />
            </div>
            <p className="-mt-2 text-sm text-text-muted">
              Team names are shown in white on the primary colour, so choose a
              dark one.
            </p>
            <LogoPicker
              name={`logo-${franchise.key}`}
              value={logo ?? "logo-01"}
              background={primary}
              onChange={(value) => patch({ logoId: value })}
            />
            <div className="flex flex-col gap-2 tablet:flex-row">
              <span className="flex items-center gap-3">
                <TeamBadge
                  size="lg"
                  team={{
                    abbreviation: generated?.abbreviation ?? "",
                    primaryColor: primary,
                    secondaryColor: secondary,
                    logoId: logo ?? null,
                  }}
                />
                <span className="font-semibold break-words">
                  {franchise.nickname.trim() || generated?.nickname}
                </span>
              </span>
            </div>
            <AiAssistSettings
              flags={franchise.aiAssist}
              onChange={(flag, value) =>
                dispatch({
                  type: "aiAssist",
                  key: franchise.key,
                  flag,
                  value,
                })
              }
            />
            <div className="flex flex-col gap-2 tablet:flex-row">
              {customised ? (
                <Button
                  variant="secondary"
                  onClick={() =>
                    dispatch({ type: "resetFranchise", key: franchise.key })
                  }
                >
                  Use generated name, colours and logo
                </Button>
              ) : null}
              {canRemove ? (
                <Button
                  variant="secondary"
                  onClick={() =>
                    dispatch({ type: "removeFranchise", key: franchise.key })
                  }
                >
                  Remove this franchise
                </Button>
              ) : null}
            </div>
          </fieldset>
        );
      })}
      <div>
        <Button
          variant="secondary"
          disabled={full}
          onClick={() => dispatch({ type: "addFranchise" })}
        >
          Add another franchise
        </Button>
        {full ? (
          <p className="mt-2 text-sm text-text-muted">
            Every team in the league is already a franchise.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function dispatchPatch(
  dispatch: Dispatch,
  key: number,
  change: Extract<Parameters<Dispatch>[0], { type: "franchise" }>["patch"],
) {
  dispatch({ type: "franchise", key, patch: change });
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <input
          id={id}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-16 cursor-pointer rounded-md border border-text-muted bg-surface p-1"
        />
        <span className="font-mono text-sm text-text-muted">{value}</span>
      </div>
    </div>
  );
}

/** The built-in logos as a radio group; the one in use is highlighted. */
function LogoPicker({
  name,
  value,
  background,
  onChange,
}: {
  name: string;
  value: string;
  background: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 font-semibold">Logo</legend>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(3rem,1fr))] gap-2">
        {LOGO_IDS.map((id) => (
          <label key={id} className="relative block cursor-pointer">
            <input
              type="radio"
              name={name}
              value={id}
              checked={value === id}
              // Handle the click, not the change: until you choose, the
              // generated logo is shown as selected, and clicking that one
              // must still count as choosing it (a change event would not
              // fire, and a later shuffle would swap it for another).
              onClick={() => onChange(id)}
              onChange={() => {}}
              className="peer sr-only"
            />
            <span
              className="flex h-12 w-full items-center justify-center rounded-md text-white ring-offset-2 ring-offset-surface peer-checked:ring-4 peer-checked:ring-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"
              style={{ backgroundColor: background }}
            >
              <TeamLogo logoId={id} className="size-7" />
              <span className="sr-only">{logoLabel(id)}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** The five AI Assist permissions for one franchise, all off by default. */
function AiAssistSettings({
  flags,
  onChange,
}: {
  flags: Draft["franchises"][number]["aiAssist"];
  onChange: (key: (typeof AI_ASSIST_KEYS)[number], value: boolean) => void;
}) {
  const on = AI_ASSIST_KEYS.filter((key) => flags[key]).length;
  return (
    <details className="rounded-md border border-border bg-surface-muted">
      <summary className="flex min-h-touch cursor-pointer items-center px-3 font-semibold">
        AI Assist:{" "}
        {on === 0 ? "all off" : `${on} of ${AI_ASSIST_KEYS.length} on`}
      </summary>
      <div className="flex flex-col gap-3 px-3 pb-3">
        <p className="text-sm text-text-muted">
          Choose what the AI may do for this franchise. Each permission is saved
          with the franchise, and all are off unless you turn them on. The AI
          that uses them isn&apos;t in the game yet, so for now they only record
          your choice.
        </p>
        {AI_ASSIST_KEYS.map((key) => (
          <CheckboxField
            key={key}
            name={`ai-${key}`}
            checked={flags[key]}
            onChange={(e) => onChange(key, e.target.checked)}
            label={
              <>
                <span className="block font-semibold">
                  {AI_ASSIST_LABELS[key].name}
                </span>
                <span className="block text-sm text-text-muted">
                  {AI_ASSIST_LABELS[key].description}
                </span>
              </>
            }
          />
        ))}
      </div>
    </details>
  );
}

/** A random seed for "Shuffle league". Only the seed is random: the league is not. */
function newSeed(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function ReviewStep({
  draft,
  total,
  dispatch,
  preview,
}: {
  draft: Draft;
  total: number;
  dispatch: Dispatch;
  preview: Preview;
}) {
  const { playoffs } = draft;
  const structure = structureOf(draft.shape);
  const rounds = playoffs.roundSeriesLengths.length;
  const spots =
    playoffs.seeding === "conference"
      ? playoffs.teams / structure.conferences.length
      : playoffs.teams;
  const [announce, setAnnounce] = useState("");
  const teamOf = (cityId: string) =>
    preview.plan?.teams.find((t) => t.cityId === cityId);
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
      draft.franchises
        .map((f, i) => {
          const team = teamOf(f.cityId);
          const label = team ? `${team.city} ${team.nickname}` : f.cityId;
          return draft.localPlayers === 1
            ? label
            : `${franchiseLabel(draft, i)}: ${label}`;
        })
        .join(" · "),
    ],
    [
      "AI Assist",
      draft.franchises
        .map((f, i) => {
          const on = AI_ASSIST_KEYS.filter((key) => f.aiAssist[key]).map(
            (key) => AI_ASSIST_LABELS[key].name,
          );
          const text = on.length === 0 ? "all off" : on.join(", ");
          return draft.franchises.length === 1
            ? text
            : `${franchiseLabel(draft, i)}: ${text}`;
        })
        .join(" · "),
    ],
  ];
  return (
    <div className="flex flex-col gap-6">
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

      <section aria-labelledby="preview-h" className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 tablet:flex-row tablet:items-end tablet:justify-between">
          <div>
            <h3 id="preview-h" className="text-xl font-bold">
              League preview
            </h3>
            <p className="text-text-muted">
              Every team in your league, as it will be created. Rename any
              conference or division, or shuffle the teams you aren&apos;t
              running.
            </p>
          </div>
          <div className="flex flex-col gap-2 tablet:flex-row">
            <Button
              variant="secondary"
              onClick={() => {
                dispatch({ type: "shuffle", seed: newSeed() });
                setAnnounce("League shuffled.");
              }}
            >
              Shuffle league
            </Button>
            {Object.keys(preview.names.conferences).length +
              Object.keys(preview.names.divisions).length >
            0 ? (
              <Button
                variant="secondary"
                onClick={() => dispatch({ type: "resetNames" })}
              >
                Use generated names
              </Button>
            ) : null}
          </div>
        </div>
        <p role="status" className="sr-only">
          {announce}
        </p>
        {preview.plan ? (
          <PreviewLeague draft={draft} dispatch={dispatch} preview={preview} />
        ) : (
          <p className="text-danger">{preview.problem}</p>
        )}
      </section>
    </div>
  );
}

function PreviewLeague({
  draft,
  dispatch,
  preview,
}: {
  draft: Draft;
  dispatch: Dispatch;
  preview: Preview;
}) {
  const plan = preview.plan;
  const generated = preview.generated;
  if (!plan || !generated) return null;
  return (
    <div className="flex flex-col gap-5">
      {plan.structure.conferences.map((conference, ci) => {
        const generatedConference = generated.structure.conferences[ci];
        return (
          <fieldset
            key={conference.id}
            className="flex flex-col gap-4 rounded-lg border border-border p-4"
          >
            <legend className="px-1 text-lg font-bold">
              {conference.name} Conference
            </legend>
            <Field
              label="Conference name"
              name={`conference:${conference.id}`}
              maxLength={40}
              autoComplete="off"
              value={
                draft.names.conferences[conference.id] ??
                generatedConference?.name ??
                conference.name
              }
              onChange={(e) =>
                dispatch({
                  type: "rename",
                  kind: "conference",
                  id: conference.id,
                  name: e.target.value,
                })
              }
            />
            <div className="grid gap-4 desktop:grid-cols-2">
              {conference.divisions.map((division, di) => (
                <div key={division.id} className="flex flex-col gap-2">
                  <Field
                    label={`Division name (${division.teamCount} teams)`}
                    name={`division:${division.id}`}
                    maxLength={40}
                    autoComplete="off"
                    value={
                      draft.names.divisions[division.id] ??
                      generatedConference?.divisions[di]?.name ??
                      division.name
                    }
                    onChange={(e) =>
                      dispatch({
                        type: "rename",
                        kind: "division",
                        id: division.id,
                        name: e.target.value,
                      })
                    }
                  />
                  <ul
                    aria-label={`${division.name} Division teams`}
                    className="flex flex-col gap-1.5"
                  >
                    {plan.teams
                      .filter((t) => t.divisionId === division.id)
                      .map((team) => (
                        <li
                          key={team.cityId}
                          className={[
                            "flex items-center gap-3 rounded-md border px-2 py-1.5",
                            team.localPlayerSlot === null
                              ? "border-border"
                              : "border-accent bg-accent-soft",
                          ].join(" ")}
                        >
                          <TeamBadge size="sm" team={team} />
                          <span className="min-w-0 flex-1 break-words">
                            {team.city} {team.nickname}
                          </span>
                          {team.localPlayerSlot !== null ? (
                            <span className="shrink-0 text-sm font-semibold">
                              Player {team.localPlayerSlot}
                            </span>
                          ) : null}
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          </fieldset>
        );
      })}
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

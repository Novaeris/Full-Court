import { contrastRatio } from "@fullcourt/design-tokens";
import {
  citiesIn,
  planOwnerLeague,
  type OwnerLeaguePlan,
  type OwnerWorldOptions,
} from "@fullcourt/game-engine";
import {
  defaultPlayoffConfig,
  equalStructure,
  nameKey,
  reconcilePlayoffConfig,
  STANDARD_SHAPE,
  supportedShapes,
  totalTeams,
  validateLocalPlayers,
  validatePlayoffConfig,
  validateSupportedStructure,
  type EqualShape,
  type RuleIssue,
} from "@fullcourt/game-rules";
import {
  LEAGUE_CONFIG_SCHEMA_VERSION,
  MAX_LOCAL_PLAYERS,
  NO_AI_ASSIST,
  type AiAssistFlags,
  type AiAssistKey,
  type LeagueConfig,
  type LeaguePreset,
  type LeagueStructure,
  type PlayoffConfig,
  type Region,
  type SeriesLength,
} from "@fullcourt/game-types";
import {
  LeagueNameSchema,
  type CreateLeagueRequest,
} from "@fullcourt/validation";

/**
 * The league setup being edited. Plain data plus a reducer, so the form's
 * behaviour is testable without a browser. The rules themselves come from
 * @fullcourt/game-rules, and the preview is the same pure engine function the
 * server uses to create the league.
 */

/** A franchise the owner runs. Anything left empty is generated. */
export type DraftFranchise = {
  /** Stable key for lists; not sent to the server. */
  key: number;
  /** The local player running it, 1 to the number of local players. */
  localPlayerSlot: number;
  cityId: string;
  /** "" means generated. */
  nickname: string;
  /** null means generated. */
  primaryColor: string | null;
  secondaryColor: string | null;
  logoId: string | null;
  /** AI Assist permissions, all off by default. */
  aiAssist: AiAssistFlags;
};

/** Display names the owner typed for generated conferences and divisions, by id. */
export type NameOverrides = {
  conferences: Record<string, string>;
  divisions: Record<string, string>;
};

export type Draft = {
  name: string;
  preset: LeaguePreset;
  region: Region;
  /** Equal-division shape; fixed to the standard shape for the standard preset. */
  shape: EqualShape;
  playoffs: PlayoffConfig;
  fantasyDraft: boolean;
  localPlayers: number;
  franchises: DraftFranchise[];
  /** Seeds every generated franchise; "Shuffle league" changes it. */
  identitySeed: string;
  names: NameOverrides;
  nextKey: number;
};

/** The 12-team layout offered as a quick custom choice. */
export const COMPACT_SHAPE: EqualShape = {
  conferences: 2,
  divisionsPerConference: 2,
  teamsPerDivision: 3,
};

export function structureOf(shape: EqualShape): LeagueStructure {
  return equalStructure(
    shape.conferences,
    shape.divisionsPerConference,
    shape.teamsPerDivision,
  );
}

export function teamCount(shape: EqualShape): number {
  return (
    shape.conferences * shape.divisionsPerConference * shape.teamsPerDivision
  );
}

const NO_NAMES: NameOverrides = { conferences: {}, divisions: {} };

function firstUnusedCity(region: Region, used: ReadonlySet<string>): string {
  const city = citiesIn(region).find((c) => !used.has(c.id));
  return (city ?? citiesIn(region)[0])?.id ?? "";
}

function newFranchise(
  key: number,
  localPlayerSlot: number,
  cityId: string,
): DraftFranchise {
  return {
    key,
    localPlayerSlot,
    cityId,
    nickname: "",
    primaryColor: null,
    secondaryColor: null,
    logoId: null,
    aiAssist: { ...NO_AI_ASSIST },
  };
}

export function initialDraft(identitySeed: string): Draft {
  const shape: EqualShape = { ...STANDARD_SHAPE };
  const region: Region = "north-america";
  return {
    name: "",
    preset: "standard",
    region,
    shape,
    playoffs: defaultPlayoffConfig(structureOf(shape)),
    fantasyDraft: false,
    localPlayers: 1,
    franchises: [newFranchise(1, 1, firstUnusedCity(region, new Set()))],
    identitySeed,
    names: NO_NAMES,
    nextKey: 2,
  };
}

/**
 * Repairs the franchises after the league changed: every franchise belongs to
 * an existing player, has a city from the region that nobody else has, every
 * player runs at least one franchise, and there are no more than teams.
 */
function normalize(draft: Draft): Draft {
  const total = teamCount(draft.shape);
  const available = new Set(citiesIn(draft.region).map((c) => c.id));
  const used = new Set<string>();
  let nextKey = draft.nextKey;
  const kept: DraftFranchise[] = [];
  for (const f of draft.franchises) {
    if (f.localPlayerSlot < 1 || f.localPlayerSlot > draft.localPlayers)
      continue;
    const cityId =
      available.has(f.cityId) && !used.has(f.cityId)
        ? f.cityId
        : firstUnusedCity(draft.region, used);
    used.add(cityId);
    kept.push({ ...f, cityId });
  }
  for (let slot = 1; slot <= draft.localPlayers; slot++) {
    if (!kept.some((f) => f.localPlayerSlot === slot)) {
      const cityId = firstUnusedCity(draft.region, used);
      used.add(cityId);
      kept.push(newFranchise(nextKey++, slot, cityId));
    }
  }
  // Too many for a smaller league: drop extras, never a player's only franchise.
  while (kept.length > total) {
    let i = kept.length - 1;
    while (
      i >= 0 &&
      kept.filter((f) => f.localPlayerSlot === kept[i]?.localPlayerSlot)
        .length < 2
    ) {
      i--;
    }
    if (i < 0) break;
    kept.splice(i, 1);
  }
  return { ...draft, franchises: kept, nextKey };
}

export type DraftAction =
  | { type: "name"; value: string }
  | { type: "preset"; value: LeaguePreset }
  | { type: "region"; value: Region }
  | { type: "teamCount"; value: number }
  | { type: "shape"; value: EqualShape }
  | { type: "playoffs"; patch: Partial<PlayoffConfig> }
  | { type: "round"; index: number; value: SeriesLength }
  | { type: "allRounds"; value: SeriesLength }
  | { type: "fantasyDraft"; value: boolean }
  | { type: "localPlayers"; value: number }
  | { type: "addFranchise" }
  | { type: "removeFranchise"; key: number }
  | {
      type: "franchise";
      key: number;
      patch: Partial<Omit<DraftFranchise, "key" | "aiAssist">>;
    }
  | { type: "aiAssist"; key: number; flag: AiAssistKey; value: boolean }
  | { type: "resetFranchise"; key: number }
  | { type: "shuffle"; seed: string }
  | {
      type: "rename";
      kind: "conference" | "division";
      id: string;
      name: string;
    }
  | { type: "resetNames" };

/** Changing the structure resets the dependent choices to something valid. */
function withShape(draft: Draft, shape: EqualShape): Draft {
  const structure = structureOf(shape);
  return normalize({
    ...draft,
    shape,
    playoffs: reconcilePlayoffConfig(structure, draft.playoffs),
    localPlayers: Math.min(
      draft.localPlayers,
      MAX_LOCAL_PLAYERS,
      totalTeams(structure),
    ),
  });
}

const updateFranchise = (
  draft: Draft,
  key: number,
  change: (f: DraftFranchise) => DraftFranchise,
): Draft => ({
  ...draft,
  franchises: draft.franchises.map((f) => (f.key === key ? change(f) : f)),
});

export function draftReducer(draft: Draft, action: DraftAction): Draft {
  switch (action.type) {
    case "name":
      return { ...draft, name: action.value };
    case "region":
      // Cities belong to a region, so every franchise picks again.
      return normalize({
        ...draft,
        region: action.value,
        franchises: draft.franchises.map((f) => ({ ...f, cityId: "" })),
      });
    case "preset": {
      if (action.value === "standard") {
        return withShape(
          { ...draft, preset: "standard" },
          { ...STANDARD_SHAPE },
        );
      }
      // Leaving the standard layout starts from the compact one, a valid custom shape.
      const shape =
        draft.preset === "standard" ? { ...COMPACT_SHAPE } : draft.shape;
      return withShape({ ...draft, preset: "custom" }, shape);
    }
    case "teamCount": {
      // Prefer two conferences, then divisions close to five teams: the
      // familiar layout. The owner can pick another from the list.
      const shape = [...supportedShapes(action.value)].sort(
        (a, b) =>
          Number(b.conferences === 2) - Number(a.conferences === 2) ||
          Math.abs(a.teamsPerDivision - 5) - Math.abs(b.teamsPerDivision - 5) ||
          a.teamsPerDivision - b.teamsPerDivision,
      )[0];
      return shape ? withShape(draft, shape) : draft;
    }
    case "shape":
      return withShape(draft, action.value);
    case "playoffs":
      return {
        ...draft,
        playoffs: reconcilePlayoffConfig(structureOf(draft.shape), {
          ...draft.playoffs,
          ...action.patch,
        }),
      };
    case "round":
      return {
        ...draft,
        playoffs: {
          ...draft.playoffs,
          roundSeriesLengths: draft.playoffs.roundSeriesLengths.map((n, i) =>
            i === action.index ? action.value : n,
          ),
        },
      };
    case "allRounds":
      return {
        ...draft,
        playoffs: {
          ...draft.playoffs,
          roundSeriesLengths: draft.playoffs.roundSeriesLengths.map(
            () => action.value,
          ),
        },
      };
    case "fantasyDraft":
      return { ...draft, fantasyDraft: action.value };
    case "localPlayers":
      return normalize({
        ...draft,
        localPlayers: Math.max(
          1,
          Math.min(action.value, MAX_LOCAL_PLAYERS, teamCount(draft.shape)),
        ),
      });
    case "addFranchise": {
      if (draft.franchises.length >= teamCount(draft.shape)) return draft;
      const used = new Set(draft.franchises.map((f) => f.cityId));
      return {
        ...draft,
        franchises: [
          ...draft.franchises,
          newFranchise(draft.nextKey, 1, firstUnusedCity(draft.region, used)),
        ],
        nextKey: draft.nextKey + 1,
      };
    }
    case "removeFranchise": {
      const target = draft.franchises.find((f) => f.key === action.key);
      const others = draft.franchises.filter(
        (f) =>
          f.key !== action.key && f.localPlayerSlot === target?.localPlayerSlot,
      );
      // Every player keeps at least one franchise.
      if (!target || others.length === 0) return draft;
      return {
        ...draft,
        franchises: draft.franchises.filter((f) => f.key !== action.key),
      };
    }
    case "franchise": {
      const { cityId, localPlayerSlot } = action.patch;
      if (
        cityId !== undefined &&
        (!citiesIn(draft.region).some((c) => c.id === cityId) ||
          draft.franchises.some(
            (f) => f.key !== action.key && f.cityId === cityId,
          ))
      ) {
        return draft; // a city can only be used once, and must be in the region
      }
      const next = updateFranchise(draft, action.key, (f) => ({
        ...f,
        ...action.patch,
        ...(localPlayerSlot !== undefined
          ? {
              localPlayerSlot: Math.max(
                1,
                Math.min(localPlayerSlot, draft.localPlayers),
              ),
            }
          : {}),
      }));
      return normalize(next);
    }
    case "aiAssist":
      return updateFranchise(draft, action.key, (f) => ({
        ...f,
        aiAssist: { ...f.aiAssist, [action.flag]: action.value },
      }));
    case "resetFranchise":
      return updateFranchise(draft, action.key, (f) => ({
        ...f,
        nickname: "",
        primaryColor: null,
        secondaryColor: null,
        logoId: null,
      }));
    case "shuffle":
      // New cities, names, colours and logos for the other teams. Names typed
      // for the old league no longer apply.
      return { ...draft, identitySeed: action.seed, names: NO_NAMES };
    case "rename": {
      const group = action.kind === "conference" ? "conferences" : "divisions";
      return {
        ...draft,
        names: {
          ...draft.names,
          [group]: { ...draft.names[group], [action.id]: action.name },
        },
      };
    }
    case "resetNames":
      return { ...draft, names: NO_NAMES };
  }
}

// --- Preview: the league as the server will create it -------------------------------------

function ownerOptions(draft: Draft, names?: NameOverrides): OwnerWorldOptions {
  return {
    // Rosters are generated on the server; a preview needs none.
    seed: "preview",
    identitySeed: draft.identitySeed,
    region: draft.region,
    shape: structureOf(draft.shape),
    localPlayers: Array.from({ length: draft.localPlayers }, (_, i) => ({
      slot: i + 1,
      label: null,
    })),
    franchises: draft.franchises.map((f) => ({
      localPlayerSlot: f.localPlayerSlot,
      cityId: f.cityId,
      ...(f.nickname.trim() ? { nickname: f.nickname.trim() } : {}),
      ...(f.primaryColor ? { primaryColor: f.primaryColor } : {}),
      ...(f.secondaryColor ? { secondaryColor: f.secondaryColor } : {}),
      ...(f.logoId ? { logoId: f.logoId } : {}),
      aiAssist: f.aiAssist,
    })),
    ...(names ? { names } : {}),
  };
}

export type Preview = {
  /** The league with the owner's names applied, or without them if they clash. */
  plan: OwnerLeaguePlan | null;
  /** The league with generated names only. */
  generated: OwnerLeaguePlan | null;
  /** The name changes in effect: not blank, not the generated name, ids that exist. */
  names: NameOverrides;
  /** Why the league can't be planned at all. */
  problem: string | null;
  /** Why the typed names can't be used. */
  nameProblem: string | null;
};

const clean = (message: string) =>
  message
    .replace(/^Invariant failed: /, "")
    .replace(/^./, (c) => c.toUpperCase());

/** Plans the draft with the same pure function the server runs. */
export function previewLeague(draft: Draft): Preview {
  let generated: OwnerLeaguePlan;
  try {
    generated = planOwnerLeague(ownerOptions(draft));
  } catch (error) {
    return {
      plan: null,
      generated: null,
      names: NO_NAMES,
      problem: clean(
        error instanceof Error ? error.message : "Can't plan this league.",
      ),
      nameProblem: null,
    };
  }
  const generatedNames = {
    conferences: Object.fromEntries(
      generated.structure.conferences.map((c) => [c.id, c.name]),
    ),
    divisions: Object.fromEntries(
      generated.structure.conferences.flatMap((c) =>
        c.divisions.map((d) => [d.id, d.name]),
      ),
    ),
  };
  const keep = (
    typed: Record<string, string>,
    base: Record<string, string>,
  ): Record<string, string> =>
    Object.fromEntries(
      Object.entries(typed)
        .filter(
          ([id, name]) =>
            id in base && name.trim() !== "" && name.trim() !== base[id],
        )
        .map(([id, name]) => [id, name.trim()]),
    );
  const names: NameOverrides = {
    conferences: keep(draft.names.conferences, generatedNames.conferences),
    divisions: keep(draft.names.divisions, generatedNames.divisions),
  };
  if (
    Object.keys(names.conferences).length +
      Object.keys(names.divisions).length ===
    0
  ) {
    return {
      plan: generated,
      generated,
      names,
      problem: null,
      nameProblem: null,
    };
  }
  try {
    return {
      plan: planOwnerLeague(ownerOptions(draft, names)),
      generated,
      names,
      problem: null,
      nameProblem: null,
    };
  } catch (error) {
    return {
      plan: generated,
      generated,
      names,
      problem: null,
      nameProblem: clean(
        error instanceof Error ? error.message : "Check the names.",
      ),
    };
  }
}

// --- Validation ------------------------------------------------------------------------------------

export type DraftIssues = {
  basics: RuleIssue[];
  rules: RuleIssue[];
  franchises: RuleIssue[];
  review: RuleIssue[];
};

/** "Your franchise", "Franchise 2", or "Franchise 2 · Player 1" with several players. */
export function franchiseLabel(draft: Draft, index: number): string {
  if (draft.localPlayers === 1 && draft.franchises.length === 1) {
    return "Your franchise";
  }
  const base = `Franchise ${index + 1}`;
  const slot = draft.franchises[index]?.localPlayerSlot ?? 1;
  return draft.localPlayers > 1 ? `${base} · Player ${slot}` : base;
}

/** Everything wrong with the draft, split by the step that fixes it. */
export function draftIssues(
  draft: Draft,
  preview: Preview = previewLeague(draft),
): DraftIssues {
  const structure = structureOf(draft.shape);
  const basics: RuleIssue[] = [];
  const name = LeagueNameSchema.safeParse(draft.name);
  if (!name.success) {
    basics.push({
      code: "name",
      message: name.error.issues[0]?.message ?? "Give your league a name.",
    });
  }
  basics.push(...validateSupportedStructure(structure));

  const rules = [
    ...validatePlayoffConfig(structure, draft.playoffs),
    ...validateLocalPlayers(
      Array.from({ length: draft.localPlayers }, (_, i) => ({
        slot: i + 1,
        label: null,
      })),
    ),
  ];

  const franchises: RuleIssue[] = [];
  const seen = new Map<string, number>();
  draft.franchises.forEach((f, i) => {
    const who = franchiseLabel(draft, i);
    const nickname = f.nickname.trim();
    if (nickname.length > 40) {
      franchises.push({
        code: "nickname",
        message: `${who}: use at most 40 characters for the team name.`,
      });
    } else if (nickname) {
      const key = nameKey(nickname);
      if (seen.has(key)) {
        franchises.push({
          code: "duplicate_nickname",
          message: `${who}: another franchise is already called ${nickname}.`,
        });
      }
      seen.set(key, i);
    }
    if (f.primaryColor && contrastRatio(f.primaryColor, "#ffffff") < 4.5) {
      franchises.push({
        code: "primary_contrast",
        message: `${who}: choose a darker primary colour so the team name stays readable.`,
      });
    }
    const team = preview.generated?.teams.find((t) => t.cityId === f.cityId);
    const primary = f.primaryColor ?? team?.primaryColor;
    const secondary = f.secondaryColor ?? team?.secondaryColor;
    if (primary && primary === secondary) {
      franchises.push({
        code: "same_colors",
        message: `${who}: pick two different colours.`,
      });
    }
  });
  if (franchises.length === 0 && preview.problem) {
    franchises.push({ code: "plan", message: preview.problem });
  }

  const review: RuleIssue[] = preview.nameProblem
    ? [{ code: "names", message: preview.nameProblem }]
    : [];
  return { basics, rules, franchises, review };
}

/** The stored config this draft would produce (what leagues.config holds). */
export function draftToConfig(draft: Draft): LeagueConfig {
  return {
    schemaVersion: LEAGUE_CONFIG_SCHEMA_VERSION,
    preset: draft.preset,
    region: draft.region,
    fantasyDraft: draft.fantasyDraft,
    playoffs: draft.playoffs,
  };
}

/** "Round 1", "Quarterfinals", "Semifinals", "Finals", counted from the end. */
export function roundName(index: number, rounds: number): string {
  const fromEnd = rounds - 1 - index;
  if (fromEnd === 0) return "Finals";
  if (fromEnd === 1) return "Semifinals";
  if (fromEnd === 2) return "Quarterfinals";
  return `Round ${index + 1}`;
}

export function describeShape(shape: EqualShape): string {
  const c = shape.conferences;
  const d = shape.divisionsPerConference;
  return `${c} ${c === 1 ? "conference" : "conferences"} · ${d} ${d === 1 ? "division" : "divisions"} each · ${shape.teamsPerDivision} teams per division`;
}

/**
 * The create-league request for this draft. The identity seed fixes the
 * generated franchises; the server picks the roster seed itself.
 */
export function draftToRequest(
  draft: Draft,
  preview: Preview = previewLeague(draft),
): CreateLeagueRequest {
  return {
    name: draft.name.trim(),
    setup: {
      config: draftToConfig(draft),
      shape: draft.shape,
      localPlayers: Array.from({ length: draft.localPlayers }, (_, i) => ({
        slot: i + 1,
        label: null,
      })),
      franchises: draft.franchises.map((f) => ({
        localPlayerSlot: f.localPlayerSlot,
        cityId: f.cityId,
        ...(f.nickname.trim() ? { nickname: f.nickname.trim() } : {}),
        ...(f.primaryColor ? { primaryColor: f.primaryColor } : {}),
        ...(f.secondaryColor ? { secondaryColor: f.secondaryColor } : {}),
        ...(f.logoId ? { logoId: f.logoId } : {}),
        aiAssist: { ...f.aiAssist },
      })),
      identitySeed: draft.identitySeed,
      names: preview.names,
    },
  };
}

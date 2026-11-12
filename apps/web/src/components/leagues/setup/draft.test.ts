import { describe, expect, it } from "vitest";
import {
  COMPACT_SHAPE,
  draftIssues,
  draftReducer,
  draftToConfig,
  draftToRequest,
  franchiseLabel,
  initialDraft,
  previewLeague,
  roundName,
  teamCount,
  type Draft,
  type DraftAction,
} from "./draft";

const SEED = "seed-for-tests-1";
const named = (): Draft => ({ ...initialDraft(SEED), name: "Harbor League" });
const codes = (issues: { code: string }[]) => issues.map((i) => i.code);
const apply = (draft: Draft, ...actions: DraftAction[]) =>
  actions.reduce(draftReducer, draft);
const allIssues = (d: Draft) => {
  const i = draftIssues(d);
  return [...i.basics, ...i.rules, ...i.franchises, ...i.review];
};

describe("league setup draft", () => {
  it("starts as a valid standard league once it has a name", () => {
    const draft = initialDraft(SEED);
    expect(teamCount(draft.shape)).toBe(30);
    expect(draft.playoffs.teams).toBe(16);
    expect(codes(draftIssues(draft).basics)).toEqual(["name"]);
    expect(allIssues(named())).toEqual([]);
  });

  it("rejects blank and over-long names", () => {
    expect(codes(draftIssues({ ...named(), name: "   " }).basics)).toContain(
      "name",
    );
    expect(
      codes(draftIssues({ ...named(), name: "x".repeat(41) }).basics),
    ).toContain("name");
  });

  it("switches to the compact layout when leaving standard, and back", () => {
    const custom = apply(named(), { type: "preset", value: "custom" });
    expect(custom.shape).toEqual(COMPACT_SHAPE);
    expect(custom.playoffs.teams).toBe(4);
    expect(allIssues(custom)).toEqual([]);
    const back = apply(custom, { type: "preset", value: "standard" });
    expect(teamCount(back.shape)).toBe(30);
    expect(back.playoffs.teams).toBe(4); // a valid choice is kept
  });

  it("keeps a custom shape when the preset is chosen again", () => {
    const draft = apply(
      named(),
      { type: "preset", value: "custom" },
      { type: "teamCount", value: 24 },
    );
    expect(apply(draft, { type: "preset", value: "custom" }).shape).toEqual(
      draft.shape,
    );
  });

  it("picks a two-conference shape for a team count when one exists", () => {
    let draft = apply(
      named(),
      { type: "preset", value: "custom" },
      { type: "teamCount", value: 24 },
    );
    expect(draft.shape.conferences).toBe(2);
    expect(teamCount(draft.shape)).toBe(24);
    draft = apply(draft, { type: "teamCount", value: 9 });
    expect(teamCount(draft.shape)).toBe(9);
    const same = apply(draft, { type: "teamCount", value: 29 });
    expect(same.shape).toEqual(draft.shape);
  });

  it("keeps the playoff config valid as the structure changes", () => {
    let draft = apply(named(), { type: "preset", value: "custom" });
    for (const n of [8, 32, 12, 20, 16]) {
      draft = apply(draft, { type: "teamCount", value: n });
      expect(draftIssues(draft).rules.map((i) => i.code)).not.toContain(
        "playoff_teams_power",
      );
      expect(draft.playoffs.teams).toBeLessThanOrEqual(n);
    }
  });

  it("edits series lengths by round and for all rounds", () => {
    let draft = apply(
      named(),
      { type: "round", index: 0, value: 3 },
      { type: "round", index: 1, value: 5 },
    );
    expect(draft.playoffs.roundSeriesLengths).toEqual([3, 5, 7, 7]);
    draft = apply(draft, { type: "allRounds", value: 5 });
    expect(draft.playoffs.roundSeriesLengths).toEqual([5, 5, 5, 5]);
    expect(draftIssues(draft).rules).toEqual([]);
  });

  it("follows the number of rounds when playoff teams change", () => {
    let draft = apply(
      named(),
      { type: "round", index: 0, value: 3 },
      { type: "playoffs", patch: { teams: 4 } },
    );
    expect(draft.playoffs.roundSeriesLengths).toEqual([3, 7]);
    draft = apply(draft, { type: "playoffs", patch: { teams: 8 } });
    expect(draft.playoffs.roundSeriesLengths).toEqual([3, 7, 7]);
  });

  it("falls back to league seeding when conferences can't split the bracket", () => {
    const draft = apply(
      named(),
      { type: "preset", value: "custom" },
      {
        type: "shape",
        value: {
          conferences: 3,
          divisionsPerConference: 2,
          teamsPerDivision: 3,
        },
      },
    );
    expect(draft.playoffs.seeding).toBe("league");
  });

  it("reports division leaders that don't fit the playoff spots", () => {
    let draft = apply(
      named(),
      { type: "preset", value: "custom" },
      {
        type: "shape",
        value: {
          conferences: 2,
          divisionsPerConference: 4,
          teamsPerDivision: 2,
        },
      },
      { type: "playoffs", patch: { teams: 4 } },
    );
    expect(codes(draftIssues(draft).rules)).toContain(
      "division_leaders_exceed_spots",
    );
    draft = apply(draft, {
      type: "playoffs",
      patch: { autoQualifyDivisionLeaders: false },
    });
    expect(draftIssues(draft).rules).toEqual([]);
  });

  it("produces the stored config", () => {
    const draft = apply(
      named(),
      { type: "region", value: "europe" },
      { type: "fantasyDraft", value: true },
    );
    expect(draftToConfig(draft)).toEqual({
      schemaVersion: 1,
      preset: "standard",
      region: "europe",
      fantasyDraft: true,
      playoffs: draft.playoffs,
    });
  });

  it("names rounds from the end", () => {
    expect([0, 1, 2, 3].map((i) => roundName(i, 4))).toEqual([
      "Round 1",
      "Quarterfinals",
      "Semifinals",
      "Finals",
    ]);
    expect(roundName(0, 2)).toBe("Semifinals");
  });
});

describe("local players and franchises", () => {
  it("starts with one franchise in a city from the region", () => {
    const draft = named();
    expect(draft.franchises).toHaveLength(1);
    expect(draft.franchises[0]?.cityId).toMatch(/^na-/);
    expect(draft.franchises[0]).toMatchObject({
      nickname: "",
      primaryColor: null,
      secondaryColor: null,
      logoId: null,
    });
  });

  it("gives every local player a franchise in a different city", () => {
    const draft = apply(named(), { type: "localPlayers", value: 3 });
    expect(draft.franchises.map((f) => f.localPlayerSlot)).toEqual([1, 2, 3]);
    expect(new Set(draft.franchises.map((f) => f.cityId)).size).toBe(3);
    const fewer = apply(draft, { type: "localPlayers", value: 1 });
    expect(fewer.franchises).toHaveLength(1);
    expect(fewer.franchises[0]?.localPlayerSlot).toBe(1);
  });

  it("limits local players to the league and the maximum", () => {
    let draft = apply(named(), { type: "localPlayers", value: 20 });
    expect(draft.localPlayers).toBe(8);
    draft = apply(draft, { type: "localPlayers", value: 0 });
    expect(draft.localPlayers).toBe(1);
    draft = apply(
      draft,
      { type: "localPlayers", value: 8 },
      { type: "preset", value: "custom" },
      { type: "teamCount", value: 8 },
    );
    expect(draft.localPlayers).toBeLessThanOrEqual(8);
  });

  it("lets one player run several franchises", () => {
    let draft = apply(
      named(),
      { type: "localPlayers", value: 2 },
      { type: "addFranchise" },
      { type: "addFranchise" },
    );
    expect(draft.franchises).toHaveLength(4);
    // New franchises start with Player 1; hand one to Player 2.
    const added = draft.franchises[3];
    draft = apply(draft, {
      type: "franchise",
      key: added?.key ?? 0,
      patch: { localPlayerSlot: 2 },
    });
    const bySlot = (n: number) =>
      draft.franchises.filter((f) => f.localPlayerSlot === n).length;
    expect([bySlot(1), bySlot(2)]).toEqual([2, 2]);
    expect(new Set(draft.franchises.map((f) => f.cityId)).size).toBe(4);
    expect(allIssues(draft)).toEqual([]);
  });

  it("never removes a player's only franchise", () => {
    let draft = apply(named(), { type: "localPlayers", value: 2 });
    const [only1, only2] = draft.franchises;
    expect(
      apply(draft, { type: "removeFranchise", key: only1?.key ?? 0 }),
    ).toBe(draft);
    draft = apply(draft, { type: "addFranchise" });
    const extra = draft.franchises[2];
    draft = apply(draft, { type: "removeFranchise", key: extra?.key ?? 0 });
    expect(draft.franchises.map((f) => f.key)).toEqual([
      only1?.key,
      only2?.key,
    ]);
  });

  it("stops adding franchises when every team is a franchise", () => {
    let draft = apply(
      named(),
      { type: "preset", value: "custom" },
      { type: "teamCount", value: 8 },
    );
    for (let i = 0; i < 12; i++) draft = apply(draft, { type: "addFranchise" });
    expect(draft.franchises).toHaveLength(8);
    expect(new Set(draft.franchises.map((f) => f.cityId)).size).toBe(8);
  });

  it("drops extra franchises when the league shrinks, keeping each player's first", () => {
    let draft = named();
    for (let i = 0; i < 10; i++) draft = apply(draft, { type: "addFranchise" });
    draft = apply(
      draft,
      { type: "preset", value: "custom" },
      { type: "teamCount", value: 8 },
    );
    expect(draft.franchises.length).toBeLessThanOrEqual(8);
    expect(draft.franchises[0]?.localPlayerSlot).toBe(1);
  });

  it("refuses a city another franchise has, or from another region", () => {
    const draft = apply(named(), { type: "localPlayers", value: 2 });
    const [a, b] = draft.franchises;
    expect(
      apply(draft, {
        type: "franchise",
        key: b?.key ?? 0,
        patch: { cityId: a?.cityId ?? "" },
      }),
    ).toBe(draft);
    expect(
      apply(draft, {
        type: "franchise",
        key: b?.key ?? 0,
        patch: { cityId: "eu-fr-paris" },
      }),
    ).toBe(draft);
    expect(
      apply(draft, {
        type: "franchise",
        key: b?.key ?? 0,
        patch: { cityId: "na-ca-vancouver" },
      }).franchises[1]?.cityId,
    ).toBe("na-ca-vancouver");
  });

  it("starts every franchise's city again when the region changes", () => {
    const draft = apply(
      named(),
      { type: "localPlayers", value: 2 },
      { type: "region", value: "europe" },
    );
    expect(draft.franchises.every((f) => f.cityId.startsWith("eu-"))).toBe(
      true,
    );
    expect(new Set(draft.franchises.map((f) => f.cityId)).size).toBe(2);
  });

  it("keeps a franchise's name, colours, logo and AI Assist across a region change", () => {
    const key = named().franchises[0]?.key ?? 0;
    const draft = apply(
      named(),
      {
        type: "franchise",
        key,
        patch: {
          nickname: "Orcas",
          primaryColor: "#112233",
          logoId: "logo-07",
        },
      },
      { type: "aiAssist", key, flag: "scouting", value: true },
      { type: "region", value: "asia" },
    );
    expect(draft.franchises[0]).toMatchObject({
      nickname: "Orcas",
      primaryColor: "#112233",
      logoId: "logo-07",
    });
    expect(draft.franchises[0]?.aiAssist.scouting).toBe(true);
  });

  it("labels franchises", () => {
    const one = named();
    expect(franchiseLabel(one, 0)).toBe("Your franchise");
    const many = apply(one, { type: "localPlayers", value: 2 });
    expect(franchiseLabel(many, 1)).toBe("Franchise 2 · Player 2");
    const several = apply(one, { type: "addFranchise" });
    expect(franchiseLabel(several, 1)).toBe("Franchise 2");
  });
});

describe("franchise identity", () => {
  const withFranchise = (patch: object) => {
    const d = named();
    return apply(d, {
      type: "franchise",
      key: d.franchises[0]?.key ?? 0,
      patch,
    });
  };

  it("generates a name, colours and logo until the owner chooses", () => {
    const preview = previewLeague(named());
    const mine = preview.plan?.teams.find((t) => t.localPlayerSlot === 1);
    expect(mine?.nickname).toBeTruthy();
    expect(mine?.logoId).toMatch(/^logo-\d\d$/);
    expect(mine?.primaryColor).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("applies the owner's choices to their franchise only", () => {
    const draft = withFranchise({
      nickname: "Orcas",
      primaryColor: "#112233",
      secondaryColor: "#ffcc00",
      logoId: "logo-07",
    });
    const preview = previewLeague(draft);
    expect(
      preview.plan?.teams.find((t) => t.localPlayerSlot === 1),
    ).toMatchObject({
      nickname: "Orcas",
      primaryColor: "#112233",
      secondaryColor: "#ffcc00",
      logoId: "logo-07",
    });
    expect(
      preview.plan?.teams.filter((t) => t.localPlayerSlot === null),
    ).toHaveLength(29);
  });

  it("reports duplicate names, pale primary colours and identical colours", () => {
    let draft = apply(named(), { type: "localPlayers", value: 2 });
    const [a, b] = draft.franchises;
    draft = apply(
      draft,
      { type: "franchise", key: a?.key ?? 0, patch: { nickname: "Comets" } },
      { type: "franchise", key: b?.key ?? 0, patch: { nickname: " comets " } },
    );
    expect(codes(draftIssues(draft).franchises)).toContain(
      "duplicate_nickname",
    );

    const pale = withFranchise({ primaryColor: "#ffff00" });
    expect(codes(draftIssues(pale).franchises)).toContain("primary_contrast");

    const same = withFranchise({
      primaryColor: "#112233",
      secondaryColor: "#112233",
    });
    expect(codes(draftIssues(same).franchises)).toContain("same_colors");
    expect(
      codes(
        draftIssues(withFranchise({ nickname: "x".repeat(41) })).franchises,
      ),
    ).toContain("nickname");
  });

  it("goes back to generated with a reset", () => {
    const key = named().franchises[0]?.key ?? 0;
    const draft = apply(
      withFranchise({
        nickname: "Orcas",
        primaryColor: "#112233",
        logoId: "logo-07",
      }),
      { type: "resetFranchise", key },
    );
    expect(draft.franchises[0]).toMatchObject({
      nickname: "",
      primaryColor: null,
      secondaryColor: null,
      logoId: null,
    });
  });

  it("keeps AI Assist off by default and switches it per franchise", () => {
    let draft = apply(named(), { type: "localPlayers", value: 2 });
    const [a, b] = draft.franchises;
    expect(Object.values(a?.aiAssist ?? {}).every((v) => v === false)).toBe(
      true,
    );
    expect(Object.keys(a?.aiAssist ?? {})).toHaveLength(5);
    draft = apply(
      draft,
      { type: "aiAssist", key: b?.key ?? 0, flag: "scouting", value: true },
      { type: "aiAssist", key: b?.key ?? 0, flag: "drafting", value: true },
    );
    expect(draft.franchises[0]?.aiAssist.scouting).toBe(false);
    expect(draft.franchises[1]?.aiAssist).toMatchObject({
      scouting: true,
      drafting: true,
      trades: false,
    });
  });
});

describe("league preview", () => {
  it("is the same league on every call for the same draft", () => {
    expect(previewLeague(named())).toEqual(previewLeague(named()));
  });

  it("plans every team with a real city in a conference and division", () => {
    const { plan } = previewLeague(named());
    expect(plan?.teams).toHaveLength(30);
    expect(plan?.structure.conferences).toHaveLength(2);
    expect(new Set(plan?.teams.map((t) => t.cityId)).size).toBe(30);
  });

  it("shuffles the other teams but keeps the owner's choices", () => {
    const key = named().franchises[0]?.key ?? 0;
    const draft = apply(named(), {
      type: "franchise",
      key,
      patch: { nickname: "Orcas", logoId: "logo-07" },
    });
    const shuffled = apply(draft, { type: "shuffle", seed: "another-seed-2" });
    const a = previewLeague(draft).plan?.teams ?? [];
    const b = previewLeague(shuffled).plan?.teams ?? [];
    expect(b.map((t) => t.nickname)).not.toEqual(a.map((t) => t.nickname));
    for (const teams of [a, b]) {
      expect(teams.find((t) => t.localPlayerSlot === 1)).toMatchObject({
        nickname: "Orcas",
        logoId: "logo-07",
      });
    }
  });

  it("renames conferences and divisions, keeping their ids", () => {
    const base = previewLeague(named());
    const conference = base.generated?.structure.conferences[0];
    const division = conference?.divisions[0];
    const draft = apply(
      named(),
      {
        type: "rename",
        kind: "conference",
        id: conference?.id ?? "",
        name: "  Harbor League ",
      },
      {
        type: "rename",
        kind: "division",
        id: division?.id ?? "",
        name: "Lighthouse",
      },
    );
    const preview = previewLeague(draft);
    expect(preview.nameProblem).toBeNull();
    expect(preview.plan?.structure.conferences[0]).toMatchObject({
      id: conference?.id,
      name: "Harbor League",
    });
    expect(preview.plan?.structure.conferences[0]?.divisions[0]?.name).toBe(
      "Lighthouse",
    );
    expect(preview.names.conferences).toEqual({
      [conference?.id ?? ""]: "Harbor League",
    });
    expect(draftToRequest(draft).setup?.names).toEqual(preview.names);
    expect(allIssues(draft)).toEqual([]);
  });

  it("ignores blank names and names equal to the generated one", () => {
    const base = previewLeague(named());
    const conference = base.generated?.structure.conferences[0];
    const draft = apply(
      named(),
      {
        type: "rename",
        kind: "conference",
        id: conference?.id ?? "",
        name: "   ",
      },
      {
        type: "rename",
        kind: "conference",
        id: base.generated?.structure.conferences[1]?.id ?? "",
        name: base.generated?.structure.conferences[1]?.name ?? "",
      },
    );
    expect(previewLeague(draft).names).toEqual({
      conferences: {},
      divisions: {},
    });
  });

  it("flags two conferences with the same name", () => {
    const base = previewLeague(named()).generated?.structure.conferences ?? [];
    const draft = apply(
      named(),
      {
        type: "rename",
        kind: "conference",
        id: base[0]?.id ?? "",
        name: "Twin",
      },
      {
        type: "rename",
        kind: "conference",
        id: base[1]?.id ?? "",
        name: "TWIN",
      },
    );
    expect(previewLeague(draft).nameProblem).toMatch(/both called/);
    expect(codes(draftIssues(draft).review)).toEqual(["names"]);
    // The preview falls back to generated names rather than disappearing.
    expect(previewLeague(draft).plan).not.toBeNull();
  });

  it("drops names typed for conferences that no longer exist", () => {
    const base = previewLeague(named()).generated?.structure.conferences[0];
    let draft = apply(named(), {
      type: "rename",
      kind: "conference",
      id: base?.id ?? "",
      name: "Old",
    });
    draft = apply(draft, { type: "shuffle", seed: "yet-another-seed" });
    expect(previewLeague(draft).names).toEqual({
      conferences: {},
      divisions: {},
    });
    draft = apply(draft, {
      type: "rename",
      kind: "conference",
      id: "gone-forever",
      name: "X",
    });
    expect(previewLeague(draft).nameProblem).toBeNull();
    expect(previewLeague(draft).names.conferences).toEqual({});
  });

  it("puts the identity seed, franchises and AI Assist in the request", () => {
    const d = named();
    const key = d.franchises[0]?.key ?? 0;
    const draft = apply(
      d,
      { type: "localPlayers", value: 2 },
      {
        type: "franchise",
        key,
        patch: { nickname: "Orcas", logoId: "logo-07" },
      },
      { type: "aiAssist", key, flag: "rosterCoverage", value: true },
    );
    const request = draftToRequest(draft);
    expect(request.name).toBe("Harbor League");
    expect(request.setup?.identitySeed).toBe(SEED);
    expect(request.setup?.franchises).toHaveLength(2);
    expect(request.setup?.franchises[0]).toMatchObject({
      localPlayerSlot: 1,
      nickname: "Orcas",
      logoId: "logo-07",
    });
    expect(request.setup?.franchises[0]?.aiAssist?.rosterCoverage).toBe(true);
    expect(request.setup?.franchises[1]).not.toHaveProperty("nickname");
    expect(request.setup?.franchises[1]?.aiAssist?.rosterCoverage).toBe(false);
    expect(request.setup?.localPlayers).toEqual([
      { slot: 1, label: null },
      { slot: 2, label: null },
    ]);
  });
});

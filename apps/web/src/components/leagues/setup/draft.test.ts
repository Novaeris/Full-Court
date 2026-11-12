import { describe, expect, it } from "vitest";
import {
  COMPACT_SHAPE,
  draftIssues,
  draftReducer,
  draftToConfig,
  initialDraft,
  roundName,
  teamCount,
  type Draft,
} from "./draft";

const named = (): Draft => ({ ...initialDraft(), name: "Harbor League" });
const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

describe("league setup draft", () => {
  it("starts as a valid standard league once it has a name", () => {
    const draft = initialDraft();
    expect(teamCount(draft.shape)).toBe(30);
    expect(draft.playoffs.teams).toBe(16);
    expect(codes(draftIssues(draft).basics)).toEqual(["name"]);
    expect(draftIssues(named())).toEqual({ basics: [], rules: [] });
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
    const custom = draftReducer(named(), { type: "preset", value: "custom" });
    expect(custom.shape).toEqual(COMPACT_SHAPE);
    expect(custom.playoffs.teams).toBe(4);
    expect(draftIssues(custom)).toEqual({ basics: [], rules: [] });
    const back = draftReducer(custom, { type: "preset", value: "standard" });
    expect(teamCount(back.shape)).toBe(30);
    expect(back.playoffs.teams).toBe(4); // a valid choice is kept
  });

  it("keeps a custom shape when the preset is chosen again", () => {
    let draft = draftReducer(named(), { type: "preset", value: "custom" });
    draft = draftReducer(draft, { type: "teamCount", value: 24 });
    expect(
      draftReducer(draft, { type: "preset", value: "custom" }).shape,
    ).toEqual(draft.shape);
  });

  it("picks a two-conference shape for a team count when one exists", () => {
    let draft = draftReducer(named(), { type: "preset", value: "custom" });
    draft = draftReducer(draft, { type: "teamCount", value: 24 });
    expect(draft.shape.conferences).toBe(2);
    expect(teamCount(draft.shape)).toBe(24);
    // 9 has no two-conference layout; falls back to what exists.
    draft = draftReducer(draft, { type: "teamCount", value: 9 });
    expect(teamCount(draft.shape)).toBe(9);
    // 29 has no supported layout: the draft is left unchanged.
    const same = draftReducer(draft, { type: "teamCount", value: 29 });
    expect(same.shape).toEqual(draft.shape);
  });

  it("keeps the playoff config valid as the structure changes", () => {
    let draft = draftReducer(named(), { type: "preset", value: "custom" });
    for (const n of [8, 32, 12, 20, 16]) {
      draft = draftReducer(draft, { type: "teamCount", value: n });
      expect(draftIssues(draft).rules.map((i) => i.code)).not.toContain(
        "playoff_teams_power",
      );
      expect(draft.playoffs.teams).toBeLessThanOrEqual(n);
    }
  });

  it("edits series lengths by round and for all rounds", () => {
    let draft = named();
    draft = draftReducer(draft, { type: "round", index: 0, value: 3 });
    draft = draftReducer(draft, { type: "round", index: 1, value: 5 });
    expect(draft.playoffs.roundSeriesLengths).toEqual([3, 5, 7, 7]);
    draft = draftReducer(draft, { type: "allRounds", value: 5 });
    expect(draft.playoffs.roundSeriesLengths).toEqual([5, 5, 5, 5]);
    expect(draftIssues(draft).rules).toEqual([]);
  });

  it("follows the number of rounds when playoff teams change", () => {
    let draft = draftReducer(named(), { type: "round", index: 0, value: 3 });
    draft = draftReducer(draft, { type: "playoffs", patch: { teams: 4 } });
    expect(draft.playoffs.roundSeriesLengths).toEqual([3, 7]);
    draft = draftReducer(draft, { type: "playoffs", patch: { teams: 8 } });
    expect(draft.playoffs.roundSeriesLengths).toEqual([3, 7, 7]);
  });

  it("falls back to league seeding when conferences can't split the bracket", () => {
    let draft = draftReducer(named(), { type: "preset", value: "custom" });
    draft = draftReducer(draft, {
      type: "shape",
      value: { conferences: 3, divisionsPerConference: 2, teamsPerDivision: 3 },
    });
    expect(draft.playoffs.seeding).toBe("league");
  });

  it("reports division leaders that don't fit the playoff spots", () => {
    let draft = draftReducer(named(), { type: "preset", value: "custom" });
    draft = draftReducer(draft, {
      type: "shape",
      value: { conferences: 2, divisionsPerConference: 4, teamsPerDivision: 2 },
    });
    draft = draftReducer(draft, { type: "playoffs", patch: { teams: 4 } });
    expect(codes(draftIssues(draft).rules)).toContain(
      "division_leaders_exceed_spots",
    );
    // Turning automatic qualification off is the fix the form offers.
    draft = draftReducer(draft, {
      type: "playoffs",
      patch: { autoQualifyDivisionLeaders: false },
    });
    expect(draftIssues(draft).rules).toEqual([]);
  });

  it("limits local players to the league and the maximum", () => {
    let draft = draftReducer(named(), { type: "localPlayers", value: 20 });
    expect(draft.localPlayers).toBe(8);
    draft = draftReducer(draft, { type: "localPlayers", value: 0 });
    expect(draft.localPlayers).toBe(1);
    // Shrinking the league can't leave more players than teams.
    draft = draftReducer(draft, { type: "localPlayers", value: 8 });
    draft = draftReducer(draft, { type: "preset", value: "custom" });
    draft = draftReducer(draft, { type: "teamCount", value: 8 });
    expect(draft.localPlayers).toBeLessThanOrEqual(8);
  });

  it("produces the stored config", () => {
    const draft = draftReducer(
      draftReducer(named(), { type: "region", value: "europe" }),
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

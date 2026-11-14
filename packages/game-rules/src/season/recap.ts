/**
 * A short written recap of a finished game (docs/DESIGN.md, "Game recaps"),
 * from the score and the box score alone, so the same game always reads the
 * same. Pure.
 */

export type RecapPlayer = {
  playerId: string;
  name: string;
  teamId: string;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  /** Three-pointers made. */
  threes: number;
};

export type RecapInput = {
  home: { id: string; name: string };
  away: { id: string; name: string };
  homeScore: number;
  awayScore: number;
  overtimes: number;
  lines: readonly RecapPlayer[];
};

export type Recap = {
  /** "Boston edged Denver 101-99 in overtime." */
  headline: string;
  /** A few things worth saying, most striking first. */
  notes: string[];
};

/** The most notes a recap gives. */
export const RECAP_NOTES = 4;

const VERBS: readonly { upTo: number; verb: string }[] = [
  { upTo: 3, verb: "edged" },
  { upTo: 9, verb: "beat" },
  { upTo: 19, verb: "defeated" },
  { upTo: Infinity, verb: "routed" },
];

function overtimeWords(n: number): string {
  if (n <= 0) return "";
  if (n === 1) return " in overtime";
  if (n === 2) return " in double overtime";
  if (n === 3) return " in triple overtime";
  return ` in ${n} overtimes`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The player with the most points on a team; ties to more rebounds plus assists, then the smaller id. */
function topScorer(
  lines: readonly RecapPlayer[],
  teamId: string,
): RecapPlayer | null {
  let best: RecapPlayer | null = null;
  for (const l of lines) {
    if (l.teamId !== teamId) continue;
    if (
      !best ||
      l.points > best.points ||
      (l.points === best.points &&
        (l.rebounds + l.assists > best.rebounds + best.assists ||
          (l.rebounds + l.assists === best.rebounds + best.assists &&
            l.playerId < best.playerId)))
    ) {
      best = l;
    }
  }
  return best;
}

/** A player's standout line in words, or null when it has nothing to say. */
function standout(p: RecapPlayer): { rank: number; text: string } | null {
  const tens = [
    p.points >= 10 ? `${p.points} points` : null,
    p.rebounds >= 10 ? `${p.rebounds} rebounds` : null,
    p.assists >= 10 ? `${p.assists} assists` : null,
    p.steals >= 10 ? `${p.steals} steals` : null,
    p.blocks >= 10 ? `${p.blocks} blocks` : null,
  ].filter((x): x is string => x !== null);
  const list = (items: string[]) =>
    items.length <= 2
      ? items.join(" and ")
      : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
  if (tens.length >= 3) {
    return { rank: 0, text: `${p.name} had a triple-double: ${list(tens)}` };
  }
  if (p.points >= 40) {
    return { rank: 1, text: `${p.name} scored ${p.points} points` };
  }
  if (tens.length === 2) {
    return { rank: 2, text: `${p.name} had a double-double: ${list(tens)}` };
  }
  if (p.steals >= 5) {
    return { rank: 3, text: `${p.name} had ${plural(p.steals, "steal")}` };
  }
  if (p.blocks >= 5) {
    return { rank: 3, text: `${p.name} had ${plural(p.blocks, "block")}` };
  }
  if (p.threes >= 6) {
    return { rank: 3, text: `${p.name} made ${p.threes} three-pointers` };
  }
  return null;
}

export function gameRecap(input: RecapInput): Recap {
  const { home, away, homeScore, awayScore } = input;
  // Overtime games have a winner too; a tie can't happen in this game.
  const homeWon = homeScore >= awayScore;
  const [winner, loser] = homeWon ? [home, away] : [away, home];
  const [high, low] = homeWon ? [homeScore, awayScore] : [awayScore, homeScore];
  const margin = high - low;
  const verb = (VERBS.find((v) => margin <= v.upTo) ?? VERBS[0]!).verb;
  const headline = `${winner.name} ${verb} ${loser.name} ${high}-${low}${overtimeWords(input.overtimes)}.`;

  const notes: string[] = [];
  for (const team of [winner, loser]) {
    const top = topScorer(input.lines, team.id);
    if (top && top.points > 0) {
      notes.push(
        `${top.name} led ${team.name} with ${plural(top.points, "point")}`,
      );
    }
  }

  // Standouts, most striking first (a triple-double before a 40-point game...).
  const found = input.lines
    .flatMap((p) => {
      const s = standout(p);
      return s ? [{ ...s, id: p.playerId }] : [];
    })
    .sort((a, b) => a.rank - b.rank || (a.id < b.id ? -1 : 1));
  for (const s of found) {
    if (notes.length >= RECAP_NOTES + 2) break;
    notes.push(s.text);
  }

  const total = high + low;
  if (input.overtimes === 0 && margin <= 3) {
    notes.push(`A close game, decided by ${plural(margin, "point")}`);
  } else if (margin >= 25) {
    notes.push(`A ${margin}-point blowout`);
  }
  if (total >= 230) {
    notes.push(`A high-scoring game: ${total} points between the teams`);
  } else if (total <= 170) {
    notes.push(`A defensive game: only ${total} points between the teams`);
  }

  // Each note is a sentence; keep the first few.
  return {
    headline,
    notes: notes.slice(0, RECAP_NOTES + 1).map((n) => `${n}.`),
  };
}

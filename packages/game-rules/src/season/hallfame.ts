/**
 * The Hall of Fame (docs/DESIGN.md, "The Hall of Fame"): a retired player is
 * inducted when his career in the league, scored by the rules below, is high
 * enough and enough time has passed since he retired. Everything is worked out
 * from the career records, by pure and repeatable rules, so the same league
 * always gives the same Hall.
 */

/** Seasons that must pass after a player retires before he can be inducted. */
export const WAIT_SEASONS = 3;

/** The career score that earns a place. */
export const INDUCTION_SCORE = 60;

/** One season of a career. */
export type CareerSeason = {
  games: number;
  /** Efficiency per game (see `efficiency` in awards.ts). */
  efficiency: number;
};

/** What a player won and was picked for, by award slug (`mvp`, `all-league-1`...). */
export type Honors = Readonly<Record<string, number>>;

export type Career = {
  seasons: readonly CareerSeason[];
  honors: Honors;
  allStars: number;
  /** Seasons in which he played enough games for the champion. */
  titles: number;
};

/** Efficiency per game that counts as nothing: an ordinary player. */
export const REPLACEMENT_EFFICIENCY = 10;

/** What each honour adds to a score. */
export const HONOR_POINTS: Readonly<Record<string, number>> = {
  mvp: 12,
  "finals-mvp": 6,
  "defensive-player": 6,
  "rookie-of-the-year": 2,
  "sixth-man": 3,
  "most-improved": 2,
  "scoring-title": 3,
  "rebounding-title": 3,
  "assists-title": 3,
  "steals-title": 3,
  "blocks-title": 3,
  "all-league-1": 6,
  "all-league-2": 4,
  "all-league-3": 2,
};

/** Added for each All-Star Game and each championship. */
export const ALL_STAR_POINTS = 2;
export const TITLE_POINTS = 3;

/** Games in a season the production counts against (a full one). */
const FULL_SEASON = 82;

/**
 * A career's worth: production above an ordinary player over every season
 * (more games count for more), plus points for each honour, All-Star Game and
 * championship.
 */
export function careerScore(career: Career): number {
  let score = 0;
  for (const s of career.seasons) {
    score +=
      (Math.max(0, s.efficiency - REPLACEMENT_EFFICIENCY) * s.games) /
      FULL_SEASON;
  }
  for (const [award, count] of Object.entries(career.honors)) {
    score += (HONOR_POINTS[award] ?? 0) * count;
  }
  score += ALL_STAR_POINTS * career.allStars;
  score += TITLE_POINTS * career.titles;
  return score;
}

/** The season in which a player who retired in `retiredYear` can first be inducted. */
export function inductionYear(retiredYear: number): number {
  return retiredYear + WAIT_SEASONS;
}

/** Whether a retired player is in the Hall as of `year`. */
export function isInducted(
  score: number,
  retiredYear: number,
  year: number,
): boolean {
  return score >= INDUCTION_SCORE && year >= inductionYear(retiredYear);
}

/**
 * Head-to-head records (docs/DESIGN.md, "Head to head"): a team's all-time
 * record against each opponent, from the league's finished games, and which
 * opponents have become rivals. Pure.
 */

/** Playoff games against one opponent that make them a rival (about one series). */
export const RIVALRY_PLAYOFF_GAMES = 6;

export type FinishedGame = {
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  playoff: boolean;
  year: number;
  day: number;
};

export type WinLoss = {
  wins: number;
  losses: number;
};

export type Meeting = {
  year: number;
  won: boolean;
  /** This team's score first. */
  score: string;
  playoff: boolean;
};

export type OpponentRecord = {
  opponentId: string;
  regular: WinLoss;
  playoffs: WinLoss;
  /** The latest meeting. */
  last: Meeting;
  rival: boolean;
};

/** Whether the playoff meetings between two teams make them rivals. */
export function isRivalry(playoffGames: number): boolean {
  return playoffGames >= RIVALRY_PLAYOFF_GAMES;
}

/**
 * One team's record against every opponent it has met, most meetings first
 * (ties by opponent id, so the order is fixed).
 */
export function headToHead(
  games: readonly FinishedGame[],
  teamId: string,
): OpponentRecord[] {
  const out = new Map<
    string,
    OpponentRecord & { at: [number, number]; total: number }
  >();
  for (const g of games) {
    if (g.home !== teamId && g.away !== teamId) continue;
    if (g.homeScore === g.awayScore) continue;
    const home = g.home === teamId;
    const opponentId = home ? g.away : g.home;
    const mine = home ? g.homeScore : g.awayScore;
    const theirs = home ? g.awayScore : g.homeScore;
    const won = mine > theirs;
    const entry =
      out.get(opponentId) ??
      ({
        opponentId,
        regular: { wins: 0, losses: 0 },
        playoffs: { wins: 0, losses: 0 },
        last: {
          year: g.year,
          won,
          score: `${mine}-${theirs}`,
          playoff: g.playoff,
        },
        rival: false,
        at: [-1, -1],
        total: 0,
      } as OpponentRecord & { at: [number, number]; total: number });
    const tally = g.playoff ? entry.playoffs : entry.regular;
    if (won) tally.wins += 1;
    else tally.losses += 1;
    entry.total += 1;
    // The latest game by season, then day.
    if (
      g.year > entry.at[0] ||
      (g.year === entry.at[0] && g.day >= entry.at[1])
    ) {
      entry.at = [g.year, g.day];
      entry.last = {
        year: g.year,
        won,
        score: `${mine}-${theirs}`,
        playoff: g.playoff,
      };
    }
    out.set(opponentId, entry);
  }
  return [...out.values()]
    .map(({ at: _at, total: _total, ...rest }) => ({
      ...rest,
      rival: isRivalry(rest.playoffs.wins + rest.playoffs.losses),
    }))
    .sort(
      (a, b) =>
        b.regular.wins +
          b.regular.losses +
          b.playoffs.wins +
          b.playoffs.losses -
          (a.regular.wins +
            a.regular.losses +
            a.playoffs.wins +
            a.playoffs.losses) || a.opponentId.localeCompare(b.opponentId),
    );
}

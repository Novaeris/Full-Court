/**
 * Which way a team is attacking. The home team attacks the right basket in
 * periods 1 and 2 and the left basket from period 3 on (overtime included);
 * the away team does the opposite. See `CourtPoint` in game-types.
 */
export function attacksRight(period: number, home: boolean): boolean {
  return period <= 2 ? home : !home;
}

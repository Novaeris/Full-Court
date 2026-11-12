/**
 * Who runs a team, in words: "Your team" when one person plays the league,
 * "Player 2" when several share it, and nothing for AI-run teams.
 */
export function controlLabel(
  slot: number | null,
  localPlayerCount: number,
): string {
  if (slot === null) return "";
  return localPlayerCount > 1 ? `Player ${slot}` : "Your team";
}

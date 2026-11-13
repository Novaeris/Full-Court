import type {
  BoxScore,
  PlayerGameLine,
  PlayEvent,
} from "@fullcourt/game-types";
import type { Lineups } from "./types";

type Line = PlayerGameLine & { seconds: number };

/**
 * Builds the box score from a game's plays alone. Because the plays are the
 * source of truth, the lines always add up to the score the viewer saw.
 *
 * `teamOf` maps every player who can appear to their team id. Minutes come
 * from the clock gaps between events while a player is on court, starting
 * from `starters` and following substitutions; time between periods does not
 * count. Only players who took the court get a line.
 */
export function buildBoxScore(
  gameId: string,
  plays: readonly PlayEvent[],
  starters: Lineups,
  teamOf: Readonly<Record<string, string>>,
): BoxScore {
  const lines = new Map<string, Line>();
  const line = (playerId: string): Line => {
    let l = lines.get(playerId);
    if (!l) {
      l = {
        gameId,
        playerId,
        teamId: teamOf[playerId] ?? "",
        started: false,
        minutes: 0,
        points: 0,
        rebounds: 0,
        assists: 0,
        steals: 0,
        blocks: 0,
        turnovers: 0,
        fouls: 0,
        fgm: 0,
        fga: 0,
        tpm: 0,
        tpa: 0,
        ftm: 0,
        fta: 0,
        seconds: 0,
      };
      lines.set(playerId, l);
    }
    return l;
  };

  const onCourt = new Set<string>([...starters.home, ...starters.away]);
  for (const id of onCourt) line(id).started = true;

  let previousClock = 0;
  for (const play of plays) {
    if (play.kind === "period-start") {
      previousClock = play.clock;
      continue;
    }
    const elapsed = Math.max(0, previousClock - play.clock);
    previousClock = play.clock;
    if (elapsed > 0) for (const id of onCourt) line(id).seconds += elapsed;

    const player = play.playerId === null ? null : line(play.playerId);
    switch (play.kind) {
      case "made-shot":
      case "missed-shot":
        if (player) {
          player.fga++;
          if (play.shotZone === "three") player.tpa++;
          if (play.kind === "made-shot") {
            player.fgm++;
            player.points += play.points;
            if (play.shotZone === "three") player.tpm++;
          }
        }
        if (play.assistPlayerId) line(play.assistPlayerId).assists++;
        if (play.blockPlayerId) line(play.blockPlayerId).blocks++;
        break;
      case "free-throw":
        if (player) {
          player.fta++;
          if (play.made) {
            player.ftm++;
            player.points += play.points;
          }
        }
        break;
      case "rebound":
        if (player) player.rebounds++;
        break;
      case "turnover":
        if (player) player.turnovers++;
        if (play.stealPlayerId) line(play.stealPlayerId).steals++;
        break;
      case "foul":
        if (player) player.fouls++;
        break;
      case "substitution":
        if (play.outPlayerId) onCourt.delete(play.outPlayerId);
        if (play.playerId) {
          onCourt.add(play.playerId);
          line(play.playerId);
        }
        break;
      default:
        break;
    }
  }

  const result: PlayerGameLine[] = [];
  for (const { seconds, ...rest } of lines.values()) {
    result.push({ ...rest, minutes: Math.round(seconds / 60) });
  }
  return { gameId, lines: result };
}

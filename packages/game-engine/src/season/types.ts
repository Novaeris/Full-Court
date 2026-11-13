import type {
  BoxScore,
  Game,
  PlayEvent,
  Position,
  Ratings,
  TeamStrategy,
} from "@fullcourt/game-types";

/** A player as the simulation sees them: only what decides a game. */
export type SimPlayer = {
  id: string;
  position: Position;
  overall: number;
  ratings: Ratings;
};

/** A team ready to play: its full roster and its coaching choices. */
export type SimTeam = {
  id: string;
  players: readonly SimPlayer[];
  strategy: TeamStrategy;
};

/** Who started a game, by player id. */
export type Lineups = { home: string[]; away: string[] };

export type SimulatedGame = {
  /** The input game, now `final`, with its scores and overtimes. */
  game: Game;
  plays: PlayEvent[];
  boxScore: BoxScore;
  starters: Lineups;
};

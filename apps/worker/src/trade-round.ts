import {
  createRng,
  proposeAiTrades,
  seedState,
  type AiTrade,
} from "@fullcourt/game-engine";
import { tradeDeadlineDay, type TradeAsset } from "@fullcourt/game-rules";

/** Computer teams look for trades on every fifth day until the deadline. */
export const TRADE_EVERY_DAYS = 5;

/** The most trades one round makes. */
export const TRADES_PER_ROUND = 2;

/** Whether a round of computer trades happens before this day. */
export function isTradeDay(day: number, lastDay: number): boolean {
  return (
    day > 0 && day % TRADE_EVERY_DAYS === 0 && day <= tradeDeadlineDay(lastDay)
  );
}

/** A team the computer runs, with its roster before the round. */
export type TradeTeam = {
  id: string;
  payroll: number;
  roster: TradeAsset[];
};

/** What a round needs from the database. */
export interface TradeStore {
  /** Teams the computer runs: not owned, or owned with AI Assist trades on. */
  loadTradeTeams(seasonId: string): Promise<TradeTeam[]>;
  applyTrade(seasonId: string, trade: AiTrade): Promise<void>;
}

/**
 * One round of trades between computer teams in the regular season. Seeded from
 * the league, the year and the day, so a requeued job proposes the same thing.
 * A trade the database refuses is skipped: trades never stop a job.
 */
export async function runTradeRound(
  store: TradeStore,
  season: {
    id: string;
    league_id: string;
    year: number;
    day: number;
    salary_cap: number;
  },
): Promise<number> {
  const teams = await store.loadTradeTeams(season.id);
  const trades = proposeAiTrades(
    createRng(
      seedState(
        `${season.league_id}:ai-trades:${season.year}:regular-season:${season.day}`,
      ),
    ),
    {
      teams,
      cap: season.salary_cap,
      inSeason: true,
      most: TRADES_PER_ROUND,
    },
  );
  let made = 0;
  for (const trade of trades) {
    try {
      await store.applyTrade(season.id, trade);
      made++;
    } catch {
      // The database holds the limits; a refused trade just doesn't happen.
    }
  }
  return made;
}

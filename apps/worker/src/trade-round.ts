import {
  createRng,
  proposeAiTrades,
  proposeOwnerOffers,
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
  /** Picks the team holds, valued. */
  picks?: { id: string; value: number }[];
};

/** An offer to store: a computer team to an owner team. */
export type StoredOffer = {
  team_id: string;
  partner_id: string;
  give: string[];
  get: string[];
  get_picks: string[];
};

/** The most offers one owner team has open at once. */
export const OFFERS_PER_TEAM = 2;

/** What a round needs from the database. */
export interface TradeStore {
  /** Teams the computer runs: not owned, or owned with AI Assist trades on. */
  loadTradeTeams(seasonId: string): Promise<TradeTeam[]>;
  applyTrade(seasonId: string, trade: AiTrade): Promise<void>;
  /** Owner teams that haven't handed trades to AI Assist, and the computer teams. */
  loadOfferTeams?:
    | ((
        seasonId: string,
      ) => Promise<{ owners: TradeTeam[]; computer: TradeTeam[] }>)
    | undefined;
  /** Expires the open offers and stores these. */
  replaceOffers?:
    ((seasonId: string, offers: StoredOffer[]) => Promise<void>) | undefined;
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
  if (store.loadOfferTeams && store.replaceOffers) {
    try {
      const { owners, computer } = await store.loadOfferTeams(season.id);
      const offers = owners.flatMap((owner) =>
        proposeOwnerOffers(
          createRng(
            seedState(
              `${season.league_id}:offers:${owner.id}:${season.year}:regular-season:${season.day}`,
            ),
          ),
          {
            owner,
            teams: computer,
            cap: season.salary_cap,
            inSeason: true,
            most: OFFERS_PER_TEAM,
          },
        ).map((o) => ({
          team_id: owner.id,
          partner_id: o.partnerId,
          give: o.give,
          get: o.get,
          get_picks: o.getPicks,
        })),
      );
      if (owners.length > 0) await store.replaceOffers(season.id, offers);
    } catch {
      // Offers are a courtesy; a failure here never stops the job.
    }
  }
  return made;
}

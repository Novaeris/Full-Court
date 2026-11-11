import "server-only";
import type { League } from "@fullcourt/validation";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ApiError } from "@/server/api/handler";
import { requireUserContext, type UserContext } from "@/server/auth/session";
import { getLeague } from "@/server/services/leagues";

/**
 * Loads a league for a page, once per request. Visitors are sent to sign in;
 * a league that doesn't exist (or belongs to someone else) is a 404.
 */
export const loadLeague = cache(
  async (leagueId: string): Promise<{ ctx: UserContext; league: League }> => {
    const ctx = await requireUserContext(`/leagues/${leagueId}`);
    try {
      return { ctx, league: await getLeague(ctx, leagueId) };
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) notFound();
      throw error;
    }
  },
);

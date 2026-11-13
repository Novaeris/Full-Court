import {
  SimJobSchema,
  SimulationStatusSchema,
  StartSimulationRequestSchema,
} from "@fullcourt/validation";
import { authenticate } from "@/server/api/auth";
import { apiRoute } from "@/server/api/handler";
import { trackEvent } from "@/server/analytics/track";
import {
  cancelSimulation,
  getSimulation,
  startSimulation,
} from "@/server/services/simulation";

const leagueId = (params: Record<string, string | string[] | undefined>) =>
  String(params.leagueId ?? "");

/** GET /api/v1/leagues/:leagueId/sim: the season and the latest simulation job. */
export const GET = apiRoute({
  response: SimulationStatusSchema,
  handler: async ({ request, params }) =>
    getSimulation(await authenticate(request), leagueId(params)),
});

/**
 * POST /api/v1/leagues/:leagueId/sim: queue a day, a week or the rest of the
 * regular season. The first call also creates the league's first season.
 */
export const POST = apiRoute({
  body: StartSimulationRequestSchema,
  response: SimJobSchema,
  handler: async ({ request, params, body }) => {
    const job = await startSimulation(
      await authenticate(request),
      leagueId(params),
      body,
    );
    await trackEvent("simulation_started");
    return job;
  },
});

/** DELETE /api/v1/leagues/:leagueId/sim: cancel the queued or running simulation. */
export const DELETE = apiRoute({
  response: SimJobSchema,
  handler: async ({ request, params }) =>
    cancelSimulation(await authenticate(request), leagueId(params)),
});

import { createApiClient } from "@fullcourt/api-client";
import { expect, test } from "@playwright/test";
import { accessToken, createConfirmedUser } from "./support/auth";

/**
 * The simulation API (/api/v1/leagues/:id/sim). No worker runs in these tests,
 * so jobs stay queued: this covers creating the first season, queueing,
 * cancelling and who may do what. The worker itself is covered by its unit
 * tests and `pnpm --filter @fullcourt/worker smoke`.
 */
test.describe("simulation API", () => {
  test.beforeEach(({ browserName: _ }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "runs once, on desktop");
  });

  const clientFor = (
    baseURL: string | undefined,
    user: { email: string; password: string },
  ) =>
    createApiClient({
      baseUrl: baseURL ?? "",
      fetch,
      getAccessToken: async () => accessToken(user.email, user.password),
    });

  test("creates the first season, queues, refuses a second job and cancels", async ({
    baseURL,
  }) => {
    const user = await createConfirmedUser("simapi");
    const api = clientFor(baseURL, user);
    const league = await api.leagues.create({ name: "Sim", size: "compact" });

    // Nothing to simulate until a team is chosen.
    await expect(
      api.leagues.simulate(league.id, { kind: "day" }),
    ).rejects.toMatchObject({ status: 409, code: "league_not_active" });
    expect(await api.leagues.simulation(league.id)).toEqual({
      season: null,
      job: null,
    });

    const { teams } = await api.leagues.teams(league.id);
    await api.leagues.chooseTeam(league.id, { teamId: teams[0]!.id });

    // The first request creates the season and queues the job.
    const job = await api.leagues.simulate(league.id, { kind: "week" });
    expect(job).toMatchObject({
      kind: "week",
      status: "queued",
      daysRequested: 7,
      daysDone: 0,
      error: null,
    });
    const status = await api.leagues.simulation(league.id);
    expect(status.job?.id).toBe(job.id);
    expect(status.season).toMatchObject({
      phase: "regular-season",
      day: 1,
      schedulePreset: "standard",
    });
    // 12 teams on the standard preset: 8 + 9 + 12 = 29 games each.
    expect(status.season?.lastDay).toBeGreaterThanOrEqual(29);

    // One simulation at a time.
    await expect(
      api.leagues.simulate(league.id, { kind: "day" }),
    ).rejects.toMatchObject({ status: 409, code: "job_already_running" });

    const cancelled = await api.leagues.cancelSimulation(league.id);
    expect(cancelled).toMatchObject({ id: job.id, status: "cancelled" });
    await expect(api.leagues.cancelSimulation(league.id)).rejects.toMatchObject(
      { status: 404, code: "job_not_found" },
    );

    // Cancelling frees the slot, and the season is not created twice.
    const again = await api.leagues.simulate(league.id, { kind: "season" });
    expect(again.status).toBe("queued");
    expect(again.daysRequested).toBe(status.season?.lastDay);
    expect((await api.leagues.simulation(league.id)).season?.id).toBe(
      status.season?.id,
    );
  });

  test("rejects an unknown kind", async ({ baseURL }) => {
    const user = await createConfirmedUser("simkind");
    const api = clientFor(baseURL, user);
    const league = await api.leagues.create({ name: "Kind", size: "compact" });
    const response = await fetch(`${baseURL}/api/v1/leagues/${league.id}/sim`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${await accessToken(user.email, user.password)}`,
      },
      body: JSON.stringify({ kind: "month" }),
    });
    expect(response.status).toBe(400);
  });

  test("another user can't see, start or cancel a simulation", async ({
    baseURL,
  }) => {
    const owner = await createConfirmedUser("simowner");
    const other = await createConfirmedUser("simother");
    const asOwner = clientFor(baseURL, owner);
    const asOther = clientFor(baseURL, other);
    const league = await asOwner.leagues.create({
      name: "Mine",
      size: "compact",
    });
    const { teams } = await asOwner.leagues.teams(league.id);
    await asOwner.leagues.chooseTeam(league.id, { teamId: teams[0]!.id });
    await asOwner.leagues.simulate(league.id, { kind: "day" });

    await expect(asOther.leagues.simulation(league.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      asOther.leagues.simulate(league.id, { kind: "day" }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      asOther.leagues.cancelSimulation(league.id),
    ).rejects.toMatchObject({ status: 404 });
    // The owner's job is untouched.
    expect((await asOwner.leagues.simulation(league.id)).job?.status).toBe(
      "queued",
    );
  });

  test("requires signing in", async ({ baseURL }) => {
    const response = await fetch(
      `${baseURL}/api/v1/leagues/00000000-0000-4000-8000-000000000000/sim`,
    );
    expect(response.status).toBe(401);
  });
});

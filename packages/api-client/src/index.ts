import {
  ApiErrorSchema,
  DeleteLeagueResponseSchema,
  LeagueListSchema,
  LeagueSchema,
  LeagueSettingsSchema,
  LeagueStructureSchema,
  GameDetailSchema,
  GamePlaysSchema,
  CampResponseSchema,
  OffseasonResponseSchema,
  StaffResponseSchema,
  PlayoffsResponseSchema,
  SeasonSchema,
  ScheduleResponseSchema,
  SimJobSchema,
  StandingsResponseSchema,
  SimulationStatusSchema,
  TeamDetailSchema,
  TeamListSchema,
  type ChooseTeamRequest,
  type GameDetail,
  type GamePlays,
  type CampResponse,
  type HireStaffRequest,
  type OffseasonResponse,
  type ReleaseStaffRequest,
  type SetCampRequest,
  type StaffResponse,
  type PlayoffsResponse,
  type Season,
  type ScheduleResponse,
  type SimJob,
  type StandingsResponse,
  type SimulationStatus,
  type StartSimulationRequest,
  type TeamDetail,
  type Team,
  type CreateLeagueRequest,
  type League,
  type LeagueList,
  type LeagueSettings,
  type LeagueStructure,
  type RenameLeagueRequest,
  type RenameStructureRequest,
  DeleteAccountResponseSchema,
  HealthResponseSchema,
  ProfileSchema,
  type DeleteAccountRequest,
  type HealthResponse,
  type Profile,
  type UpdateProfileRequest,
} from "@fullcourt/validation";

export type { Database, Json } from "./database.types";

/**
 * Typed client for the Full Court application API (/api/v1).
 *
 * Platform-neutral: the caller supplies `fetch` and a way to read the
 * current Supabase access token. Web, mobile and desktop all use it.
 */
export interface ApiClientOptions {
  /** Origin of the web service, e.g. "https://fullcourt.example". */
  baseUrl: string;
  fetch: typeof fetch;
  /** Returns the Supabase access token for the signed-in user, if any. */
  getAccessToken?: () => Promise<string | null>;
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
  }
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export function createApiClient(options: ApiClientOptions) {
  const base = options.baseUrl.replace(/\/+$/, "");

  async function request<T>(
    method: Method,
    path: string,
    parse: (body: unknown) => T,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = { accept: "application/json" };
    const token = await options.getAccessToken?.();
    if (token) {
      headers.authorization = `Bearer ${token}`;
    }
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers["content-type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    const response = await options.fetch(`${base}/api/v1${path}`, init);
    const json: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const parsed = ApiErrorSchema.safeParse(json);
      throw parsed.success
        ? new ApiRequestError(
            response.status,
            parsed.data.error.code,
            parsed.data.error.message,
          )
        : new ApiRequestError(
            response.status,
            "unknown",
            `Request failed with ${response.status}`,
          );
    }
    return parse(json);
  }

  return {
    health: (): Promise<HealthResponse> =>
      request("GET", "/health", (b) => HealthResponseSchema.parse(b)),

    /** The signed-in user's profile. */
    me: (): Promise<Profile> =>
      request("GET", "/me", (b) => ProfileSchema.parse(b)),

    updateMe: (input: UpdateProfileRequest): Promise<Profile> =>
      request("PATCH", "/me", (b) => ProfileSchema.parse(b), input),

    /** Saved leagues (save slots). */
    leagues: {
      list: (): Promise<LeagueList> =>
        request("GET", "/leagues", (b) => LeagueListSchema.parse(b)),
      create: (input: CreateLeagueRequest): Promise<League> =>
        request("POST", "/leagues", (b) => LeagueSchema.parse(b), input),
      get: (id: string): Promise<League> =>
        request("GET", `/leagues/${encodeURIComponent(id)}`, (b) =>
          LeagueSchema.parse(b),
        ),
      rename: (id: string, input: RenameLeagueRequest): Promise<League> =>
        request(
          "PATCH",
          `/leagues/${encodeURIComponent(id)}`,
          (b) => LeagueSchema.parse(b),
          input,
        ),
      /** All teams in a league, by conference and division. */
      teams: (id: string): Promise<{ teams: Team[] }> =>
        request("GET", `/leagues/${encodeURIComponent(id)}/teams`, (b) =>
          TeamListSchema.parse(b),
        ),
      /** The rules a league was created with (derived for older leagues). */
      settings: (id: string): Promise<LeagueSettings> =>
        request("GET", `/leagues/${encodeURIComponent(id)}/settings`, (b) =>
          LeagueSettingsSchema.parse(b),
        ),
      /** Conferences and divisions, with their stable ids and display names. */
      structure: (id: string): Promise<LeagueStructure> =>
        request("GET", `/leagues/${encodeURIComponent(id)}/structure`, (b) =>
          LeagueStructureSchema.parse(b),
        ),
      /** Renames conferences and divisions; ids never change. */
      renameStructure: (
        id: string,
        input: RenameStructureRequest,
      ): Promise<LeagueStructure> =>
        request(
          "PATCH",
          `/leagues/${encodeURIComponent(id)}/structure`,
          (b) => LeagueStructureSchema.parse(b),
          input,
        ),
      /** One team and its roster. */
      team: (id: string, teamId: string): Promise<TeamDetail> =>
        request(
          "GET",
          `/leagues/${encodeURIComponent(id)}/teams/${encodeURIComponent(teamId)}`,
          (b) => TeamDetailSchema.parse(b),
        ),
      /** Picks the team you run. Only possible once, while the league is set up. */
      chooseTeam: (id: string, input: ChooseTeamRequest): Promise<League> =>
        request(
          "POST",
          `/leagues/${encodeURIComponent(id)}/team`,
          (b) => LeagueSchema.parse(b),
          input,
        ),
      delete: (id: string): Promise<{ deleted: true }> =>
        request("DELETE", `/leagues/${encodeURIComponent(id)}`, (b) =>
          DeleteLeagueResponseSchema.parse(b),
        ),
      /** A team's whole season (`team`), one day (`day`), or the current day. */
      schedule: (
        id: string,
        filter: { team?: string; day?: number } = {},
      ): Promise<ScheduleResponse> => {
        const query = new URLSearchParams();
        if (filter.team) query.set("team", filter.team);
        if (filter.day !== undefined) query.set("day", String(filter.day));
        const suffix = query.size > 0 ? `?${query}` : "";
        return request(
          "GET",
          `/leagues/${encodeURIComponent(id)}/schedule${suffix}`,
          (b) => ScheduleResponseSchema.parse(b),
        );
      },
      /** Every team's record this season, best first. */
      standings: (id: string): Promise<StandingsResponse> =>
        request("GET", `/leagues/${encodeURIComponent(id)}/standings`, (b) =>
          StandingsResponseSchema.parse(b),
        ),
      /** A game, its box score and what is needed to replay it. */
      game: (id: string, gameId: string): Promise<GameDetail> =>
        request(
          "GET",
          `/leagues/${encodeURIComponent(id)}/games/${encodeURIComponent(gameId)}`,
          (b) => GameDetailSchema.parse(b),
        ),
      /** The playoff bracket, series by series. */
      playoffs: (id: string): Promise<PlayoffsResponse> =>
        request("GET", `/leagues/${encodeURIComponent(id)}/playoffs`, (b) =>
          PlayoffsResponseSchema.parse(b),
        ),
      /** Archives the finished season into history and starts the next one. */
      startNextSeason: (id: string): Promise<Season> =>
        request(
          "POST",
          `/leagues/${encodeURIComponent(id)}/next-season`,
          (b) => SeasonSchema.parse(b),
          {},
        ),
      /** What the latest offseason did: the draft, retirements and the biggest movers. */
      offseason: (id: string): Promise<OffseasonResponse> =>
        request("GET", `/leagues/${encodeURIComponent(id)}/offseason`, (b) =>
          OffseasonResponseSchema.parse(b),
        ),
      /** Takes the current offseason stage's step and moves to the next stage. */
      advanceOffseason: (id: string): Promise<Season> =>
        request(
          "POST",
          `/leagues/${encodeURIComponent(id)}/offseason/advance`,
          (b) => SeasonSchema.parse(b),
          {},
        ),
      /** One of your teams' staff, the staff market and the budget. */
      staff: (id: string, teamId?: string): Promise<StaffResponse> =>
        request(
          "GET",
          `/leagues/${encodeURIComponent(id)}/staff${teamId ? `?team=${encodeURIComponent(teamId)}` : ""}`,
          (b) => StaffResponseSchema.parse(b),
        ),
      /** Hires a free agent into his role on your team. */
      hireStaff: (
        id: string,
        input: HireStaffRequest,
      ): Promise<StaffResponse> =>
        request(
          "POST",
          `/leagues/${encodeURIComponent(id)}/staff`,
          (b) => StaffResponseSchema.parse(b),
          input,
        ),
      /** Lets one of your staff go; he joins the market. */
      releaseStaff: (
        id: string,
        input: ReleaseStaffRequest,
      ): Promise<StaffResponse> =>
        request(
          "DELETE",
          `/leagues/${encodeURIComponent(id)}/staff`,
          (b) => StaffResponseSchema.parse(b),
          input,
        ),
      /** Who can go to training camp and who is going. */
      camp: (id: string, teamId?: string): Promise<CampResponse> =>
        request(
          "GET",
          `/leagues/${encodeURIComponent(id)}/camp${teamId ? `?team=${encodeURIComponent(teamId)}` : ""}`,
          (b) => CampResponseSchema.parse(b),
        ),
      /** Replaces your team's training camp roster. */
      setCamp: (id: string, input: SetCampRequest): Promise<CampResponse> =>
        request(
          "PUT",
          `/leagues/${encodeURIComponent(id)}/camp`,
          (b) => CampResponseSchema.parse(b),
          input,
        ),
      /** The game's plays, replayed by the server. */
      gamePlays: (id: string, gameId: string): Promise<GamePlays> =>
        request(
          "GET",
          `/leagues/${encodeURIComponent(id)}/games/${encodeURIComponent(gameId)}/plays`,
          (b) => GamePlaysSchema.parse(b),
        ),
      /** The league's season and its latest simulation job. */
      simulation: (id: string): Promise<SimulationStatus> =>
        request("GET", `/leagues/${encodeURIComponent(id)}/sim`, (b) =>
          SimulationStatusSchema.parse(b),
        ),
      /** Queues a day, a week or the rest of the regular season. */
      simulate: (id: string, input: StartSimulationRequest): Promise<SimJob> =>
        request(
          "POST",
          `/leagues/${encodeURIComponent(id)}/sim`,
          (b) => SimJobSchema.parse(b),
          input,
        ),
      /** Cancels the running or queued simulation. Days already played stay. */
      cancelSimulation: (id: string): Promise<SimJob> =>
        request("DELETE", `/leagues/${encodeURIComponent(id)}/sim`, (b) =>
          SimJobSchema.parse(b),
        ),
    },

    /** Permanently deletes the account and all of its data. */
    deleteMe: (input: DeleteAccountRequest): Promise<{ deleted: true }> =>
      request(
        "DELETE",
        "/me",
        (b) => DeleteAccountResponseSchema.parse(b),
        input,
      ),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

import {
  ApiErrorSchema,
  DeleteLeagueResponseSchema,
  LeagueListSchema,
  LeagueSchema,
  LeagueStructureSchema,
  TeamDetailSchema,
  TeamListSchema,
  type ChooseTeamRequest,
  type TeamDetail,
  type Team,
  type CreateLeagueRequest,
  type League,
  type LeagueList,
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

type Method = "GET" | "POST" | "PATCH" | "DELETE";

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

import {
  ApiErrorSchema,
  HealthResponseSchema,
  type HealthResponse,
} from "@fullcourt/validation";

/**
 * Typed client for the Full Court application API (/api/v1).
 *
 * Platform-neutral: the caller supplies `fetch` and, once accounts exist, a
 * way to read the current access token. Web, mobile and desktop all use it.
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

export function createApiClient(options: ApiClientOptions) {
  const base = options.baseUrl.replace(/\/+$/, "");

  async function request<T>(
    path: string,
    parse: (body: unknown) => T,
  ): Promise<T> {
    const headers: Record<string, string> = { accept: "application/json" };
    const token = await options.getAccessToken?.();
    if (token) {
      headers.authorization = `Bearer ${token}`;
    }
    const response = await options.fetch(`${base}/api/v1${path}`, { headers });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const parsed = ApiErrorSchema.safeParse(body);
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
    return parse(body);
  }

  return {
    health: (): Promise<HealthResponse> =>
      request("/health", (body) => HealthResponseSchema.parse(body)),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

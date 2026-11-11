import { connection } from "next/server";
import type { ApiError as ApiErrorBody } from "@fullcourt/validation";

/**
 * Building blocks for /api/v1 route handlers (docs/ARCHITECTURE.md, "Application API").
 *
 * - Request bodies and responses are validated against the zod schemas in
 *   @fullcourt/validation, so every client shares one contract.
 * - Every failure uses the shared error envelope: { error: { code, message } }.
 * - Unexpected errors are logged and returned as a generic 500, never leaked.
 */

/** Anything with a zod-style `safeParse`. Keeps zod out of this app's direct deps. */
export type Schema<T> = {
  safeParse(value: unknown):
    | { success: true; data: T }
    | {
        success: false;
        error: {
          issues: readonly { path: readonly PropertyKey[]; message: string }[];
        };
      };
};

/** An expected failure with an HTTP status and a stable machine-readable code. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

const NO_STORE = { "cache-control": "no-store" } as const;

export function errorResponse(
  status: number,
  code: string,
  message: string,
): Response {
  const body: ApiErrorBody = { error: { code, message } };
  return Response.json(body, { status, headers: NO_STORE });
}

function describeIssues(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): string {
  return issues
    .slice(0, 5)
    .map((issue) =>
      issue.path.length > 0
        ? `${issue.path.map(String).join(".")}: ${issue.message}`
        : issue.message,
    )
    .join("; ");
}

type Params = Record<string, string | string[] | undefined>;

type HandlerContext<Body> = {
  request: Request;
  body: Body;
  /** Dynamic route segments, e.g. { leagueId } for /leagues/[leagueId]. */
  params: Params;
};

/** The second argument Next passes to route handlers. */
type RouteHandlerContext = { params: Promise<Params> };

/**
 * Wraps a route handler. Always runs at request time (never prerendered),
 * parses and validates the JSON body when `body` is given, and validates the
 * response against `response` before sending it.
 */
export function apiRoute<Res, Body = undefined>(options: {
  response: Schema<Res>;
  body?: Schema<Body>;
  status?: number;
  handler: (context: HandlerContext<Body>) => Res | Promise<Res>;
}): (request: Request, context?: RouteHandlerContext) => Promise<Response> {
  return async (request, context) => {
    await connection();
    try {
      let body = undefined as Body;
      if (options.body) {
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          throw new ApiError(
            400,
            "invalid_json",
            "The request body must be valid JSON.",
          );
        }
        const parsed = options.body.safeParse(raw);
        if (!parsed.success) {
          throw new ApiError(
            400,
            "invalid_request",
            describeIssues(parsed.error.issues),
          );
        }
        body = parsed.data;
      }

      const params = (await context?.params) ?? {};
      const result = await options.handler({ request, body, params });
      const checked = options.response.safeParse(result);
      if (!checked.success) {
        // A server bug: the handler broke the shared contract.
        console.error(
          "API response failed validation",
          describeIssues(checked.error.issues),
        );
        return errorResponse(500, "internal_error", "Something went wrong.");
      }
      return Response.json(checked.data, {
        status: options.status ?? 200,
        headers: NO_STORE,
      });
    } catch (error) {
      if (error instanceof ApiError) {
        return errorResponse(error.status, error.code, error.message);
      }
      console.error("Unhandled API error", error);
      return errorResponse(500, "internal_error", "Something went wrong.");
    }
  };
}

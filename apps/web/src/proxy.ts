import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  maintenanceEnabled,
  maintenanceResponse,
} from "@/server/maintenance/maintenance";
import { memberRoute } from "@/server/navigation/member-routes";

/**
 * Keeps the Supabase session fresh: refreshes an expiring access token and
 * writes the new cookies to both the request (for this render) and the
 * response (for the browser).
 *
 * Keeps signed-in players inside the game: public info pages are rewritten
 * to their in-game copies, and the landing page redirects to /modes
 * (src/server/navigation/member-routes.ts).
 *
 * Also serves the maintenance page when MAINTENANCE_MODE=on.
 *
 * None of this is the access check. Pages, Server Actions and API routes each
 * verify the user themselves (src/server/auth/session.ts).
 */
export async function proxy(request: NextRequest) {
  if (maintenanceEnabled()) {
    return maintenanceResponse(request.nextUrl.pathname);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    return NextResponse.next({ request });
  }

  // Cookies and headers the session refresh wants on the response. Collected
  // first, then applied to whichever response this request gets.
  const refreshed: {
    cookies: { name: string; value: string; options: CookieOptions }[];
    headers: Record<string, string>;
  } = { cookies: [], headers: {} };

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        refreshed.cookies = cookiesToSet;
        refreshed.headers = headers;
      },
    },
  });

  // Validates the session and refreshes it when needed. Do not put code
  // between creating the client and this call.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);

  const route = memberRoute(request.nextUrl.pathname, signedIn);
  let response: NextResponse;
  if (route) {
    const target = request.nextUrl.clone();
    target.pathname = route.pathname;
    response =
      route.type === "rewrite"
        ? NextResponse.rewrite(target, { request })
        : NextResponse.redirect(target);
  } else {
    response = NextResponse.next({ request });
  }

  for (const { name, value, options } of refreshed.cookies) {
    response.cookies.set(name, value, options);
  }
  for (const [key, value] of Object.entries(refreshed.headers)) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: [
    // Everything except static assets, images, the health checks and the
    // token-only API (Bearer clients carry no cookies).
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|api/health|api/v1/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

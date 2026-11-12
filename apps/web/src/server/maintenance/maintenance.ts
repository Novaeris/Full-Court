/**
 * Maintenance mode (docs/operations.md). Set MAINTENANCE_MODE=on in the
 * Render dashboard to answer every page and API request with 503 while work
 * is under way; remove it to reopen. /api/health keeps answering so Render
 * still sees the service as healthy.
 *
 * The page is self-contained HTML: during maintenance nothing else (the
 * database, the session) is touched.
 */
export function maintenanceEnabled(): boolean {
  return process.env.MAINTENANCE_MODE === "on";
}

const RETRY_AFTER_SECONDS = "600";

export function maintenanceResponse(pathname: string): Response {
  const headers = {
    "retry-after": RETRY_AFTER_SECONDS,
    "cache-control": "no-store",
  };
  if (pathname.startsWith("/api/")) {
    return Response.json(
      {
        error: {
          code: "maintenance",
          message: "Full Court is down for maintenance. Try again soon.",
        },
      },
      { status: 503, headers },
    );
  }
  return new Response(MAINTENANCE_HTML, {
    status: 503,
    headers: { ...headers, "content-type": "text/html; charset=utf-8" },
  });
}

const MAINTENANCE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="color-scheme" content="light dark">
<title>Down for maintenance · Full Court</title>
<style>
  :root { --bg: #f6f4f1; --fg: #16181d; --muted: #4a4f59; }
  @media (prefers-color-scheme: dark) { :root { --bg: #0e1116; --fg: #eef0f3; --muted: #b4bac4; } }
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center; padding: 1rem;
         background: var(--bg); color: var(--fg); font-family: system-ui, sans-serif; line-height: 1.5; }
  main { max-width: 32rem; text-align: center; }
  h1 { font-size: 1.75rem; margin: 0 0 .5rem; }
  p { color: var(--muted); margin: 0 0 .75rem; }
</style>
</head>
<body>
<main>
  <h1>Down for maintenance</h1>
  <p>Full Court is being updated. It's usually back within a few minutes.</p>
  <p>Your account is safe. During the open alpha, some updates reset leagues; the changelog will say if this one did.</p>
</main>
</body>
</html>`;

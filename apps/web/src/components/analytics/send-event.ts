/**
 * Reports an aggregate usage event to /api/v1/events (docs/ARCHITECTURE.md,
 * "Analytics"). Sends no cookies and nothing about the visitor, and does
 * nothing when the browser signals Global Privacy Control or Do Not Track.
 */
export function sendAnalyticsEvent(
  event: "page_view" | "registration_started",
  path?: string,
): void {
  if (typeof window === "undefined") return;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  if (nav.globalPrivacyControl === true || nav.doNotTrack === "1") return;
  void fetch("/api/v1/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(path === undefined ? { event } : { event, path }),
    credentials: "omit",
    keepalive: true,
  }).catch(() => {
    // Analytics never interrupts the visitor.
  });
}

"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { sendAnalyticsEvent } from "./send-event";

/**
 * Counts a page view on every navigation. The server reduces the path to its
 * route pattern, so ids never reach the totals. Render inside <Suspense>:
 * usePathname suspends on routes with dynamic params.
 */
export function PageViewTracker() {
  const pathname = usePathname();
  useEffect(() => {
    sendAnalyticsEvent("page_view", pathname);
  }, [pathname]);
  return null;
}

"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * A page of a league is a new page: when you follow a link to it, it should
 * open at the top. Next.js keeps the scroll position when the new page is still
 * partly in view, so a page reached from a scrolled one could open with its first
 * link under the sticky header, where it can't be tapped properly. Back and
 * forward are left alone: the browser restores where you were.
 */
export function ScrollToTop() {
  const pathname = usePathname();
  const popped = useRef(false);
  const first = useRef(true);

  useEffect(() => {
    const mark = () => {
      popped.current = true;
    };
    window.addEventListener("popstate", mark);
    return () => window.removeEventListener("popstate", mark);
  }, []);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (popped.current) {
      popped.current = false;
      return;
    }
    // A link to a place on the page (a hash) scrolls there itself.
    if (window.location.hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);

  return null;
}

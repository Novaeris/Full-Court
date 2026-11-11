"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { segment: "", label: "Overview" },
  { segment: "roster", label: "Roster" },
  { segment: "schedule", label: "Schedule" },
  { segment: "standings", label: "Standings" },
  { segment: "settings", label: "Settings" },
] as const;

/**
 * League section tabs. On phones the row scrolls sideways inside itself
 * (never the page); the current tab is marked with aria-current.
 */
export function LeagueTabs({ leagueId }: { leagueId: string }) {
  const pathname = usePathname();
  const base = `/leagues/${leagueId}`;
  return (
    <nav aria-label="League" className="-mx-4 tablet:mx-0">
      <ul className="flex gap-1 overflow-x-auto border-b border-border px-4 tablet:px-0">
        {TABS.map((tab) => {
          const href = tab.segment ? `${base}/${tab.segment}` : base;
          const active = pathname === href;
          return (
            <li key={tab.label} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={[
                  "inline-flex min-h-touch items-center border-b-2 px-3 font-semibold whitespace-nowrap",
                  active
                    ? "border-accent text-text"
                    : "border-transparent text-text-muted hover:text-text",
                ].join(" ")}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

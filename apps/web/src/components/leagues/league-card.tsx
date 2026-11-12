import type { League } from "@fullcourt/validation";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";

const STATUS_LABEL: Record<League["status"], string> = {
  setup: "Setting up",
  active: "In season",
  archived: "Archived",
};

const dateFormat = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeZone: "UTC",
});

/** A league save, linking to its overview. Used by /leagues and /owner. */
export function LeagueCard({ league }: { league: League }) {
  return (
    <Link
      href={`/leagues/${league.id}`}
      className="flex h-full flex-col gap-3 rounded-lg border border-border bg-surface p-5 transition-colors duration-(--fc-duration-fast) hover:border-accent"
    >
      <span className="flex items-start justify-between gap-3">
        <span className="text-lg font-bold break-words">{league.name}</span>
        <Icon
          name="arrowRight"
          className="mt-1 size-5 shrink-0 text-text-muted"
        />
      </span>
      <span className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
        <span className="rounded-full bg-accent-soft px-2.5 py-0.5 font-semibold text-on-accent-soft">
          {STATUS_LABEL[league.status]}
        </span>
        Created {dateFormat.format(new Date(league.createdAt))}
      </span>
    </Link>
  );
}

/** Saved leagues in a responsive grid. */
export function LeagueGrid({ leagues }: { leagues: readonly League[] }) {
  return (
    <ul className="grid gap-4 tablet:grid-cols-2 desktop:grid-cols-3">
      {leagues.map((league) => (
        <li key={league.id}>
          <LeagueCard league={league} />
        </li>
      ))}
    </ul>
  );
}

import type { Team } from "@fullcourt/validation";
import { TeamLogo } from "./team-logo";

/**
 * A team's logo, or its abbreviation when it has none, on its primary colour.
 * Every primary colour keeps white at WCAG AA contrast (generated ones are
 * tested in the game engine, chosen ones are checked when they are picked).
 */
export function TeamBadge({
  team,
  size = "md",
}: {
  team: Pick<Team, "abbreviation" | "primaryColor" | "secondaryColor"> &
    Partial<Pick<Team, "logoId">>;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = {
    sm: "h-7 w-10 text-xs",
    md: "h-9 w-12 text-sm",
    lg: "h-14 w-20 text-xl",
  } as const;
  const logoSizes = { sm: "size-4", md: "size-5", lg: "size-9" } as const;
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-md border-b-4 font-black tracking-wide ${sizes[size]}`}
      style={{
        // White text: there is no white token, since badges are the only
        // place colours come from data rather than the theme.
        color: "#ffffff",
        backgroundColor: team.primaryColor,
        borderBottomColor: team.secondaryColor,
      }}
    >
      {team.logoId ? (
        <TeamLogo logoId={team.logoId} className={logoSizes[size]} />
      ) : (
        team.abbreviation
      )}
    </span>
  );
}

export function teamName(team: Pick<Team, "city" | "nickname">): string {
  return `${team.city} ${team.nickname}`;
}

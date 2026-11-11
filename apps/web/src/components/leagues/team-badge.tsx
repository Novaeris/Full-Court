import type { Team } from "@fullcourt/validation";

/**
 * A team's abbreviation on its primary colour. Every generated primary colour
 * keeps white text at WCAG AA contrast (tested in the game engine).
 */
export function TeamBadge({
  team,
  size = "md",
}: {
  team: Pick<Team, "abbreviation" | "primaryColor" | "secondaryColor">;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = {
    sm: "h-7 w-10 text-xs",
    md: "h-9 w-12 text-sm",
    lg: "h-14 w-20 text-xl",
  } as const;
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
      {team.abbreviation}
    </span>
  );
}

export function teamName(team: Pick<Team, "city" | "nickname">): string {
  return `${team.city} ${team.nickname}`;
}

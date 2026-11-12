import type { IconName } from "@/components/ui/icon";

/**
 * Full Court's three game modes. They share an account and nothing else:
 * each has its own routes, its own saves and, later, its own tables
 * (docs/DESIGN.md, "Game modes"). This is presentation data only — no game
 * rules belong here.
 */
export type GameMode = {
  id: "owner" | "career" | "dynasty";
  href: `/${string}`;
  title: string;
  /** One line under the title. */
  tagline: string;
  description: string;
  features: readonly string[];
  cta: string;
  icon: IconName;
  /** What's playable today. Shown on the card so nothing over-promises. */
  status: "alpha" | "in-development";
};

export type GameModeId = GameMode["id"];

export const GAME_MODES: readonly GameMode[] = [
  {
    id: "owner",
    href: "/owner",
    title: "Owner Mode",
    tagline: "Run the franchise",
    description:
      "Take full control of a basketball franchise. Build the roster, balance the books and grow the organisation into a champion.",
    features: ["Roster building", "Finances", "Stadiums", "Championships"],
    cta: "Enter Owner Mode",
    icon: "trophy",
    status: "alpha",
  },
  {
    id: "career",
    href: "/career",
    title: "Career Mode",
    tagline: "Become the player",
    description:
      "Create one player and live their career. Train, develop and make the decisions that shape a legacy.",
    features: [
      "Player creation",
      "Training",
      "Progression",
      "Career achievements",
    ],
    cta: "Enter Career Mode",
    icon: "star",
    status: "in-development",
  },
  {
    id: "dynasty",
    href: "/dynasty",
    title: "Dynasty Mode",
    tagline: "Collect the cards",
    description:
      "Collect player cards, chase rare finds and build a lineup that can beat anyone.",
    features: [
      "Collections",
      "Rarities",
      "Lineups",
      "Head-to-head competition",
    ],
    cta: "Enter Dynasty Mode",
    icon: "cards",
    status: "in-development",
  },
];

export const STATUS_LABEL: Record<GameMode["status"], string> = {
  alpha: "Open alpha",
  "in-development": "In development",
};

export function gameMode(id: GameModeId): GameMode {
  const mode = GAME_MODES.find((m) => m.id === id);
  if (!mode) throw new Error(`Unknown game mode: ${id}`);
  return mode;
}

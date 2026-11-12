import type { ReactNode } from "react";

/**
 * The built-in team logos. Each has a stable id (`logo-01`…`logo-24`, the
 * same ids the database stores) and is drawn from simple shapes in the
 * current text colour, so it works on any team colour. Changing a shape is
 * fine; changing which id means what is not, because saved leagues use the ids.
 */
type Mark = { label: string; shape: ReactNode };

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const LOGOS: Record<string, Mark> = {
  "logo-01": {
    label: "Star",
    shape: (
      <polygon points="12,2 14.9,8.6 22,9.3 16.6,14 18.2,21 12,17.3 5.8,21 7.4,14 2,9.3 9.1,8.6" />
    ),
  },
  "logo-02": {
    label: "Lightning bolt",
    shape: <polygon points="13.5,2 4.5,13.5 11,13.5 9.5,22 19.5,10 13,10" />,
  },
  "logo-03": {
    label: "Crown",
    shape: (
      <>
        <path d="M3 17 L2.5 7 L8 12 L12 5 L16 12 L21.5 7 L21 17 Z" />
        <rect x="3" y="18.5" width="18" height="2.5" rx="0.6" />
      </>
    ),
  },
  "logo-04": {
    label: "Diamond",
    shape: <polygon points="12,2 22,12 12,22 2,12" />,
  },
  "logo-05": {
    label: "Shield",
    shape: (
      <path d="M12 2 L21 5.5 V12 C21 17 17 20.5 12 22 C7 20.5 3 17 3 12 V5.5 Z" />
    ),
  },
  "logo-06": {
    label: "Hexagon",
    shape: <polygon points="12,2 20.7,7 20.7,17 12,22 3.3,17 3.3,7" />,
  },
  "logo-07": {
    label: "Mountain",
    shape: <polygon points="2,20 9,6 13,13 16,9 22,20" />,
  },
  "logo-08": {
    label: "Chevrons",
    shape: (
      <>
        <polygon points="3,10 12,2 21,10 21,13.5 12,5.5 3,13.5" />
        <polygon points="3,18 12,10 21,18 21,21.5 12,13.5 3,21.5" />
      </>
    ),
  },
  "logo-09": {
    label: "Ring",
    shape: (
      <>
        <circle cx="12" cy="12" r="8" {...stroke} strokeWidth={3} />
        <circle cx="12" cy="12" r="2.5" />
      </>
    ),
  },
  "logo-10": {
    label: "Crescent",
    shape: <path d="M16 3 A9.5 9.5 0 1 0 21 16 A8 8 0 1 1 16 3 Z" />,
  },
  "logo-11": {
    label: "Cross",
    shape: <path d="M9 2 H15 V9 H22 V15 H15 V22 H9 V15 H2 V9 H9 Z" />,
  },
  "logo-12": {
    label: "Wave",
    shape: (
      <>
        <path d="M2 8 C5 4 8 4 12 8 S19 12 22 8 V12 C19 16 16 16 12 12 S5 8 2 12 Z" />
        <path d="M2 15 C5 11 8 11 12 15 S19 19 22 15 V19 C19 23 16 23 12 19 S5 15 2 19 Z" />
      </>
    ),
  },
  "logo-13": {
    label: "Sun",
    shape: (
      <>
        <circle cx="12" cy="12" r="5" />
        <path
          d="M12 1.5V5M12 19V22.5M1.5 12H5M19 12H22.5M4.6 4.6L7 7M17 17L19.4 19.4M4.6 19.4L7 17M17 7L19.4 4.6"
          {...stroke}
        />
      </>
    ),
  },
  "logo-14": {
    label: "Leaf",
    shape: <path d="M4 20 C4 10 10 4 21 3 C20 14 14 20 4 20 Z" />,
  },
  "logo-15": {
    label: "Ball",
    shape: (
      <>
        <circle cx="12" cy="12" r="9.5" {...stroke} />
        <path d="M12 2.5V21.5M2.5 12H21.5" {...stroke} strokeWidth={1.8} />
        <path
          d="M5.2 5.5C9 9 9 15 5.2 18.5M18.8 5.5C15 9 15 15 18.8 18.5"
          {...stroke}
          strokeWidth={1.8}
        />
      </>
    ),
  },
  "logo-16": {
    label: "Flame",
    shape: (
      <path d="M12 2 C13 7 18 9 18 15 A6 6 0 0 1 6 15 C6 12 8 11 8.5 8.5 C10 10 10.5 8 12 2 Z" />
    ),
  },
  "logo-17": {
    label: "Wing",
    shape: (
      <path d="M2 18 C6 8 14 4 22 5 C18 7 17 9 16 11 C18 11 19.5 11 21 10.5 C18 15 11 18 2 18 Z" />
    ),
  },
  "logo-18": {
    label: "Anchor",
    shape: (
      <>
        <circle cx="12" cy="5" r="2.5" {...stroke} />
        <path
          d="M12 7.5V21M7 11H17M4 15C4 19 8 21 12 21S20 19 20 15"
          {...stroke}
        />
      </>
    ),
  },
  "logo-19": {
    label: "Spear",
    shape: <polygon points="12,1.5 17,9 13.5,9 13.5,22 10.5,22 10.5,9 7,9" />,
  },
  "logo-20": {
    label: "Tower",
    shape: <path d="M4 21 V5 H8 V8 H10 V5 H14 V8 H16 V5 H20 V21 Z" />,
  },
  "logo-21": {
    label: "Claws",
    shape: (
      <path
        d="M5 3 C7 10 7 16 4 21 M12 3 C14 10 14 16 11 21 M19 3 C21 10 21 16 18 21"
        {...stroke}
        strokeWidth={3}
      />
    ),
  },
  "logo-22": {
    label: "Eye",
    shape: (
      <>
        <path
          d="M1.5 12 C5 5.5 19 5.5 22.5 12 C19 18.5 5 18.5 1.5 12 Z"
          {...stroke}
        />
        <circle cx="12" cy="12" r="3.5" />
      </>
    ),
  },
  "logo-23": {
    label: "Pinwheel",
    shape: (
      <>
        <polygon points="12,12 12,2 20,2" />
        <polygon points="12,12 22,12 22,20" />
        <polygon points="12,12 12,22 4,22" />
        <polygon points="12,12 2,12 2,4" />
      </>
    ),
  },
  "logo-24": {
    label: "Compass",
    shape: (
      <polygon points="12,1.5 14,10 22.5,12 14,14 12,22.5 10,14 1.5,12 10,10" />
    ),
  },
};

/** Readable name of a logo, for labels. */
export function logoLabel(logoId: string): string {
  return LOGOS[logoId]?.label ?? "Logo";
}

/** A logo in the current text colour. Decorative: label it where it is used. */
export function TeamLogo({
  logoId,
  className = "size-5",
}: {
  logoId: string;
  className?: string;
}) {
  const mark = LOGOS[logoId];
  if (!mark) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {mark.shape}
    </svg>
  );
}

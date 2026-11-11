import type { SVGProps } from "react";

/** Line icons, 24×24, drawn with currentColor. Decorative unless labelled. */
const PATHS = {
  trophy:
    "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4ZM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3",
  user: "M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "M6 6l12 12M18 6 6 18",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z",
  monitor: "M3 4h18v12H3zM8 20h8M12 16v4",
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 16v-4M12 8h.01",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z",
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6ZM14 2v6h6M8 13h8M8 17h5",
  ball: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM2 12h20M12 2v20M5 5a14 14 0 0 1 0 14M19 5a14 14 0 0 0 0 14",
  chart: "M3 3v18h18M7 15l4-4 3 3 6-6",
  calendar: "M3 5h18v16H3zM16 3v4M8 3v4M3 10h18",
  swap: "M7 7h13l-3-3M17 17H4l3 3",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  palette:
    "M12 22a10 10 0 1 1 10-10c0 2.8-2.2 4-4 4h-2a2 2 0 0 0-1.4 3.4A2 2 0 0 1 12 22ZM7.5 11h.01M10.5 7h.01M15.5 8h.01",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  label,
  ...props
}: { name: IconName; label?: string } & Omit<
  SVGProps<SVGSVGElement>,
  "children"
>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      {...props}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

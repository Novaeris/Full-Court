import type { ReactNode } from "react";

/**
 * A full basketball court, 94 by 50 feet, one SVG unit to the foot, with room
 * around it for the benches. Drawn with the theme's colours so it follows
 * light and dark mode. Children are drawn on top (players and the ball) in
 * court coordinates.
 */
export const COURT_VIEW_BOX = "-2 -8 98 66";

const LINE = {
  stroke: "var(--fc-color-text-muted)",
  strokeWidth: 0.35,
  fill: "none",
} as const;

/** The three-point line for the basket at the left (x = 5.25), mirrored for the right. */
function threePointLine(right: boolean): string {
  const flip = (x: number) => (right ? 94 - x : x);
  // Corner lines run 14 feet out from the baseline, then the arc (23.75 feet
  // from the basket) joins them.
  return `M ${flip(0)} 3 H ${flip(14.2)} A 23.75 23.75 0 0 ${right ? 0 : 1} ${flip(14.2)} 47 H ${flip(0)}`;
}

function Half({ right }: { right: boolean }) {
  const flip = (x: number) => (right ? 94 - x : x);
  const width = 19;
  return (
    <g {...LINE}>
      {/* The lane. */}
      <rect
        x={right ? 94 - width : 0}
        y={17}
        width={width}
        height={16}
        fill="var(--fc-color-surface)"
        fillOpacity={0.55}
      />
      {/* Free-throw circle. */}
      <circle cx={flip(19)} cy={25} r={6} />
      <path d={threePointLine(right)} />
      {/* Backboard and rim. */}
      <line x1={flip(4)} y1={22} x2={flip(4)} y2={28} strokeWidth={0.7} />
      <circle
        cx={flip(5.25)}
        cy={25}
        r={0.75}
        stroke="var(--fc-color-accent)"
        strokeWidth={0.4}
      />
    </g>
  );
}

export function Court({
  label,
  children,
}: {
  label: string;
  children?: ReactNode;
}) {
  return (
    <svg
      viewBox={COURT_VIEW_BOX}
      role="img"
      aria-label={label}
      className="h-auto w-full rounded-lg border border-border bg-surface"
    >
      <rect
        x={0}
        y={0}
        width={94}
        height={50}
        fill="var(--fc-color-surface-muted)"
        stroke="var(--fc-color-text-muted)"
        strokeWidth={0.5}
      />
      <g {...LINE}>
        <line x1={47} y1={0} x2={47} y2={50} />
        <circle cx={47} cy={25} r={6} />
      </g>
      <Half right={false} />
      <Half right />
      {children}
    </svg>
  );
}

import type { GameModeId } from "./mode-config";

/**
 * Decorative artwork for each game mode, drawn only with theme tokens so it
 * follows light and dark mode. Hidden from assistive technology: the card's
 * text carries the meaning.
 *
 * - Owner: a half court under championship banners (the franchise).
 * - Career: one player's jersey with a rising progression line (the player).
 * - Dynasty: a fan of cards rising in rarity (the collection).
 */
export function ModeArt({
  mode,
  className = "",
}: {
  mode: GameModeId;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 320 140"
      preserveAspectRatio="xMidYMax meet"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {mode === "owner" ? <OwnerArt /> : null}
      {mode === "career" ? <CareerArt /> : null}
      {mode === "dynasty" ? <DynastyArt /> : null}
    </svg>
  );
}

/** Band behind the art. Each mode gets its own blend of the theme surfaces. */
export const ART_BACKGROUND: Record<GameModeId, string> = {
  owner: "bg-linear-to-br from-accent-soft to-surface-muted",
  career: "bg-linear-to-tr from-surface-muted to-accent-soft",
  dynasty: "bg-linear-to-b from-accent-soft via-surface-muted to-accent-soft",
};

function OwnerArt() {
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      {/* Championship banners */}
      {[28, 62, 96].map((x, i) => (
        <path
          key={x}
          d={`M${x} 0v${40 - i * 4}l12-7 12 7V0`}
          className={i === 0 ? "fill-accent" : "fill-surface stroke-accent"}
          strokeWidth={2}
        />
      ))}
      {/* Half court */}
      <g className="stroke-accent" strokeWidth={3}>
        <path d="M40 140v-26a130 130 0 0 1 240 0v26" />
        <rect x="125" y="62" width="70" height="78" />
        <path d="M125 62a35 35 0 0 1 70 0" />
        <path
          d="M125 62a35 35 0 0 0 70 0"
          strokeDasharray="6 7"
          className="stroke-text-muted"
        />
        <path d="M144 132h32" />
      </g>
      <circle cx="160" cy="122" r="7" className="stroke-text" strokeWidth={3} />
      {/* Ball */}
      <g transform="translate(250 30)">
        <circle r="16" className="fill-accent" />
        <path
          d="M-16 0h32M0-16v32M-11-11a16 16 0 0 1 0 22M11-11a16 16 0 0 0 0 22"
          className="stroke-on-accent"
          strokeWidth={1.75}
        />
      </g>
    </g>
  );
}

function CareerArt() {
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      {/* Progression: bars that climb, and the path a career takes */}
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={i}
          x={214 + i * 22}
          y={118 - (i + 1) * 20}
          width="14"
          height={(i + 1) * 20 + 22}
          rx="3"
          className={i === 3 ? "fill-accent" : "fill-surface stroke-accent"}
          strokeWidth={2}
        />
      ))}
      <path
        d="M18 118c26-6 40-26 62-34s38 2 50-14"
        fill="none"
        className="stroke-text-muted"
        strokeWidth={3}
        strokeDasharray="2 9"
      />
      <path
        d="m22 46 4.4 9 9.9 1.4-7.2 7 1.7 9.8-8.8-4.6-8.8 4.6 1.7-9.8-7.2-7 9.9-1.4L22 46Z"
        transform="translate(40 -26)"
        className="fill-accent"
      />
      {/* Jersey */}
      <path
        d="M140 22q20 26 40 0l10 4q-2 22 10 32v82h-80V58q12-10 10-32Z"
        className="fill-surface stroke-accent"
        strokeWidth={3}
      />
      <path
        d="M146 30q14 16 28 0"
        fill="none"
        className="stroke-accent"
        strokeWidth={2}
      />
      <text
        x="160"
        y="112"
        textAnchor="middle"
        className="fill-accent font-black"
        fontSize="44"
      >
        1
      </text>
    </g>
  );
}

function DynastyArt() {
  const cards = [
    { angle: -16, card: "fill-surface stroke-border", mark: "fill-text-muted" },
    {
      angle: 0,
      card: "fill-accent-soft stroke-accent",
      mark: "fill-on-accent-soft",
    },
    {
      angle: 16,
      card: "fill-accent stroke-accent-strong",
      mark: "fill-on-accent",
    },
  ];
  return (
    <g strokeLinejoin="round">
      {cards.map(({ angle, card, mark }, i) => (
        <g key={angle} transform={`rotate(${angle} 160 210)`}>
          <rect
            x="126"
            y="22"
            width="68"
            height="96"
            rx="8"
            className={card}
            strokeWidth={2.5}
          />
          {/* Rarity: one, two, then three stars */}
          {Array.from({ length: i + 1 }, (_, s) => (
            <path
              key={s}
              d="m0-7 2 4.4 4.7.6-3.4 3.3.8 4.7L0 3.8-4.1 6l.8-4.7L-6.7-2l4.7-.6Z"
              transform={`translate(${160 + (s - i / 2) * 15} 44)`}
              className={mark}
            />
          ))}
          <circle cx="160" cy="84" r="14" className={mark} opacity={0.35} />
          <rect
            x="140"
            y="103"
            width="40"
            height="6"
            rx="3"
            className={mark}
            opacity={0.35}
          />
        </g>
      ))}
      {/* Sparkles around the rarest card */}
      <path
        d="M232 34v12M226 40h12M86 70v8M82 74h8M250 92v8M246 96h8"
        className="stroke-accent"
        strokeWidth={2.5}
        strokeLinecap="round"
      />
    </g>
  );
}

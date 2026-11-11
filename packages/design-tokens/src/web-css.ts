import { colorTokenNames, colors, type ColorTheme } from "./color";
import {
  breakpoints,
  fontSize,
  fontWeight,
  layout,
  motion,
  radius,
  zIndex,
} from "./scale";

const rem = (px: number) => `${px / 16}rem`;

function colorVars(theme: ColorTheme, indent: string): string {
  return colorTokenNames
    .map((name) => `${indent}--fc-color-${name}: ${theme[name]};`)
    .join("\n");
}

/**
 * Renders the web stylesheet for the tokens: CSS variables for both themes
 * plus a Tailwind v4 `@theme` block that maps utilities onto them.
 *
 * Theme selection: `<html data-theme="light|dark">` forces a theme; without
 * the attribute the operating system preference applies.
 */
export function renderWebCss(): string {
  const lines: string[] = [];
  const push = (...l: string[]) => lines.push(...l);

  push(
    "/* Generated from @fullcourt/design-tokens. Do not edit by hand. */",
    "/* Regenerate with: pnpm --filter @fullcourt/web tokens */",
    "",
    ":root {",
    "  color-scheme: light;",
    colorVars(colors.light, "  "),
    "}",
    "",
    "@media (prefers-color-scheme: dark) {",
    '  :root:not([data-theme="light"]) {',
    "    color-scheme: dark;",
    colorVars(colors.dark, "    "),
    "  }",
    "}",
    "",
    ':root[data-theme="dark"] {',
    "  color-scheme: dark;",
    colorVars(colors.dark, "  "),
    "}",
    "",
    "@theme inline {",
    "  --color-*: initial;",
    "  --color-transparent: transparent;",
    "  --color-current: currentColor;",
  );
  for (const name of colorTokenNames) {
    push(`  --color-${name}: var(--fc-color-${name});`);
  }
  push("", "  --breakpoint-*: initial;");
  for (const [name, px] of Object.entries(breakpoints)) {
    push(`  --breakpoint-${name}: ${rem(px)};`);
  }
  push("");
  for (const [name, px] of Object.entries(radius)) {
    push(`  --radius-${name}: ${name === "full" ? "9999px" : rem(px)};`);
  }
  push("");
  for (const [name, [size, lineHeight]] of Object.entries(fontSize)) {
    push(`  --text-${name}: ${rem(size)};`);
    push(`  --text-${name}--line-height: ${rem(lineHeight)};`);
  }
  push("");
  for (const [name, weight] of Object.entries(fontWeight)) {
    push(`  --font-weight-${name}: ${weight};`);
  }
  push("");
  for (const [name, ms] of Object.entries(motion)) {
    push(`  --fc-duration-${name}: ${ms}ms;`);
  }
  for (const [name, z] of Object.entries(zIndex)) {
    push(`  --fc-z-${name}: ${z};`);
  }
  push("");
  push(`  --spacing-touch: ${rem(layout.touchTarget)};`);
  push(`  --spacing-sidebar: ${rem(layout.sidebar)};`);
  push(`  --spacing-rail: ${rem(layout.rail)};`);
  push(`  --spacing-tab-bar: ${rem(layout.tabBar)};`);
  push(`  --container-content: ${rem(layout.contentMax)};`);
  push(`  --container-prose: ${rem(layout.proseMax)};`);
  push("}", "");

  return lines.join("\n");
}

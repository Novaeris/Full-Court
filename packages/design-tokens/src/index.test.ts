import { describe, expect, it } from "vitest";
import {
  breakpoints,
  colorTokenNames,
  colors,
  contrastRatio,
  contrastRequirements,
  renderWebCss,
} from "./index";

describe("contrast", () => {
  it("computes known WCAG ratios", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });

  for (const theme of ["light", "dark"] as const) {
    for (const { fg, bg, min } of contrastRequirements) {
      it(`${theme}: ${fg} on ${bg} meets ${min}:1`, () => {
        const ratio = contrastRatio(colors[theme][fg], colors[theme][bg]);
        expect(ratio).toBeGreaterThanOrEqual(min);
      });
    }
  }
});

describe("tokens", () => {
  it("defines every color in both themes", () => {
    for (const theme of [colors.light, colors.dark]) {
      expect(Object.keys(theme).sort()).toEqual([...colorTokenNames].sort());
    }
  });

  it("orders breakpoints from small to large", () => {
    expect(breakpoints.tablet).toBeLessThan(breakpoints.desktop);
    expect(breakpoints.desktop).toBeLessThan(breakpoints.wide);
  });
});

describe("renderWebCss", () => {
  const css = renderWebCss();

  it("emits a variable and a Tailwind color for every token", () => {
    for (const name of colorTokenNames) {
      expect(css).toContain(`--fc-color-${name}: ${colors.light[name]};`);
      expect(css).toContain(`--fc-color-${name}: ${colors.dark[name]};`);
      expect(css).toContain(`--color-${name}: var(--fc-color-${name});`);
    }
  });

  it("supports a forced theme and the system preference", () => {
    expect(css).toContain(':root[data-theme="dark"]');
    expect(css).toContain("@media (prefers-color-scheme: dark)");
    expect(css).toContain(':root:not([data-theme="light"])');
  });

  it("names breakpoints after devices", () => {
    expect(css).toContain("--breakpoint-tablet: 40rem;");
    expect(css).toContain("--breakpoint-desktop: 64rem;");
    expect(css).toContain("--breakpoint-wide: 90rem;");
  });
});

import { readFileSync } from "node:fs";
import { renderWebCss } from "@fullcourt/design-tokens";
import { describe, expect, it } from "vitest";

describe("tokens.css", () => {
  it("matches @fullcourt/design-tokens (run `pnpm --filter @fullcourt/web tokens` to update)", () => {
    const committed = readFileSync(
      new URL("./tokens.css", import.meta.url),
      "utf8",
    );
    expect(committed.replace(/\r\n/g, "\n")).toBe(renderWebCss());
  });
});

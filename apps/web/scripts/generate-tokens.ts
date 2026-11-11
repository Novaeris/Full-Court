/**
 * Writes src/styles/tokens.css from @fullcourt/design-tokens.
 * Run after changing tokens: pnpm --filter @fullcourt/web tokens
 * (src/styles/tokens.test.ts fails while the file is out of date.)
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderWebCss } from "@fullcourt/design-tokens";

const target = fileURLToPath(
  new URL("../src/styles/tokens.css", import.meta.url),
);
writeFileSync(target, renderWebCss());
console.log(`Wrote ${target}`);

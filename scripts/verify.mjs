#!/usr/bin/env node
/**
 * The pre-push gate. Runs every check and reports all failures at the end.
 *
 *   pnpm verify
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

const steps = [
  ["Secret scan", "node scripts/scan-secrets.mjs"],
  ["Architecture boundaries", "node scripts/check-boundaries.mjs"],
  ["Tooling tests", "pnpm exec vitest run --root scripts"],
  ["Typecheck", "pnpm exec turbo run typecheck"],
  ["Lint", "pnpm exec eslint . --max-warnings 0"],
  ["Format", "pnpm exec prettier --check ."],
  ["Unit tests", "pnpm exec turbo run test"],
];

const failed = [];
for (const [label, command] of steps) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(command, {
    cwd: root,
    stdio: "inherit",
    shell: true,
  });
  if (result.status !== 0) failed.push(label);
}

console.log("");
if (failed.length > 0) {
  console.error(`verify FAILED: ${failed.join(", ")}`);
  process.exit(1);
}
console.log("verify passed.");

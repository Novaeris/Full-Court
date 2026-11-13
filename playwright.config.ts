import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Local Supabase URL and publishable key, shared with the web app.
if (existsSync("apps/web/.env.local")) {
  process.loadEnvFile("apps/web/.env.local");
}

const PORT = Number(process.env.E2E_PORT ?? 3100);
const ENGINE_SPEC = /determinism\.spec\.ts/;

/**
 * Web e2e. Every spec runs at phone, tablet and desktop sizes
 * (docs/ARCHITECTURE.md, "Responsive design").
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  reporter: "list",
  expect: {
    // Account and league tests wait on local Supabase; give slow moments room.
    timeout: 10_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.001 },
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "phone",
      use: { ...devices["iPhone 13"], browserName: "chromium" },
      testIgnore: ENGINE_SPEC,
    },
    {
      name: "tablet",
      use: { viewport: { width: 820, height: 1180 }, hasTouch: true },
      testIgnore: ENGINE_SPEC,
    },
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    // The simulation must play identically in every JavaScript engine. Desktop
    // (Chromium, V8) runs determinism.spec.ts too; these run it alone in the
    // others: Firefox (SpiderMonkey) and WebKit (JavaScriptCore, which every
    // iPhone browser uses, on a desktop and a phone profile).
    {
      name: "engine-firefox",
      use: { ...devices["Desktop Firefox"] },
      testMatch: ENGINE_SPEC,
    },
    {
      name: "engine-safari",
      use: { ...devices["Desktop Safari"] },
      testMatch: ENGINE_SPEC,
    },
    {
      name: "engine-iphone",
      use: { ...devices["iPhone 13"] },
      testMatch: ENGINE_SPEC,
    },
  ],
  webServer: {
    // A production build, so tests see what users get (no dev overlay).
    command: `pnpm exec turbo run build --filter=@fullcourt/web... --output-logs=errors-only && node scripts/scan-bundle.mjs && pnpm --filter @fullcourt/web exec next start --port ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    // Auth emails must link back to this server, not the dev server.
    env: { SITE_URL: `http://localhost:${PORT}` },
    timeout: 300_000,
  },
});

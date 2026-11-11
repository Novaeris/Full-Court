import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Local Supabase URL and publishable key, shared with the web app.
if (existsSync("apps/web/.env.local")) {
  process.loadEnvFile("apps/web/.env.local");
}

const PORT = Number(process.env.E2E_PORT ?? 3100);

/**
 * Web e2e. Every spec runs at phone, tablet and desktop sizes
 * (docs/ARCHITECTURE.md, "Responsive design").
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  reporter: "list",
  expect: {
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
    },
    {
      name: "tablet",
      use: { viewport: { width: 820, height: 1180 }, hasTouch: true },
    },
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
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

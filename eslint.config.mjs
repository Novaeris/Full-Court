import { builtinModules } from "node:module";
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";

/**
 * One flat config for the whole monorepo. Architecture rules live here as
 * path-scoped blocks; see docs/ARCHITECTURE.md ("Dependency direction" and
 * "Shared game engine").
 */

// Packages that must run unchanged on every platform: Node, browsers,
// React Native (Hermes) and desktop. No platform APIs, no I/O, no clock, no
// ambient randomness.
const PURE_PACKAGES = [
  "packages/shared/src/**",
  "packages/game-types/src/**",
  "packages/game-rules/src/**",
  "packages/game-engine/src/**",
  "packages/design-tokens/src/**",
];

// Platform-neutral client packages: may do network I/O through an injected
// fetch, but must not depend on Node, React or Next.
const CLIENT_PACKAGES = [
  "packages/validation/src/**",
  "packages/api-client/src/**",
];

const nodeBuiltins = [
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
];

const platformImportBans = {
  paths: nodeBuiltins.map((name) => ({
    name,
    message:
      "Shared packages must not use Node built-ins; they also run on mobile and desktop.",
  })),
  patterns: [
    {
      group: ["node:*"],
      message: "Shared packages must not use Node built-ins.",
    },
    {
      group: [
        "react",
        "react/*",
        "react-dom",
        "react-dom/*",
        "react-native",
        "react-native/*",
      ],
      message: "Shared packages must not depend on a UI framework.",
    },
    {
      group: ["next", "next/*"],
      message: "Shared packages must not depend on Next.js.",
    },
    {
      group: [
        "@fullcourt/web",
        "@fullcourt/web/*",
        "@fullcourt/worker",
        "@fullcourt/mobile",
        "@fullcourt/desktop",
      ],
      message: "Packages never import from apps.",
    },
  ],
};

const browserAndNodeGlobals = [
  "window",
  "document",
  "navigator",
  "localStorage",
  "sessionStorage",
  "location",
  "fetch",
  "XMLHttpRequest",
  "process",
  "Buffer",
  "global",
  "require",
  "__dirname",
  "__filename",
  "crypto",
  "performance",
  "setTimeout",
  "setInterval",
  "setImmediate",
].map((name) => ({
  name,
  message: `"${name}" is a platform API. Pure packages take everything they need as arguments.`,
}));

const determinismProperties = [
  {
    object: "Math",
    property: "random",
    message: "Use the seeded RNG from @fullcourt/game-engine.",
  },
  {
    object: "Date",
    property: "now",
    message: "Pass the current game date in as data.",
  },
  {
    object: "performance",
    property: "now",
    message: "Pure packages must not read the clock.",
  },
  {
    object: "crypto",
    property: "randomUUID",
    message: "Derive ids from the seeded RNG or inputs.",
  },
  {
    object: "crypto",
    property: "getRandomValues",
    message: "Use the seeded RNG.",
  },
];

export default defineConfig([
  globalIgnores([
    "**/node_modules/**",
    "**/.next/**",
    "**/.turbo/**",
    "**/dist/**",
    "**/out/**",
    "**/build/**",
    "**/coverage/**",
    "**/next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
    "supabase/.temp/**",
  ]),

  // Baseline for every JS/TS file outside the web app.
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts}"],
    ignores: ["apps/web/**"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
  },
  {
    files: ["scripts/**/*.{js,mjs}", "*.{js,mjs,ts}", "e2e/**/*.ts"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        URL: "readonly",
        Buffer: "readonly",
      },
    },
  },

  // Next.js app: the official Next rules, scoped to apps/web.
  ...[...nextVitals, ...nextTs].map((config) => ({
    ...config,
    files: config.files
      ? config.files.map((f) => `apps/web/${f}`)
      : ["apps/web/**/*.{js,jsx,mjs,ts,tsx,mts}"],
    settings: { ...config.settings, next: { rootDir: "apps/web" } },
  })),

  // Shared rule tweaks.
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },

  // Platform-neutral packages: no Node, React or Next.
  {
    files: [...PURE_PACKAGES, ...CLIENT_PACKAGES],
    rules: {
      "no-restricted-imports": ["error", platformImportBans],
    },
  },

  // Pure packages: additionally no platform globals, no clock, no ambient randomness.
  {
    files: PURE_PACKAGES,
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-globals": ["error", ...browserAndNodeGlobals],
      "no-restricted-properties": ["error", ...determinismProperties],
      "no-restricted-syntax": [
        "error",
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: "new Date() reads the clock. Pass the game date in as data.",
        },
      ],
    },
  },
]);

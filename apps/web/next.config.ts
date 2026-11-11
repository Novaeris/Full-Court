import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Workspace packages ship TypeScript source; Next compiles them.
  transpilePackages: [
    "@fullcourt/api-client",
    "@fullcourt/design-tokens",
    "@fullcourt/game-engine",
    "@fullcourt/game-rules",
    "@fullcourt/game-types",
    "@fullcourt/shared",
    "@fullcourt/validation",
  ],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

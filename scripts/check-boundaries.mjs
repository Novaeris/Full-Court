#!/usr/bin/env node
/**
 * Enforces the monorepo architecture (docs/ARCHITECTURE.md):
 *
 * 1. Dependency direction between @fullcourt/* workspaces.
 * 2. Runtime dependencies allowed in each shared package (pure packages: none).
 * 3. Every bare import in a package's source is declared in its package.json.
 * 4. No Node built-ins in packages that also run on mobile and desktop.
 * 5. The Supabase secret (service-role) key is referenced only in the worker
 *    and the audited admin modules, and never through a NEXT_PUBLIC_ variable.
 *
 * Usage: node scripts/check-boundaries.mjs [rootDir]
 */
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** Which @fullcourt workspaces each package may depend on. Apps may use any package. */
export const ALLOWED_WORKSPACE_DEPS = {
  "@fullcourt/shared": [],
  "@fullcourt/game-types": ["@fullcourt/shared"],
  "@fullcourt/game-rules": ["@fullcourt/shared", "@fullcourt/game-types"],
  "@fullcourt/game-engine": [
    "@fullcourt/shared",
    "@fullcourt/game-types",
    "@fullcourt/game-rules",
  ],
  "@fullcourt/design-tokens": [],
  "@fullcourt/validation": ["@fullcourt/shared", "@fullcourt/game-types"],
  "@fullcourt/api-client": [
    "@fullcourt/shared",
    "@fullcourt/game-types",
    "@fullcourt/validation",
  ],
};

/** Third-party runtime dependencies each package may declare. Pure packages: none. */
export const ALLOWED_EXTERNAL_DEPS = {
  "@fullcourt/shared": [],
  "@fullcourt/game-types": [],
  "@fullcourt/game-rules": [],
  "@fullcourt/game-engine": [],
  "@fullcourt/design-tokens": [],
  "@fullcourt/validation": ["zod"],
  "@fullcourt/api-client": ["@supabase/supabase-js"],
};

/** Paths (relative, forward slashes) allowed to mention the service-role secret. */
const SECRET_KEY_ALLOWED = [
  /^apps\/worker\//,
  /^apps\/web\/src\/server\/admin\//,
  /^docs\//,
  /^\.env\.example$/,
  /^render\.yaml$/,
  // SQL that grants to the service_role database role (not the key itself).
  /^supabase\/(migrations|tests)\//,
  // Git-ignored local secret files.
  /^apps\/web\/\.env\.local$/,
  /^supabase\/\.env$/,
];
const SECRET_KEY_NAMES =
  /\b(SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|service_role)\b/;
const PUBLIC_SECRET =
  /\bNEXT_PUBLIC_[A-Z0-9_]*(SECRET|SERVICE_ROLE)[A-Z0-9_]*\b/;

const SOURCE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".turbo",
  "dist",
  "build",
  "coverage",
  ".git",
]);
const NODE_BUILTINS = new Set(builtinModules);

const IMPORT_PATTERNS = [
  /\bimport\s+(?:type\s+)?(?:[\w*{}\s,]+\s+from\s+)?["']([^"']+)["']/g,
  /\bexport\s+(?:type\s+)?[\w*{}\s,]+\s+from\s+["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
];

const toPosix = (p) => p.split(sep).join("/");

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** Package name of a bare specifier: "zod/v4" -> "zod", "@a/b/c" -> "@a/b". */
function packageOf(specifier) {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

export function importsIn(source) {
  const found = new Set();
  for (const pattern of IMPORT_PATTERNS) {
    for (const match of source.matchAll(pattern)) found.add(match[1]);
  }
  return [...found];
}

function readWorkspaces(root) {
  const workspaces = [];
  for (const group of ["apps", "packages"]) {
    const groupDir = join(root, group);
    if (!existsSync(groupDir)) continue;
    for (const name of readdirSync(groupDir)) {
      const manifestPath = join(groupDir, name, "package.json");
      if (!existsSync(manifestPath)) continue;
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      workspaces.push({ kind: group, dir: join(groupDir, name), manifest });
    }
  }
  return workspaces;
}

/** Returns a list of human-readable violations; empty means the workspace is clean. */
export function checkWorkspace(rootDir) {
  const root = resolve(rootDir);
  const problems = [];
  const workspaces = readWorkspaces(root);
  const appNames = new Set(
    workspaces.filter((w) => w.kind === "apps").map((w) => w.manifest.name),
  );

  for (const ws of workspaces) {
    const name = ws.manifest.name;
    const where = toPosix(relative(root, ws.dir));
    const deps = Object.keys(ws.manifest.dependencies ?? {});
    const declared = new Set([
      ...deps,
      ...Object.keys(ws.manifest.devDependencies ?? {}),
      ...Object.keys(ws.manifest.peerDependencies ?? {}),
    ]);

    // 1 + 2: declared dependencies.
    for (const dep of deps) {
      if (appNames.has(dep)) {
        problems.push(
          `${where}: depends on app "${dep}"; apps are never dependencies.`,
        );
      } else if (ws.kind === "packages") {
        const allowedWs = ALLOWED_WORKSPACE_DEPS[name];
        const allowedExt = ALLOWED_EXTERNAL_DEPS[name];
        if (!allowedWs || !allowedExt) {
          problems.push(
            `${where}: "${name}" is not registered in scripts/check-boundaries.mjs.`,
          );
          break;
        }
        if (dep.startsWith("@fullcourt/")) {
          if (!allowedWs.includes(dep)) {
            problems.push(
              `${where}: "${name}" may not depend on "${dep}" (dependency direction).`,
            );
          }
        } else if (!allowedExt.includes(dep)) {
          problems.push(
            `${where}: runtime dependency "${dep}" is not allowed in "${name}".`,
          );
        }
      }
    }

    // 3 + 4: imports in source files (tests may use their dev dependencies).
    const srcFiles = walk(join(ws.dir, "src")).filter((f) =>
      SOURCE_EXT.test(f),
    );
    for (const file of srcFiles) {
      const rel = toPosix(relative(root, file));
      const isTest = /\.test\.[cm]?[jt]sx?$/.test(file);
      for (const specifier of importsIn(readFileSync(file, "utf8"))) {
        if (specifier.startsWith(".") || specifier.startsWith("@/")) continue;
        const isBuiltin =
          specifier.startsWith("node:") ||
          NODE_BUILTINS.has(packageOf(specifier));
        if (isBuiltin) {
          if (ws.kind === "packages" && !isTest) {
            problems.push(
              `${rel}: imports Node built-in "${specifier}"; packages must run on every platform.`,
            );
          }
          continue;
        }
        const pkg = packageOf(specifier);
        if (pkg === name) continue;
        if (appNames.has(pkg)) {
          problems.push(
            `${rel}: imports app "${pkg}"; apps are never imported.`,
          );
          continue;
        }
        const runtimeDeclared = new Set(deps);
        if (
          isTest
            ? !declared.has(pkg)
            : !runtimeDeclared.has(pkg) &&
              !(ws.kind === "apps" && declared.has(pkg))
        ) {
          problems.push(
            `${rel}: imports "${pkg}", which ${where}/package.json does not declare.`,
          );
        }
      }
    }
  }

  // 5: service-role secret references anywhere in the repo.
  for (const file of walk(root)) {
    const rel = toPosix(relative(root, file));
    if (
      !/\.(ts|tsx|mts|js|mjs|cjs|jsx|json|ya?ml|toml|md|sql|env)$/.test(rel) &&
      !rel.includes(".env")
    )
      continue;
    // The lockfile, and this checker and its tests (which name the patterns on purpose).
    if (
      [
        "pnpm-lock.yaml",
        "scripts/check-boundaries.mjs",
        "scripts/scan-bundle.mjs",
        "scripts/tooling.test.mjs",
      ].includes(rel)
    )
      continue;
    const text = readFileSync(file, "utf8");
    if (PUBLIC_SECRET.test(text)) {
      problems.push(
        `${rel}: a NEXT_PUBLIC_ variable looks like a secret; public variables reach the browser.`,
      );
    }
    if (
      SECRET_KEY_NAMES.test(text) &&
      !SECRET_KEY_ALLOWED.some((re) => re.test(rel))
    ) {
      problems.push(
        `${rel}: mentions the Supabase secret key; only apps/worker and apps/web/src/server/admin may use it.`,
      );
    }
  }

  return problems;
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root =
    process.argv[2] ?? join(fileURLToPath(new URL(".", import.meta.url)), "..");
  const problems = checkWorkspace(root);
  if (problems.length > 0) {
    console.error(`Architecture boundary check failed (${problems.length}):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log("Architecture boundaries OK.");
}

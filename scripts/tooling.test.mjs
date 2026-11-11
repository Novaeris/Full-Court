import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkWorkspace } from "./check-boundaries.mjs";
import { findSecrets } from "./scan-secrets.mjs";

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

/** Builds a throwaway workspace from { "path": contents } (objects become JSON). */
function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), "fc-boundaries-"));
  roots.push(root);
  for (const [path, contents] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(
      full,
      typeof contents === "string" ? contents : JSON.stringify(contents),
    );
  }
  return root;
}

const engine = (deps, source) => ({
  "packages/game-engine/package.json": {
    name: "@fullcourt/game-engine",
    dependencies: deps,
  },
  "packages/game-engine/src/index.ts": source,
});

describe("check-boundaries", () => {
  it("passes a clean workspace", () => {
    const root = fixture({
      ...engine(
        { "@fullcourt/shared": "workspace:*" },
        'import { ok } from "@fullcourt/shared";\n',
      ),
      "packages/shared/package.json": { name: "@fullcourt/shared" },
      "packages/shared/src/index.ts": "export const ok = 1;\n",
    });
    expect(checkWorkspace(root)).toEqual([]);
  });

  it("fails when the engine depends on React", () => {
    const root = fixture(
      engine({ react: "19.0.0" }, 'import { useState } from "react";\n'),
    );
    const problems = checkWorkspace(root);
    expect(problems.some((p) => p.includes('runtime dependency "react"'))).toBe(
      true,
    );
  });

  it("fails on an undeclared import", () => {
    const root = fixture(
      engine({}, 'import { createClient } from "@supabase/supabase-js";\n'),
    );
    expect(checkWorkspace(root).join("\n")).toContain("does not declare");
  });

  it("fails on a Node built-in in a package", () => {
    const root = fixture(
      engine({}, 'import { readFileSync } from "node:fs";\n'),
    );
    expect(checkWorkspace(root).join("\n")).toContain("Node built-in");
  });

  it("fails on a reversed dependency direction", () => {
    const root = fixture({
      "packages/shared/package.json": {
        name: "@fullcourt/shared",
        dependencies: { "@fullcourt/game-engine": "workspace:*" },
      },
    });
    expect(checkWorkspace(root).join("\n")).toContain("dependency direction");
  });

  it("fails when a package depends on an app", () => {
    const root = fixture({
      "apps/web/package.json": { name: "@fullcourt/web" },
      ...engine({ "@fullcourt/web": "workspace:*" }, ""),
    });
    expect(checkWorkspace(root).join("\n")).toContain(
      "apps are never dependencies",
    );
  });

  it("fails when the secret key appears outside the allowed paths", () => {
    const root = fixture({
      "apps/web/package.json": { name: "@fullcourt/web" },
      "apps/web/src/app/page.tsx":
        "const k = process.env.SUPABASE_SECRET_KEY;\n",
      "apps/web/src/server/admin/client.ts":
        "const k = process.env.SUPABASE_SECRET_KEY;\n",
    });
    const problems = checkWorkspace(root);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("apps/web/src/app/page.tsx");
  });

  it("fails on a NEXT_PUBLIC_ secret", () => {
    const root = fixture({
      "apps/web/.env.local": "NEXT_PUBLIC_SUPABASE_SECRET_KEY=x\n",
    });
    expect(checkWorkspace(root).join("\n")).toContain("NEXT_PUBLIC_");
  });
});

describe("scan-secrets", () => {
  const fakeJwt = [
    "eyJhbGciOiJIUzI1NiJ9",
    "eyJyb2xlIjoic2VydmljZV9yb2xlIn0",
    "abcdefghijklmnop",
  ].join(".");

  it("finds a JWT", () => {
    expect(findSecrets(`KEY=${fakeJwt}`)).toHaveLength(1);
  });

  it("finds a Supabase secret key and a database password", () => {
    expect(findSecrets("sb_secret_" + "abcdefghijklmnop")).toHaveLength(1);
    expect(
      findSecrets(
        "postgresql://postgres.x:" +
          "hunter22secret@db.example.com:5432/postgres",
      ),
    ).toHaveLength(1);
  });

  it("allows the local Supabase default and opted-out lines", () => {
    expect(
      findSecrets("postgresql://postgres:postgres@127.0.0.1:54322/postgres"),
    ).toEqual([]);
    expect(findSecrets(`KEY=${fakeJwt} # secret-scan:allow`)).toEqual([]);
  });

  it("ignores ordinary text", () => {
    expect(
      findSecrets("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=replace-me"),
    ).toEqual([]);
  });
});

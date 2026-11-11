#!/usr/bin/env node
/**
 * Fails if a server secret reached the browser bundle. Run after `next build`
 * (the Render build and the e2e web server both do).
 *
 * Looks in apps/web/.next/static (everything shipped to browsers) for:
 * - Supabase secret keys (sb_secret_…)
 * - JWTs whose payload claims the service_role
 * - the literal value of SUPABASE_SECRET_KEY, when it is set in this environment
 *
 *   node scripts/scan-bundle.mjs [dir]
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const JWT =
  /eyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g;

function decodePayload(segment) {
  try {
    const json = Buffer.from(segment, "base64url").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Returns a description of each secret found in `text`. */
export function findBundleSecrets(text, secretValue = "") {
  const hits = [];
  if (/sb_secret_[A-Za-z0-9_-]{10,}/.test(text)) {
    hits.push("Supabase secret key (sb_secret_…)");
  }
  for (const match of text.matchAll(JWT)) {
    const payload = decodePayload(match[1]);
    if (payload?.role === "service_role") {
      hits.push("service_role JWT");
    }
  }
  if (secretValue && secretValue.length >= 16 && text.includes(secretValue)) {
    hits.push("the value of SUPABASE_SECRET_KEY");
  }
  return hits;
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(js|mjs|json|html|css|map|txt)$/.test(entry)) out.push(full);
  }
  return out;
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
  const dir = resolve(process.argv[2] ?? join(root, "apps/web/.next/static"));
  if (!existsSync(dir)) {
    console.error(`No build output at ${dir}. Run the build first.`);
    process.exit(1);
  }
  const secret = process.env.SUPABASE_SECRET_KEY ?? "";
  const findings = [];
  const files = walk(dir);
  for (const file of files) {
    for (const hit of findBundleSecrets(readFileSync(file, "utf8"), secret)) {
      findings.push(`${file}: ${hit}`);
    }
  }
  if (findings.length > 0) {
    console.error("Server secrets found in the browser bundle:");
    for (const f of findings) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`Browser bundle scan OK (${files.length} files).`);
}

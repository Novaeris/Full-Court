#!/usr/bin/env node
/**
 * Blocks credentials from reaching this public repository.
 *
 *   node scripts/scan-secrets.mjs           scan every tracked and untracked (not ignored) file
 *   node scripts/scan-secrets.mjs --staged  scan only what is staged (pre-commit hook)
 *
 * A line can opt out with the comment `secret-scan:allow` (for documented fake values only).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const RULES = [
  {
    name: "JSON Web Token (e.g. a Supabase anon or service-role key)",
    pattern: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  },
  { name: "Supabase secret key", pattern: /\bsb_secret_[A-Za-z0-9_-]{10,}/ },
  { name: "Supabase personal access token", pattern: /\bsbp_[A-Za-z0-9]{20,}/ },
  { name: "Render API key", pattern: /\brnd_[A-Za-z0-9]{20,}/ },
  {
    name: "GitHub token",
    pattern: /\b(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/,
  },
  { name: "Private key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "Resend API key", pattern: /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}/ },
  {
    name: "Database URL with a password",
    // Allows the well-known local Supabase default (postgres:postgres on localhost).
    pattern:
      /postgres(?:ql)?:\/\/[^:\s/]+:(?!postgres@(?:127\.0\.0\.1|localhost))[^@\s]{6,}@/,
  },
];

const SKIP = [
  /^pnpm-lock\.yaml$/,
  /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|pdf|zip)$/i,
];
const ALLOW = "secret-scan:allow";

export function findSecrets(text) {
  const hits = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (line.includes(ALLOW)) return;
    for (const rule of RULES) {
      if (rule.pattern.test(line))
        hits.push({ line: index + 1, rule: rule.name });
    }
  });
  return hits;
}

function git(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function filesToScan(root, staged) {
  const out = staged
    ? git(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"], root)
    : git(
        ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        root,
      );
  return out.split("\0").filter(Boolean);
}

function contentOf(root, file, staged) {
  if (staged) return git(["show", `:${file}`], root);
  const full = resolve(root, file);
  try {
    if (statSync(full).size > 5 * 1024 * 1024) return "";
    return readFileSync(full, "utf8");
  } catch {
    return ""; // deleted in the working tree
  }
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
  const staged = process.argv.includes("--staged");
  const findings = [];
  for (const file of filesToScan(root, staged)) {
    if (SKIP.some((re) => re.test(file))) continue;
    for (const hit of findSecrets(contentOf(root, file, staged))) {
      findings.push(`${file}:${hit.line}  ${hit.rule}`);
    }
  }
  if (findings.length > 0) {
    console.error(
      "Possible secrets found. This repository is public; remove them before committing:",
    );
    for (const f of findings) console.error(`  - ${f}`);
    console.error(
      `If a value is a documented fake, add "${ALLOW}" to that line.`,
    );
    process.exit(1);
  }
  console.log(
    `Secret scan OK (${staged ? "staged changes" : "working tree"}).`,
  );
}

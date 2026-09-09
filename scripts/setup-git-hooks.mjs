#!/usr/bin/env node
/** Configura core.hooksPath=.githooks neste clone (git config local). */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const gitDir = join(ROOT, ".git");

if (!existsSync(gitDir)) {
  console.log("setup-git-hooks: não é um repositório git — ignorado.");
  process.exit(0);
}

const res = spawnSync("git", ["config", "core.hooksPath", ".githooks"], {
  cwd: ROOT,
  encoding: "utf8",
});

if (res.status !== 0) {
  console.warn("setup-git-hooks: falhou ao configurar core.hooksPath.");
  process.exit(res.status ?? 1);
}

console.log("Git hooks: .githooks/pre-commit → npm run security-check -- --staged");

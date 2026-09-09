#!/usr/bin/env node
/**
 * Bloqueia commit de .env, data/, credenciais e padrões óbvios de segredo.
 * Uso: node scripts/security-check.mjs [--staged|--all]
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv.includes("--all") ? "all" : "staged";

const PLACEHOLDER_VALUES = new Set([
  "",
  "troque-me",
  "your-password",
  "cole-no-.env-nao-aqui",
  "change-me",
  "xxx",
  "changeme",
]);

/** @type {Array<{ test: (p: string) => boolean; reason: string }>} */
const PATH_RULES = [
  {
    test: (p) => p === ".env" || (p.startsWith(".env.") && p !== ".env.example"),
    reason: "arquivo .env (use .env.example sem valores reais)",
  },
  {
    test: (p) => p === "mcp.json",
    reason: "mcp.json local (use mcp.example.json)",
  },
  {
    test: (p) => p.startsWith("data/"),
    reason: "pasta data/ (credenciais, settings, evidências de run)",
  },
  {
    test: (p) => p.includes("/.auth/") || p.startsWith(".auth/"),
    reason: "sessão Playwright (.auth/)",
  },
  {
    test: (p) => /\.pem$/i.test(p),
    reason: "certificado/chave .pem",
  },
  {
    test: (p) => /(^|\/)settings\.json$/i.test(p) && !p.startsWith("templates/"),
    reason: "settings.json com config local",
  },
  {
    test: (p) => {
      if (!/(^|\/)credenciais\.(md|json)$/i.test(p)) return false;
      if (p.startsWith("templates/")) return false;
      if (/example/i.test(p)) return false;
      return true;
    },
    reason: "credenciais.md / credenciais.json (use templates/credenciais.example.md)",
  },
];

const CONTENT_RULES = [
  { name: "OpenAI-style key", re: /\bsk-[a-zA-Z0-9]{20,}\b/ },
  { name: "GitHub PAT", re: /\bghp_[a-zA-Z0-9]{36,}\b/ },
  { name: "Slack token", re: /\bxox[baprs]-[a-zA-Z0-9-]{10,}\b/ },
  {
    name: "Discord webhook",
    re: /https:\/\/discord(?:app)?\.com\/api\/webhooks\/\d+\/[a-zA-Z0-9_-]{20,}/,
  },
];

const ENV_SECRET_KEYS = [
  "LLM_API_KEY",
  "CURSOR_API_KEY",
  "QA_AGENT_TOKEN",
  "DISCORD_WEBHOOK_URL",
  "WEBHOOK_URL",
];

function normPath(raw) {
  return normalize(raw).replace(/\\/g, "/").replace(/^\.\//, "");
}

function git(args) {
  return spawnSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
}

function listFiles() {
  if (mode === "staged") {
    const res = git(["diff", "--cached", "--name-only", "--diff-filter=ACMR"]);
    if (res.status !== 0) return [];
    return res.stdout.trim().split("\n").filter(Boolean).map(normPath);
  }
  const res = git(["ls-files", "-co", "--exclude-standard"]);
  if (res.status !== 0) return [];
  return [...new Set(res.stdout.trim().split("\n").filter(Boolean).map(normPath))];
}

function isContentScanSkipped(path) {
  if (path === ".env.example") return true;
  if (path.startsWith("templates/")) return true;
  if (/example/i.test(path)) return true;
  if (path.endsWith(".png") || path.endsWith(".jpg") || path.endsWith(".pdf")) return true;
  return false;
}

function readStagedContent(path) {
  const res = git(["show", `:${path}`]);
  if (res.status === 0 && res.stdout != null) return res.stdout;
  const abs = join(ROOT, path);
  if (existsSync(abs)) {
    try {
      return readFileSync(abs, "utf8");
    } catch {
      return null;
    }
  }
  return null;
}

function envLineLooksSecret(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return false;
  for (const key of ENV_SECRET_KEYS) {
    const m = trimmed.match(new RegExp(`^${key}\\s*=\\s*(.*)$`, "i"));
    if (!m) continue;
    const val = m[1].trim().replace(/^["']|["']$/g, "");
    if (PLACEHOLDER_VALUES.has(val.toLowerCase())) continue;
    if (val.length >= 8) return true;
  }
  return false;
}

function checkPaths(files) {
  /** @type {Array<{ path: string; reason: string }>} */
  const hits = [];
  for (const path of files) {
    for (const rule of PATH_RULES) {
      if (rule.test(path)) {
        hits.push({ path, reason: rule.reason });
        break;
      }
    }
  }
  return hits;
}

function checkContent(files) {
  /** @type {Array<{ path: string; detail: string }>} */
  const hits = [];
  for (const path of files) {
    if (isContentScanSkipped(path)) continue;
    const text = readStagedContent(path);
    if (text == null || typeof text !== "string") continue;

    for (const rule of CONTENT_RULES) {
      if (rule.re.test(text)) {
        hits.push({ path, detail: rule.name });
        break;
      }
    }
    if (hits.some((h) => h.path === path)) continue;

    for (const line of text.split("\n")) {
      if (envLineLooksSecret(line)) {
        hits.push({ path, detail: "variável de ambiente com valor preenchido" });
        break;
      }
    }
  }
  return hits;
}

function main() {
  if (!existsSync(join(ROOT, ".git"))) {
    console.log("security-check: não é um repositório git — nada a verificar.");
    process.exit(0);
  }

  const files = listFiles();
  if (!files.length) {
    console.log(`security-check (${mode}): ok (nenhum arquivo).`);
    process.exit(0);
  }

  const pathHits = checkPaths(files);
  const contentHits = checkContent(files);

  if (!pathHits.length && !contentHits.length) {
    console.log(`security-check (${mode}): ok (${files.length} arquivo(s)).`);
    process.exit(0);
  }

  console.error(`\nsecurity-check (${mode}): BLOQUEADO — possível segredo ou arquivo sensível.\n`);
  for (const h of pathHits) {
    console.error(`  ✗ ${h.path} — ${h.reason}`);
  }
  for (const h of contentHits) {
    console.error(`  ✗ ${h.path} — ${h.detail}`);
  }
  console.error("\nRemova do stage (git restore --staged <arquivo>) ou use git commit --no-verify só se tiver certeza.");
  console.error("Detalhes: SECURITY.md e CONTRIBUTING.md\n");
  process.exit(1);
}

main();

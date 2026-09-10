import { config as loadDotenv } from "dotenv";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SettingSource } from "@cursor/sdk";
import { detectWebhookProvider, type WebhookProvider } from "./webhook.ts";
import { parseLlmProvider } from "./llm/presets.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
loadDotenv({ path: join(root, ".env") });

function env(name: string, fallback = ""): string {
  return (process.env[name] ?? fallback).trim();
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = env(name);
  if (!raw) return fallback;
  return ["1", "true", "yes", "sim"].includes(raw.toLowerCase());
}

function envSources(): SettingSource[] {
  const allowed = new Set<SettingSource>(["project", "user", "team", "mdm", "plugins", "all"]);
  const raw = env("SETTING_SOURCES") || "project";
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is SettingSource => allowed.has(s as SettingSource));
  return list.length ? list : ["project"];
}

export const ROOT = root;

function snapshot() {
  const providerRaw = env("LLM_PROVIDER", "cursor").toLowerCase();
    const llmProvider = parseLlmProvider(providerRaw);
  const llmApiKey = env("LLM_API_KEY") || env("CURSOR_API_KEY");
  const llmModel = env("LLM_MODEL") || env("CURSOR_MODEL", "composer-2.5");
  return {
    host: env("HOST", "127.0.0.1"),
    port: Number(env("PORT", "8787")) || 8787,
    llmProvider,
    llmApiKey,
    llmBaseUrl: env("LLM_BASE_URL", "https://api.openai.com/v1"),
    llmModel,
    cursorApiKey: llmApiKey,
    cursorModel: llmModel,
    playwrightGrep: env("PLAYWRIGHT_GREP", "@executavel"),
    autoResumeOnTeste: envBool("AUTO_RESUME_ON_TESTE", true),
    strictCoverage: envBool("STRICT_COVERAGE", false),
    autoDowngradeStubs: envBool("AUTO_DOWNGRADE_STUBS", true),
    deepenLimit: Math.max(1, Number(env("DEEPEN_LIMIT", "15")) || 15),
    testeResumeLimit: Math.max(1, Number(env("TESTE_RESUME_LIMIT", "5")) || 5),
    continueOnProduto: envBool("CONTINUE_ON_PRODUTO", true),
    retestQuarantine: envBool("RETEST_QUARANTINE", false),
    massaUnblockLimit: Math.max(1, Number(env("MASSA_UNBLOCK_LIMIT", "5")) || 5),
    massaGenerateLimit: Math.max(0, Number(env("MASSA_GENERATE_LIMIT", "10")) || 10),
    massaApplyLimit: Math.max(0, Number(env("MASSA_APPLY_LIMIT", "5")) || 5),
    massaGenerateEnabled: envBool("MASSA_GENERATE_ENABLED", true),
    massaFile: env("MASSA_FILE"),
    crawlDepth: Math.max(5, Number(env("CRAWL_DEPTH", "35")) || 35),
    escopoFile: env("QA_ESCOPO") || env("ESCOPO_FILE"),
    escopoModo: env("QA_ESCOPO_MODO") || env("ESCOPO_MODO"),
    escopoLabels: env("QA_ESCOPO_LABELS") || env("ESCOPO_LABELS"),
    escopoPaths: env("QA_ESCOPO_PATHS") || env("ESCOPO_PATHS"),
    playwrightHeaded: envBool("PLAYWRIGHT_HEADED", false),
    playwrightVideo: env("PLAYWRIGHT_VIDEO", "off") || "off",
    tourEnabled: envBool("TOUR_ENABLED", true),
    tourHeaded: envBool("TOUR_HEADED", true),
    tourMaxActions: Math.max(5, Number(env("TOUR_MAX_ACTIONS", "40")) || 40),
    tourSlowMo: Math.max(0, Number(env("TOUR_SLOWMO", "200")) || 200),
    k6Enabled: envBool("K6_ENABLED", false),
    k6Strict: envBool("K6_STRICT", false),
    k6Vus: Math.max(1, Number(env("K6_VUS", "1")) || 1),
    k6Duration: env("K6_DURATION", "30s") || "30s",
    qaAgentToken: env("QA_AGENT_TOKEN"),
    settingSources: envSources(),
    dataDir: join(root, "data"),
    workspaceDir: join(root, "data", "workspace"),
    mcpPath: join(root, "mcp.json"),
    discordWebhookUrl: env("DISCORD_WEBHOOK_URL"),
    webhookUrl: env("WEBHOOK_URL") || env("DISCORD_WEBHOOK_URL"),
    webhookProvider: (() => {
      const raw = env("WEBHOOK_PROVIDER").toLowerCase();
      const allowed = new Set(["discord", "slack", "teams", "generic"]);
      if (allowed.has(raw)) return raw as WebhookProvider;
      const url = env("WEBHOOK_URL") || env("DISCORD_WEBHOOK_URL");
      return url ? detectWebhookProvider(url) : ("generic" as WebhookProvider);
    })(),
    locale: env("QA_LOCALE", "pt-BR"),
  };
}

export const config = snapshot();

/** Relê process.env para o objeto `config` (depois de upsert no .env / wizard). */
export function refreshConfig(): void {
  Object.assign(config, snapshot());
}

export function resolveRequisitosPath(input?: string): string {
  const path = (input ?? "").trim();
  if (!path) {
    throw new Error("Informe a pasta de requisitos (CLI ou requisitosPath no POST)");
  }
  return isAbsolute(path) ? path : join(process.cwd(), path);
}

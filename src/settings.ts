import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.ts";
import { parseLocale, type Locale } from "./i18n.ts";
import type { WebhookProvider } from "./webhook.ts";
import { parseLlmProvider } from "./llm/presets.ts";
import type { LlmProvider } from "./llm/types.ts";
import type { AuthKind } from "./types.ts";

export type AppSettings = {
  locale?: Locale;
  llmProvider?: LlmProvider;
  llmBaseUrl?: string;
  cursorModel?: string;
  requisitosPath?: string;
  baseUrl?: string;
  authKind?: AuthKind;
  credentialsMd?: string;
  credentialsSource?: "manual" | "file";
  playwrightGrep?: string;
  autoResumeOnTeste?: boolean;
  k6Enabled?: boolean;
  massaGenerateEnabled?: boolean;
  tourEnabled?: boolean;
  continueOnProduto?: boolean;
  retestQuarantine?: boolean;
  playwrightHeaded?: boolean;
  runAllOptional?: boolean;
  webhookEnabled?: boolean;
  webhookProvider?: WebhookProvider;
  /** @deprecated */
  discordEnabled?: boolean;
  /** Slug em data/projects/<slug>/ (scripts, massa, relatórios). */
  project?: string;
};

function settingsPath(): string {
  return join(config.dataDir, "settings.json");
}

function legacySessionPath(): string {
  return join(config.workspaceDir, "session.json");
}

function readJson(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function loadSettings(): AppSettings {
  const fromLegacy = existsSync(legacySessionPath()) ? readJson(legacySessionPath()) : {};
  const fromFile = existsSync(settingsPath()) ? readJson(settingsPath()) : {};
  const raw = { ...fromLegacy, ...fromFile };
  const authKind = raw.authKind === "cpf" || raw.authKind === "email" ? raw.authKind : undefined;
  const provider = typeof raw.llmProvider === "string" ? parseLlmProvider(raw.llmProvider) : undefined;
  return {
    locale: parseLocale(raw.locale),
    llmProvider: provider,
    llmBaseUrl: typeof raw.llmBaseUrl === "string" ? raw.llmBaseUrl : undefined,
    cursorModel: typeof raw.cursorModel === "string" ? raw.cursorModel : undefined,
    requisitosPath: typeof raw.requisitosPath === "string" ? raw.requisitosPath : undefined,
    baseUrl: typeof raw.baseUrl === "string" ? raw.baseUrl : undefined,
    authKind,
    credentialsMd: typeof raw.credentialsMd === "string" ? raw.credentialsMd : undefined,
    credentialsSource:
      raw.credentialsSource === "file" || raw.credentialsSource === "manual"
        ? raw.credentialsSource
        : undefined,
    playwrightGrep: typeof raw.playwrightGrep === "string" ? raw.playwrightGrep : undefined,
    autoResumeOnTeste:
      typeof raw.autoResumeOnTeste === "boolean" ? raw.autoResumeOnTeste : undefined,
    k6Enabled: typeof raw.k6Enabled === "boolean" ? raw.k6Enabled : undefined,
    continueOnProduto:
      typeof raw.continueOnProduto === "boolean" ? raw.continueOnProduto : undefined,
    retestQuarantine: typeof raw.retestQuarantine === "boolean" ? raw.retestQuarantine : undefined,
    massaGenerateEnabled:
      typeof raw.massaGenerateEnabled === "boolean" ? raw.massaGenerateEnabled : undefined,
    tourEnabled: typeof raw.tourEnabled === "boolean" ? raw.tourEnabled : undefined,
    playwrightHeaded: typeof raw.playwrightHeaded === "boolean" ? raw.playwrightHeaded : undefined,
    runAllOptional: typeof raw.runAllOptional === "boolean" ? raw.runAllOptional : undefined,
    webhookEnabled:
      typeof raw.webhookEnabled === "boolean"
        ? raw.webhookEnabled
        : typeof raw.discordEnabled === "boolean"
          ? raw.discordEnabled
          : undefined,
    webhookProvider:
      raw.webhookProvider === "discord" ||
      raw.webhookProvider === "slack" ||
      raw.webhookProvider === "teams" ||
      raw.webhookProvider === "generic"
        ? raw.webhookProvider
        : undefined,
    discordEnabled: typeof raw.discordEnabled === "boolean" ? raw.discordEnabled : undefined,
    project: typeof raw.project === "string" ? raw.project : undefined,
  };
}

export function saveSettings(settings: AppSettings): void {
  mkdirSync(config.dataDir, { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify(settings, null, 2) + "\n", "utf8");
}

export function hasCompleteSetup(settings: AppSettings, apiKey: string): boolean {
  return Boolean(apiKey && settings.cursorModel && settings.requisitosPath && settings.baseUrl && settings.authKind);
}

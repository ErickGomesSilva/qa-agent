import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { config, refreshConfig } from "./config.ts";
import { listLlmModels, validateLlmAuth } from "./llm/run.ts";
import type { LlmModel, LlmProvider } from "./llm/types.ts";
import {
  formatCredenciaisMdMulti,
  mergeMultiCredentials,
  multiCredentialsOk,
  placeholderSenha,
  readMultiCredenciaisFile,
  readMultiCredenciaisFromPath,
  resolveCredentialsFilePath,
} from "./credentials.ts";
import { upsertEnv } from "./envfile.ts";
import {
  detectWebhookProvider,
  isValidWebhookUrl,
  webhookProviderLabel,
  type WebhookProvider,
} from "./webhook.ts";
import { getLocale, parseLocale, setLocale, t, type Locale } from "./i18n.ts";
import { loadSettings, saveSettings, type AppSettings } from "./settings.ts";
import type { AccessCredential, AuthKind, CreateRunBody } from "./types.ts";
import { credenciaisPath, ensureWorkspace, listSpecFiles, scriptsDir } from "./workspace.ts";
import { listAllReports } from "./coverage-list.ts";

export type StepId =
  | "chave"
  | "modelo"
  | "requisitos"
  | "url"
  | "credenciais"
  | "webhook"
  | "opcoes"
  | "app"
  | "resumos";

export type EvidenceEntry = {
  at: string;
  step: StepId;
  text: string;
};

export type StepView = {
  id: StepId;
  f: number;
  title: string;
  done: boolean;
  summary: string;
};

function evidencePath(): string {
  return join(config.dataDir, "evidence.json");
}

export function applySavedSettings(): void {
  const s = loadSettings();
  const locale = s.locale ?? parseLocale(process.env.QA_LOCALE) ?? parseLocale(config.locale) ?? "pt-BR";
  setLocale(locale);
  process.env.QA_LOCALE = locale;
  if (s.llmProvider) process.env.LLM_PROVIDER = s.llmProvider;
  if (s.llmBaseUrl) process.env.LLM_BASE_URL = s.llmBaseUrl;
  if (s.cursorModel) {
    process.env.CURSOR_MODEL = s.cursorModel;
    process.env.LLM_MODEL = s.cursorModel;
  }
  if (s.playwrightGrep !== undefined) process.env.PLAYWRIGHT_GREP = s.playwrightGrep;
  if (s.autoResumeOnTeste !== undefined) {
    process.env.AUTO_RESUME_ON_TESTE = s.autoResumeOnTeste ? "true" : "false";
  }
  if (s.k6Enabled !== undefined) {
    process.env.K6_ENABLED = s.k6Enabled ? "true" : "false";
  }
  if (s.massaGenerateEnabled !== undefined) {
    process.env.MASSA_GENERATE_ENABLED = s.massaGenerateEnabled ? "true" : "false";
  }
  if (s.tourEnabled !== undefined) {
    process.env.TOUR_ENABLED = s.tourEnabled ? "true" : "false";
  }
  if (s.playwrightHeaded !== undefined) {
    process.env.PLAYWRIGHT_HEADED = s.playwrightHeaded ? "true" : "false";
    process.env.TOUR_HEADED = s.playwrightHeaded ? "true" : "false";
    process.env.PLAYWRIGHT_VIDEO = s.playwrightHeaded ? "on" : "off";
  }
  refreshConfig();
}

export function patchSettings(partial: Partial<AppSettings>): AppSettings {
  const next = { ...loadSettings(), ...partial };
  saveSettings(next);
  return next;
}

export function maskSecret(value: string): string {
  const v = value.trim();
  if (!v) return t("common.empty");
  if (v.length <= 8) return "********";
  return `${v.slice(0, 4)}...${v.slice(-4)}`;
}

export function requireDir(path: string, label: string): string {
  if (!path.trim()) throw new Error(t("err.needDir", { label: label.toLowerCase() }));
  const abs = isAbsolute(path) ? path : resolve(path);
  if (!existsSync(abs) || !statSync(abs).isDirectory()) {
    throw new Error(t("err.notDir", { label, path: abs }));
  }
  return abs;
}

export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      throw new Error(t("url.needHttp"));
    }
    return u.toString();
  } catch (err) {
    if (err instanceof Error && err.message.includes("http")) throw err;
    throw new Error(t("url.invalid", { raw }));
  }
}

export function isDiscordWebhook(url: string): boolean {
  return url.startsWith("https://discord.com/api/webhooks/");
}

export function parseWebhookProvider(raw: string): WebhookProvider | undefined {
  const v = raw.trim().toLowerCase();
  if (v === "discord" || v === "slack" || v === "teams" || v === "generic") return v;
  return undefined;
}

export function readEvidence(): EvidenceEntry[] {
  const path = evidencePath();
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as EvidenceEntry[];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function addEvidence(step: StepId, text: string): EvidenceEntry {
  mkdirSync(config.dataDir, { recursive: true });
  const entry: EvidenceEntry = { at: new Date().toISOString(), step, text };
  const all = [...readEvidence(), entry];
  const kept = all.slice(-200);
  writeFileSync(evidencePath(), JSON.stringify(kept, null, 2) + "\n", "utf8");
  return entry;
}

export function evidenceFor(step: StepId, limit = 8): EvidenceEntry[] {
  const aliases: string[] =
    step === "webhook" ? ["webhook", "discord"] : [step];
  return readEvidence()
    .filter((e) => aliases.includes(e.step))
    .slice(-limit);
}

function activeCredentialsPath(): string {
  const s = loadSettings();
  return s.credentialsMd || credenciaisPath();
}

function credsOk(): {
  ok: boolean;
  authKind?: AuthKind;
  login?: string;
  accessCount?: number;
  source?: "manual" | "file";
  filePath?: string;
} {
  const s = loadSettings();
  const path = activeCredentialsPath();
  const status = multiCredentialsOk(path);
  if (!status.ok) return { ok: false };
  return {
    ok: true,
    authKind: status.primaryAuthKind,
    login: status.primaryLogin,
    accessCount: status.accessCount,
    source: s.credentialsSource ?? "manual",
    filePath: s.credentialsSource === "file" ? path : undefined,
  };
}

export function getSteps(): StepView[] {
  const s = loadSettings();
  const creds = credsOk();
  const webhookTouched = typeof s.webhookEnabled === "boolean" || Boolean(config.webhookUrl);
  return [
    {
      id: "chave",
      f: 1,
      title: t("tab.chave"),
      done: Boolean(config.llmApiKey),
      summary: config.llmApiKey
        ? `${config.llmProvider} ${maskSecret(config.llmApiKey)}`
        : t("common.pending"),
    },
    {
      id: "modelo",
      f: 2,
      title: t("tab.modelo"),
      done: Boolean(config.llmModel),
      summary: config.llmModel || t("common.pending"),
    },
    {
      id: "requisitos",
      f: 3,
      title: t("tab.requisitos"),
      done: Boolean(s.requisitosPath && existsSync(s.requisitosPath)),
      summary: s.requisitosPath || t("common.pending"),
    },
    {
      id: "url",
      f: 4,
      title: t("tab.url"),
      done: Boolean(s.baseUrl),
      summary: s.baseUrl || t("common.pending"),
    },
    {
      id: "credenciais",
      f: 5,
      title: t("tab.credenciais"),
      done: creds.ok,
      summary: creds.ok
        ? creds.source === "file" && creds.filePath
          ? t("creds.summaryFile", { n: creds.accessCount ?? 1, path: creds.filePath })
          : creds.accessCount && creds.accessCount > 1
            ? t("creds.summaryMulti", { n: creds.accessCount, login: creds.login ?? "" })
            : `${creds.authKind === "cpf" ? t("creds.cpf") : t("step.email")} ${creds.login}`
        : t("common.pending"),
    },
    {
      id: "webhook",
      f: 6,
      title: t("tab.webhook"),
      done: webhookTouched,
      summary: config.webhookUrl
        ? t("step.webhook", {
            provider: webhookProviderLabel(config.webhookProvider),
            mask: maskSecret(config.webhookUrl),
          })
        : webhookTouched
          ? t("common.off")
          : t("common.pendingOptional"),
    },
    {
      id: "opcoes",
      f: 7,
      title: t("tab.opcoes"),
      done: true,
      summary: t("step.opcoes", {
        all: (s.runAllOptional ?? (config.k6Enabled && config.massaGenerateEnabled && config.tourEnabled && config.playwrightHeaded))
          ? t("common.yes")
          : t("common.no"),
        k6: config.k6Enabled ? t("common.yes") : t("common.no"),
        massa: config.massaGenerateEnabled ? t("common.yes") : t("common.no"),
        tour: config.tourEnabled ? t("common.yes") : t("common.no"),
      }),
    },
    {
      id: "app",
      f: 8,
      title: t("tab.app"),
      done: false,
      summary: t("step.specs", { n: listSpecFiles().length }),
    },
    {
      id: "resumos",
      f: 9,
      title: t("tab.resumos"),
      done: true,
      summary: t("step.reports", { n: listAllReports().length }),
    },
  ];
}

export function seedEvidenceFromDisk(): void {
  if (readEvidence().length) return;
  const steps = getSteps();
  for (const s of steps) {
    if (s.id === "app" || s.id === "resumos") continue;
    if (!s.done && s.id !== "opcoes") continue;
    addEvidence(s.id, t("evidence.already", { summary: s.summary }));
  }
}

export function missingConfig(): string[] {
  return getSteps()
    .filter((s) => s.id !== "app" && s.id !== "resumos" && s.id !== "webhook" && s.id !== "opcoes" && !s.done)
    .map((s) => `F${s.f} ${s.title}`);
}

export async function saveApiKey(opts: {
  provider: LlmProvider;
  apiKey: string;
  baseUrl: string;
}): Promise<LlmModel[]> {
  const trimmed = opts.apiKey.trim();
  if (!trimmed) throw new Error(t("chave.needKey"));
  const baseUrl = (opts.baseUrl || "https://api.openai.com/v1").trim();
  const models = await validateLlmAuth({
    provider: opts.provider,
    apiKey: trimmed,
    baseUrl,
  });
  upsertEnv({
    LLM_PROVIDER: opts.provider,
    LLM_API_KEY: trimmed,
    LLM_BASE_URL: baseUrl,
    CURSOR_API_KEY: trimmed,
  });
  refreshConfig();
  patchSettings({ llmProvider: opts.provider, llmBaseUrl: baseUrl });
  addEvidence(
    "chave",
    t("chave.evidence", {
      provider: opts.provider,
      mask: maskSecret(trimmed),
      n: models.length,
    }),
  );
  return models;
}

export async function loadModels(): Promise<LlmModel[]> {
  if (!config.llmApiKey) throw new Error(t("modelo.needKey"));
  return listLlmModels();
}

export function saveModel(id: string): void {
  const trimmed = id.trim();
  if (!trimmed) throw new Error(t("modelo.pick"));
  upsertEnv({ CURSOR_MODEL: trimmed, LLM_MODEL: trimmed });
  refreshConfig();
  patchSettings({ cursorModel: trimmed });
  addEvidence("modelo", t("modelo.evidence", { id: trimmed }));
}

export function saveRequisitos(path: string): void {
  const abs = requireDir(path, t("reqs.label"));
  patchSettings({ requisitosPath: abs });
  addEvidence("requisitos", t("reqs.evidence", { path: abs }));
}

export function saveUrl(raw: string): void {
  const url = normalizeUrl(raw);
  patchSettings({ baseUrl: url });
  addEvidence("url", t("url.evidence", { url }));
}

export function saveCredentials(accessCount: number, accesses: AccessCredential[]): void {
  const count = Math.min(10, Math.max(1, accessCount));
  const normalized = accesses.slice(0, count).map((access) => ({
    label: access.label?.trim() || undefined,
    authKind: access.authKind,
    login: access.login.trim(),
    senha: access.senha.trim(),
  }));

  const mdPath = credenciaisPath();
  let existing: ReturnType<typeof readMultiCredenciaisFile> | undefined;
  if (existsSync(mdPath)) {
    try {
      existing = readMultiCredenciaisFile(mdPath);
    } catch {
      existing = undefined;
    }
  }

  const mergedAccesses = normalized.map((row, i) => {
    if (row.login && row.senha) return row;
    const prev = existing?.accesses[i];
    const senha = row.senha || (prev?.senha && !placeholderSenha(prev) ? prev.senha : "");
    const login = row.login || prev?.login || "";
    if (!login || !senha) {
      throw new Error(t("creds.requiredAccess", { n: i + 1 }));
    }
    return {
      label: row.label ?? prev?.label,
      authKind: row.authKind ?? prev?.authKind ?? "email",
      login,
      senha,
    };
  });

  ensureWorkspace();
  const s = loadSettings();
  const baseUrl = s.baseUrl;
  const creds = mergeMultiCredentials([
    { baseUrl, accessCount: count, accesses: mergedAccesses },
  ]);
  writeFileSync(
    mdPath,
    formatCredenciaisMdMulti({ baseUrl, accesses: creds.accesses }),
    "utf8",
  );
  patchSettings({
    authKind: creds.accesses[0]!.authKind,
    credentialsMd: mdPath,
    credentialsSource: "manual",
  });
  const labels = creds.accesses
    .map((a, i) => (a.label ? `${i + 1}:${a.label}` : `${i + 1}:${a.login}`))
    .join(", ");
  addEvidence(
    "credenciais",
    t("creds.evidenceMulti", { n: creds.accessCount, labels }),
  );
}

export function saveCredentialsFile(rawPath: string): void {
  const trimmed = rawPath.trim();
  if (!trimmed) throw new Error(t("creds.fileRequired"));

  ensureWorkspace();
  const s = loadSettings();
  const abs = resolveCredentialsFilePath(trimmed, scriptsDir());
  const parsed = readMultiCredenciaisFromPath(abs);
  const creds = mergeMultiCredentials([parsed, { baseUrl: s.baseUrl }]);

  patchSettings({
    authKind: creds.accesses[0]!.authKind,
    credentialsMd: abs,
    credentialsSource: "file",
  });
  addEvidence("credenciais", t("creds.evidenceFile", { path: abs, n: creds.accessCount }));
}

export function saveWebhook(urlRaw: string, providerRaw?: string): void {
  const trimmed = urlRaw.trim();
  if (!trimmed || trimmed.toLowerCase() === "nenhum" || trimmed.toLowerCase() === "none") {
    upsertEnv({ WEBHOOK_URL: "", DISCORD_WEBHOOK_URL: "", WEBHOOK_PROVIDER: "" });
    refreshConfig();
    patchSettings({ webhookEnabled: false });
    addEvidence("webhook", t("webhook.evidenceOff"));
    return;
  }
  if (!isValidWebhookUrl(trimmed)) {
    throw new Error(t("webhook.invalid"));
  }
  const provider = parseWebhookProvider(providerRaw ?? "") ?? detectWebhookProvider(trimmed);
  upsertEnv({
    WEBHOOK_URL: trimmed,
    DISCORD_WEBHOOK_URL: provider === "discord" ? trimmed : "",
    WEBHOOK_PROVIDER: provider,
  });
  refreshConfig();
  patchSettings({ webhookEnabled: true, webhookProvider: provider });
  addEvidence(
    "webhook",
    t("webhook.evidenceOn", {
      provider: webhookProviderLabel(provider),
      mask: maskSecret(trimmed),
    }),
  );
}

/** @deprecated use saveWebhook */
export function saveDiscord(raw: string): void {
  saveWebhook(raw, "discord");
}

export function saveLocale(locale: Locale): void {
  const changed = getLocale() !== locale;
  setLocale(locale);
  upsertEnv({ QA_LOCALE: locale });
  refreshConfig();
  patchSettings({ locale });
  if (changed) addEvidence("opcoes", t("opcoes.localeSaved", { locale }));
}

export type OptionsDraft = {
  runAll: boolean;
  autoResume: boolean;
  k6Enabled: boolean;
  massaEnabled: boolean;
  tourEnabled: boolean;
  headed: boolean;
  grep: string;
};

export function optionalsAllOn(d: Pick<OptionsDraft, "k6Enabled" | "massaEnabled" | "tourEnabled" | "headed">): boolean {
  return d.k6Enabled && d.massaEnabled && d.tourEnabled && d.headed;
}

export function applyRunAll(d: OptionsDraft, on: boolean): void {
  d.runAll = on;
  d.k6Enabled = on;
  d.massaEnabled = on;
  d.tourEnabled = on;
  d.headed = on;
}

export function syncRunAllFlag(d: OptionsDraft): void {
  d.runAll = optionalsAllOn(d);
}

export function currentOptionsDraft(): OptionsDraft {
  const s = loadSettings();
  const headed = s.playwrightHeaded ?? config.playwrightHeaded;
  const d: OptionsDraft = {
    runAll: false,
    autoResume: s.autoResumeOnTeste ?? config.autoResumeOnTeste,
    k6Enabled: s.k6Enabled ?? config.k6Enabled,
    massaEnabled: s.massaGenerateEnabled ?? config.massaGenerateEnabled,
    tourEnabled: s.tourEnabled ?? config.tourEnabled,
    headed,
    grep: s.playwrightGrep ?? config.playwrightGrep ?? "@executavel",
  };
  if (s.runAllOptional === true) applyRunAll(d, true);
  else d.runAll = optionalsAllOn(d);
  return d;
}

export function saveOptions(opts: OptionsDraft): void {
  const grep = opts.grep.trim() === "-" ? "" : opts.grep.trim();
  const runAll = optionalsAllOn(opts);
  upsertEnv({
    AUTO_RESUME_ON_TESTE: opts.autoResume ? "true" : "false",
    PLAYWRIGHT_GREP: grep,
    K6_ENABLED: opts.k6Enabled ? "true" : "false",
    MASSA_GENERATE_ENABLED: opts.massaEnabled ? "true" : "false",
    TOUR_ENABLED: opts.tourEnabled ? "true" : "false",
    PLAYWRIGHT_HEADED: opts.headed ? "true" : "false",
    TOUR_HEADED: opts.headed ? "true" : "false",
    PLAYWRIGHT_VIDEO: opts.headed ? "on" : "off",
  });
  refreshConfig();
  patchSettings({
    autoResumeOnTeste: opts.autoResume,
    playwrightGrep: grep,
    k6Enabled: opts.k6Enabled,
    massaGenerateEnabled: opts.massaEnabled,
    tourEnabled: opts.tourEnabled,
    playwrightHeaded: opts.headed,
    runAllOptional: runAll,
    locale: getLocale(),
  });
  addEvidence(
    "opcoes",
    t("opcoes.evidence", {
      all: runAll ? t("common.yes") : t("common.no"),
      on: opts.autoResume ? t("opcoes.resumeOnWord") : t("opcoes.resumeOffWord"),
      k6: opts.k6Enabled ? t("opcoes.onWord") : t("opcoes.offWord"),
      massa: opts.massaEnabled ? t("opcoes.onWord") : t("opcoes.offWord"),
      tour: opts.tourEnabled ? t("opcoes.onWord") : t("opcoes.offWord"),
      headed: opts.headed ? t("opcoes.onWord") : t("opcoes.offWord"),
      grep: grep || t("opcoes.allTests"),
      locale: getLocale(),
    }),
  );
}

export function buildRunBody(regenerate: boolean): CreateRunBody {
  const missing = missingConfig();
  if (missing.length) {
    throw new Error(t("err.missing", { list: missing.join(", ") }));
  }
  const s = loadSettings();
  const parsed = readMultiCredenciaisFromPath(activeCredentialsPath());
  if (!parsed.accesses.length || placeholderSenha(parsed.accesses[0] ?? {}) || !parsed.accesses[0]?.login) {
    throw new Error(t("creds.fillF5"));
  }
  const creds = mergeMultiCredentials([parsed, { baseUrl: s.baseUrl }]);
  const primary = creds.accesses[0]!;
  return {
    requisitosPath: s.requisitosPath,
    baseUrl: s.baseUrl,
    authKind: primary.authKind,
    login: primary.login,
    senha: primary.senha,
    credentialsMd: s.credentialsMd || credenciaisPath(),
    grep: config.playwrightGrep,
    autoResumeOnTeste: config.autoResumeOnTeste,
    k6Enabled: config.k6Enabled,
    regenerate,
  };
}

export type AccessDraft = {
  label: string;
  authKind: AuthKind;
  login: string;
  senha: string;
};

export type CredsSource = "manual" | "file";

export function currentCredentialsDraft(): {
  credsSource: CredsSource;
  credentialsFile: string;
  accessCount: number;
  accessIndex: number;
  accesses: AccessDraft[];
} {
  const s = loadSettings();
  const defaultMd = credenciaisPath();
  const credsSource: CredsSource =
    s.credentialsSource === "file"
      ? "file"
      : s.credentialsSource === "manual"
        ? "manual"
        : s.credentialsMd && s.credentialsMd !== defaultMd && existsSync(s.credentialsMd)
          ? "file"
          : "manual";

  const path = activeCredentialsPath();
  const credentialsFile = credsSource === "file" ? path : "";
  let accessCount = 1;
  const accesses: AccessDraft[] = [{ label: "", authKind: s.authKind ?? "email", login: "", senha: "" }];

  if (existsSync(path)) {
    try {
      const parsed = readMultiCredenciaisFromPath(path);
      accessCount = Math.min(10, Math.max(1, parsed.accessCount));
      if (parsed.accesses.length) {
        accesses.length = 0;
        for (let i = 0; i < accessCount; i++) {
          const row = parsed.accesses[i] ?? {};
          accesses.push({
            label: row.label ?? "",
            authKind: row.authKind ?? s.authKind ?? "email",
            login: row.login ?? "",
            senha: credsSource === "file" ? "" : "",
          });
        }
      }
    } catch {
      /* mantém default */
    }
  }

  const c = credsOk();
  if (c.login && !accesses[0]?.login) {
    accesses[0] = {
      label: accesses[0]?.label ?? "",
      authKind: c.authKind ?? s.authKind ?? "email",
      login: c.login,
      senha: "",
    };
  }

  while (accesses.length < accessCount) {
    accesses.push({ label: "", authKind: "email", login: "", senha: "" });
  }

  return {
    credsSource,
    credentialsFile,
    accessCount,
    accessIndex: 0,
    accesses: accesses.slice(0, accessCount),
  };
}

/** @deprecated use currentCredentialsDraft */
export function currentAccessesDraft(): ReturnType<typeof currentCredentialsDraft> {
  return currentCredentialsDraft();
}

export function currentLoginDraft(): { authKind: AuthKind; login: string } {
  const s = loadSettings();
  const c = credsOk();
  return {
    authKind: s.authKind ?? c.authKind ?? "email",
    login: c.login ?? "",
  };
}

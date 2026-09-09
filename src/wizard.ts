import { existsSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import type { Interface } from "node:readline/promises";
import { ask, askChoice, askSecret, askYesNo } from "./ask.ts";
import { config, refreshConfig } from "./config.ts";
import {
  formatCredenciaisMd,
  mergeCredentials,
  placeholderSenha,
  readCredenciaisFile,
  resolveCredentialsMdPath,
} from "./credentials.ts";
import { upsertEnv } from "./envfile.ts";
import { getLocale, parseLocale, setLocale, t, type Locale } from "./i18n.ts";
import { validateLlmAuth } from "./llm/run.ts";
import { defaultBaseUrl, LLM_PRESETS } from "./llm/presets.ts";
import type { LlmModel, LlmProvider } from "./llm/types.ts";
import { hasCompleteSetup, loadSettings, saveSettings, type AppSettings } from "./settings.ts";
import type { AppCredentials, AuthKind, CreateRunBody } from "./types.ts";
import { credenciaisPath, listSpecFiles, scriptsDir } from "./workspace.ts";
import { isValidWebhookUrl } from "./webhook.ts";
import { printKv, printSection } from "./tui/plain.ts";

function print(line = ""): void {
  console.log(line);
}

function requireDir(path: string, label: string): string {
  if (!path.trim()) throw new Error(t("err.needDir", { label: label.toLowerCase() }));
  const abs = isAbsolute(path) ? path : resolve(path);
  if (!existsSync(abs) || !statSync(abs).isDirectory()) {
    throw new Error(t("err.notDir", { label, path: abs }));
  }
  return abs;
}

function normalizeUrl(raw: string): string {
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

async function collectLanguage(rl: Interface): Promise<Locale> {
  const current =
    loadSettings().locale ?? parseLocale(process.env.QA_LOCALE) ?? getLocale();
  const locale = (await askChoice(
    rl,
    t("wiz.language"),
    [
      { id: "pt-BR", label: t("wiz.langPt") },
      { id: "en-US", label: t("wiz.langEn") },
    ],
    current,
  )) as Locale;
  setLocale(locale);
  upsertEnv({ QA_LOCALE: locale });
  refreshConfig();
  saveSettings({ ...loadSettings(), locale });
  return locale;
}

async function collectApiKey(rl: Interface): Promise<{
  key: string;
  models: LlmModel[];
  provider: LlmProvider;
  baseUrl: string;
}> {
  print();
  print(t("wiz.llmProvider"));
  const provider = (await askChoice(
    rl,
    t("wiz.providerQ"),
    LLM_PRESETS.map((p) => ({ id: p.id, label: `${p.label}` })),
    config.llmProvider,
  )) as LlmProvider;

  let baseUrl = defaultBaseUrl(provider) || config.llmBaseUrl || "";
  if (provider !== "cursor") {
    print(t("wiz.baseUrlNeed"));
    baseUrl = (await ask(rl, t("wiz.baseUrl"), baseUrl || defaultBaseUrl(provider))).trim() || defaultBaseUrl(provider);
  }

  if (config.llmApiKey) {
    print(t("wiz.keySaved"));
    if (await askYesNo(rl, t("wiz.keepKey"), true)) {
      const models = await validateLlmAuth({
        provider,
        apiKey: config.llmApiKey,
        baseUrl,
      });
      return { key: config.llmApiKey, models, provider, baseUrl };
    }
  } else {
    print(provider === "cursor" ? t("wiz.cursorKey") : t("wiz.pasteKey"));
  }

  for (;;) {
    const key = (await askSecret(rl, t("wiz.pasteApiKey"))).trim();
    if (!key) {
      print(t("wiz.keyRequired"));
      continue;
    }
    try {
      print(t("wiz.validating"));
      const models = await validateLlmAuth({ provider, apiKey: key, baseUrl });
      return { key, models, provider, baseUrl };
    } catch (err) {
      print(t("wiz.keyRejected", { msg: err instanceof Error ? err.message : String(err) }));
    }
  }
}

async function collectModel(
  rl: Interface,
  models: LlmModel[],
  current?: string,
): Promise<string> {
  print();
  print(t("wiz.models"));
  if (models.length === 0) {
    throw new Error(t("wiz.noModels"));
  }
  const options = models.map((m) => ({
    id: m.id,
    label: m.displayName && m.displayName !== m.id ? `${m.id} — ${m.displayName}` : m.id,
  }));
  const preferred =
    (current && options.some((m) => m.id === current) ? current : undefined) ??
    (options.some((m) => m.id === "composer-2.5") ? "composer-2.5" : options[0]!.id);
  return askChoice(rl, t("wiz.modelNumber"), options, preferred);
}

async function collectWebhook(rl: Interface): Promise<string> {
  print();
  print(t("webhook.intro"));
  const has = Boolean(config.webhookUrl);
  if (has) {
    print(t("wiz.discordHas"));
    const action = await askChoice(
      rl,
      t("wiz.webhook"),
      [
        { id: "keep", label: t("wiz.keep") },
        { id: "replace", label: t("wiz.replace") },
        { id: "none", label: t("wiz.none") },
      ],
      "keep",
    );
    if (action === "keep") return config.webhookUrl;
    if (action === "none") return "";
  } else {
    print(t("wiz.discordSkip"));
  }

  for (;;) {
    const raw = (await ask(rl, t("webhook.field"))).trim();
    if (!raw) return "";
    if (raw.toLowerCase() === "nenhum" || raw.toLowerCase() === "none") return "";
    if (isValidWebhookUrl(raw)) return raw;
    print(t("webhook.invalid"));
  }
}

async function collectCredentials(
  rl: Interface,
  session: AppSettings,
  baseUrl: string,
): Promise<{ creds: AppCredentials; mdPath: string }> {
  const scripts = scriptsDir();
  const defaultMd = credenciaisPath();
  let saved: Partial<AppCredentials> | undefined;
  if (existsSync(defaultMd)) {
    try {
      const parsed = readCredenciaisFile(defaultMd);
      if (!placeholderSenha(parsed)) saved = parsed;
    } catch {
      saved = undefined;
    }
  }

  print();
  print(t("wiz.authHow"));
  const authKind = await askChoice(
    rl,
    t("wiz.auth"),
    [
      { id: "email", label: t("wiz.authEmail") },
      { id: "cpf", label: t("wiz.authCpf") },
    ],
    session.authKind ?? saved?.authKind ?? "email",
  );

  print(t("wiz.creds"));
  print(`  ${t("wiz.credsNow")}`);
  print(`  ${t("wiz.credsMd", { path: defaultMd })}`);
  const defaultChoice = saved || session.credentialsMd ? "md" : "prompt";
  const source = await askChoice(
    rl,
    t("wiz.origin"),
    [
      { id: "prompt", label: t("wiz.originPrompt") },
      { id: "md", label: t("wiz.originMd") },
    ],
    defaultChoice,
  );

  if (source === "md") {
    const mdPath = resolveCredentialsMdPath(
      await ask(rl, t("wiz.mdPath"), session.credentialsMd || "credenciais.md"),
      scripts,
    );
    const parsed = readCredenciaisFile(mdPath);
    if (placeholderSenha(parsed)) {
      throw new Error(t("wiz.mdPlaceholder", { path: mdPath }));
    }
    const creds = mergeCredentials([{ authKind }, parsed, { baseUrl }]);
    return { creds: { ...creds, authKind }, mdPath };
  }

  const loginLabel = authKind === "cpf" ? t("creds.cpf") : t("creds.email");
  const login = await ask(rl, loginLabel, saved && saved.authKind === authKind ? saved.login : undefined);
  const senha = await askSecret(rl, t("creds.password"));
  if (!login || !senha) throw new Error(t("wiz.emailCpfRequired", { label: loginLabel }));
  const creds = mergeCredentials([{ authKind, login, senha, baseUrl }]);
  const mdPath = defaultMd;
  writeFileSync(mdPath, formatCredenciaisMd({ authKind, login, senha, baseUrl }), "utf8");
  print(t("wiz.credsWritten", { path: mdPath }));
  return { creds, mdPath };
}

export type WizardResult = {
  body: CreateRunBody;
  regenerate: boolean;
};

export async function runWizard(
  rl: Interface,
  opts: { reconfigure: boolean },
): Promise<WizardResult> {
  const settings = loadSettings();
  if (settings.llmProvider) process.env.LLM_PROVIDER = settings.llmProvider;
  if (settings.llmBaseUrl) process.env.LLM_BASE_URL = settings.llmBaseUrl;
  if (settings.cursorModel) {
    process.env.CURSOR_MODEL = settings.cursorModel;
    process.env.LLM_MODEL = settings.cursorModel;
  }
  if (settings.playwrightGrep !== undefined) {
    process.env.PLAYWRIGHT_GREP = settings.playwrightGrep;
  }
  if (settings.autoResumeOnTeste !== undefined) {
    process.env.AUTO_RESUME_ON_TESTE = settings.autoResumeOnTeste ? "true" : "false";
  }
  refreshConfig();

  const locale = await collectLanguage(rl);

  const complete = hasCompleteSetup(settings, config.llmApiKey);
  let skip = false;
  if (complete && !opts.reconfigure) {
    printSection(t("wiz.saved"));
    printKv(t("wiz.provider"), config.llmProvider);
    printKv(t("wiz.model"), config.llmModel);
    printKv(t("wiz.reqs"), settings.requisitosPath ?? "");
    printKv(t("wiz.url"), settings.baseUrl ?? "");
    printKv(t("wiz.login"), settings.authKind === "cpf" ? t("wiz.loginCpf") : t("wiz.loginEmail"));
    printKv(t("wiz.discord"), config.webhookUrl ? t("wiz.discordOn") : t("wiz.discordOff"));
    printKv(t("wiz.grep"), config.playwrightGrep || t("wiz.allTests"));
    printKv(t("wiz.autoResume"), config.autoResumeOnTeste ? t("common.yes") : t("common.no"));
    print();
    skip = await askYesNo(rl, t("wiz.useSaved"), true);
  }

  if (!skip) {
    const { key: apiKey, models, provider, baseUrl: llmBaseUrl } = await collectApiKey(rl);
    upsertEnv({
      LLM_PROVIDER: provider,
      LLM_API_KEY: apiKey,
      LLM_BASE_URL: llmBaseUrl,
      CURSOR_API_KEY: apiKey,
    });
    refreshConfig();

    const model = await collectModel(rl, models, settings.cursorModel || config.llmModel);
    upsertEnv({ CURSOR_MODEL: model, LLM_MODEL: model });
    refreshConfig();

    print();
    const requisitosPath = requireDir(
      await ask(rl, t("wiz.reqsPath"), settings.requisitosPath),
      t("reqs.label"),
    );

    print();
    const baseUrl = normalizeUrl(await ask(rl, t("wiz.appUrl"), settings.baseUrl));

    const { creds, mdPath } = await collectCredentials(rl, settings, baseUrl);

    const webhook = await collectWebhook(rl);
    upsertEnv({
      WEBHOOK_URL: webhook,
      DISCORD_WEBHOOK_URL: webhook.includes("discord.com/api/webhooks") ? webhook : "",
    });
    refreshConfig();

    print();
    print(t("wiz.twoMore"));
    const autoResumeOnTeste = await askYesNo(
      rl,
      t("wiz.resumeQ"),
      settings.autoResumeOnTeste ?? config.autoResumeOnTeste,
    );
    print(t("wiz.grepHint"));
    const grepRaw = await ask(
      rl,
      t("wiz.grep"),
      settings.playwrightGrep || "@executavel",
    );
    const grep = grepRaw.trim() === "-" ? "" : grepRaw.trim();

    upsertEnv({
      AUTO_RESUME_ON_TESTE: autoResumeOnTeste ? "true" : "false",
      PLAYWRIGHT_GREP: grep,
    });
    refreshConfig();

    const next: AppSettings = {
      locale,
      llmProvider: provider,
      llmBaseUrl,
      cursorModel: model,
      requisitosPath,
      baseUrl,
      authKind: creds.authKind,
      credentialsMd: mdPath,
      playwrightGrep: grep,
      autoResumeOnTeste,
      webhookEnabled: Boolean(webhook),
    };
    saveSettings(next);

    const specs = listSpecFiles();
    let regenerate = false;
    if (specs.length === 0) {
      print();
      print(t("wiz.noScripts"));
    } else {
      print();
      print(t("wiz.foundScripts", { n: specs.length }));
      regenerate = await askYesNo(rl, t("wiz.regen"), false);
    }

    return {
      regenerate,
      body: {
        requisitosPath,
        baseUrl,
        authKind: creds.authKind,
        login: creds.login,
        senha: creds.senha,
        credentialsMd: mdPath,
        grep,
        autoResumeOnTeste,
        regenerate,
      },
    };
  }

  const requisitosPath = requireDir(settings.requisitosPath ?? "", t("reqs.label"));
  const baseUrl = normalizeUrl(settings.baseUrl ?? "");
  const mdPath = resolveCredentialsMdPath(settings.credentialsMd || "credenciais.md", scriptsDir());
  const parsed = readCredenciaisFile(mdPath);
  if (placeholderSenha(parsed)) {
    throw new Error(t("wiz.fillCreds", { path: mdPath }));
  }
  const creds = mergeCredentials([
    { authKind: settings.authKind },
    parsed,
    { baseUrl },
  ]);

  saveSettings({ ...loadSettings(), locale });

  const specs = listSpecFiles();
  let regenerate = false;
  if (specs.length === 0) {
    print();
    print(t("wiz.noScripts"));
  } else {
    print();
    print(t("wiz.foundScripts", { n: specs.length }));
    regenerate = await askYesNo(rl, t("wiz.regen"), false);
  }

  return {
    regenerate,
    body: {
      requisitosPath,
      baseUrl,
      authKind: creds.authKind,
      login: creds.login,
      senha: creds.senha,
      credentialsMd: mdPath,
      grep: config.playwrightGrep,
      autoResumeOnTeste: config.autoResumeOnTeste,
      regenerate,
    },
  };
}

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, cpSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT, config } from "./config.ts";
import { credenciaisExample } from "./credentials.ts";
import { massaDataExample } from "./massa/data.ts";

const templatesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "templates");

export function workspaceDir(): string {
  return config.workspaceDir;
}

export function scriptsDir(): string {
  return join(config.workspaceDir, "scripts");
}

export function requisitosDestDir(): string {
  return join(config.workspaceDir, "requisitos");
}

export function credenciaisPath(): string {
  return join(scriptsDir(), "credenciais.md");
}

function copyTemplate(name: string, dest: string, overwrite: boolean): void {
  const src = join(templatesDir, name);
  if (!existsSync(src)) return;
  if (!overwrite && existsSync(dest)) return;
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, readFileSync(src, "utf8"), "utf8");
}

function copyWorkspaceTemplate(relPath: string, dest: string, overwrite: boolean): void {
  copyTemplate(join("workspace", relPath), dest, overwrite);
}

function playwrightConfigFromTemplate(): void {
  copyWorkspaceTemplate("playwright.config.ts", join(scriptsDir(), "playwright.config.ts"), true);
}

function syncK6Scripts(): void {
  copyWorkspaceTemplate("k6/smoke.js", join(scriptsDir(), "k6", "smoke.js"), false);
}

function syncAuthHelpers(): void {
  const scripts = scriptsDir();
  copyWorkspaceTemplate("helpers/global-setup.ts", join(scripts, "helpers", "global-setup.ts"), true);
  copyWorkspaceTemplate("helpers/auth.ts", join(scripts, "helpers", "auth.ts"), true);
  copyWorkspaceTemplate("helpers/access.ts", join(scripts, "helpers", "access.ts"), true);
  copyWorkspaceTemplate("helpers/massa-types.ts", join(scripts, "helpers", "massa-types.ts"), true);
  copyWorkspaceTemplate("helpers/massa.ts", join(scripts, "helpers", "massa.ts"), true);
  copyWorkspaceTemplate("helpers/api.ts", join(scripts, "helpers", "api.ts"), true);
  copyWorkspaceTemplate(
    "massa/setups/_example.setup.ts",
    join(scripts, "massa", "setups", "_example.setup.ts"),
    false,
  );
  copyWorkspaceTemplate(
    "massa/dados.example.json",
    join(scripts, "massa", "dados.example.json"),
    false,
  );
  copyWorkspaceTemplate(
    "massa/dados.example.md",
    join(scripts, "massa", "dados.example.md"),
    false,
  );
}

function envHelper(): string {
  return `export type AuthKind = "email" | "cpf";

export function e2eEnv(): {
  authKind: AuthKind;
  login: string;
  senha: string;
  baseURL: string;
  email: string;
  cpf: string;
} {
  const authKind: AuthKind = process.env.E2E_AUTH_KIND === "cpf" ? "cpf" : "email";
  const login = (
    process.env.E2E_LOGIN ??
    process.env.E2E_EMAIL ??
    process.env.E2E_CPF ??
    process.env.E2E_USER ??
    ""
  ).trim();
  const senha = (process.env.E2E_SENHA ?? process.env.E2E_PASSWORD ?? "").trim();
  const baseURL = (process.env.BASE_URL ?? "").trim();
  if (!baseURL) throw new Error("BASE_URL ausente — informe a URL no terminal do QA-Agent");
  if (!login || !senha) {
    throw new Error("Login e senha ausentes — informe no terminal ou em credenciais.md");
  }
  return {
    authKind,
    login,
    senha,
    baseURL,
    email: authKind === "email" ? login : "",
    cpf: authKind === "cpf" ? login : "",
  };
}
`;
}

export function ensureWorkspace(): { workspace: string; scripts: string } {
  const workspace = config.workspaceDir;
  const scripts = scriptsDir();
  mkdirSync(join(scripts, "tests"), { recursive: true });
  mkdirSync(join(scripts, "helpers"), { recursive: true });
  mkdirSync(join(scripts, "falhas"), { recursive: true });
  mkdirSync(join(scripts, "massa", "setups"), { recursive: true });
  mkdirSync(join(scripts, "k6"), { recursive: true });
  mkdirSync(join(scripts, ".auth"), { recursive: true });
  mkdirSync(join(workspace, "requisitos"), { recursive: true });
  mkdirSync(join(workspace, ".cursor", "skills", "qa-e2e-requisitos"), { recursive: true });

  playwrightConfigFromTemplate();
  syncAuthHelpers();
  syncK6Scripts();
  writeFileSync(join(scripts, "helpers", "env.ts"), envHelper(), "utf8");

  copyTemplate("workspace-AGENTS.md", join(workspace, "AGENTS.md"), true);
  copyTemplate(
    join("qa-e2e-requisitos", "SKILL.md"),
    join(workspace, ".cursor", "skills", "qa-e2e-requisitos", "SKILL.md"),
    true,
  );

  const cred = credenciaisPath();
  if (!existsSync(cred)) writeFileSync(cred, credenciaisExample(), "utf8");

  const dadosJson = join(scripts, "massa", "dados.json");
  if (!existsSync(dadosJson)) {
    writeFileSync(dadosJson, massaDataExample() + "\n", "utf8");
  }

  return { workspace, scripts };
}

function skipName(name: string): boolean {
  return ["node_modules", ".git", "dist", "data", "test-results", "playwright-report"].includes(
    name,
  );
}

export function syncRequisitos(srcPath: string): string {
  const dest = requisitosDestDir();
  if (!existsSync(srcPath) || !statSync(srcPath).isDirectory()) {
    throw new Error(`Pasta de requisitos inválida: ${srcPath}`);
  }
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  cpSync(srcPath, dest, {
    recursive: true,
    filter: (from) => {
      const rel = relative(srcPath, from);
      if (!rel) return true;
      return !rel.split(/[/\\]/).some((part) => skipName(part));
    },
  });
  return dest;
}

export function listFiles(dir: string, ext: string[]): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (current: string) => {
    for (const name of readdirSync(current)) {
      if (skipName(name)) continue;
      const full = join(current, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (ext.some((e) => name.toLowerCase().endsWith(e))) out.push(full);
    }
  };
  walk(dir);
  return out.sort();
}

export function listSpecFiles(dir = join(scriptsDir(), "tests")): string[] {
  return listFiles(dir, [".spec.ts", ".spec.js", ".test.ts", ".test.js"]);
}

export function listK6Scripts(dir = join(scriptsDir(), "k6")): string[] {
  return listFiles(dir, [".js"]);
}

export function listRequisitoFiles(dir = requisitosDestDir()): string[] {
  return listFiles(dir, [".md", ".txt"]);
}

export function playwrightCli(): string {
  const local = join(scriptsDir(), "node_modules", "@playwright", "test", "cli.js");
  if (existsSync(local)) return local;
  const rootCli = join(ROOT, "node_modules", "@playwright", "test", "cli.js");
  if (existsSync(rootCli)) return rootCli;
  throw new Error(
    "Playwright não encontrado. Rode npm install na pasta do QA-Agent (dependência @playwright/test).",
  );
}

export async function ensureChromium(onLog: (line: string) => void): Promise<void> {
  const marker = join(config.workspaceDir, ".chromium-ok");
  if (existsSync(marker)) return;

  onLog("Instalando Chromium do Playwright (primeira vez nesta máquina)…");
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  await new Promise<void>((resolve, reject) => {
    const child = spawn(npx, ["--yes", "playwright", "install", "chromium"], {
      cwd: ROOT,
      stdio: "inherit",
      shell: process.platform === "win32",
      windowsHide: true,
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else {
        reject(
          new Error(
            `playwright install chromium saiu com código ${code}. Rode: npx playwright install chromium`,
          ),
        );
      }
    });
  });
  mkdirSync(config.workspaceDir, { recursive: true });
  writeFileSync(marker, `${new Date().toISOString()}\n`, "utf8");
}

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright-core";
import { config } from "./config.ts";
import { tryLogin } from "./logic-explore.ts";
import type { AuthKind } from "./types.ts";
import { scriptsDir } from "./workspace.ts";

export type TourStep = {
  n: number;
  url: string;
  kind: "login" | "click" | "skip" | "error";
  name: string;
  result: "ok" | "skipped" | "fail";
  screenshot?: string;
};

export type TourResult = {
  steps: TourStep[];
  pages: number;
  clicks: number;
  skipped: number;
  issues: number;
  reportPath: string;
  mdPath: string;
  screenshotDir: string;
  videoPath?: string;
};

const DANGEROUS =
  /sair|logout|sign.?out|excluir|deletar|apagar|remover|encerrar|cancelar conta|confirmar exclus|formatar|wipe/i;

type Clickable = { name: string; role: "button" | "link" | "tab" | "menuitem" | "option" };

function headedLaunch(): boolean {
  return config.playwrightHeaded || config.tourHeaded;
}

async function collectClickables(page: Page): Promise<Clickable[]> {
  const out: Clickable[] = [];
  const seen = new Set<string>();
  const roles: Clickable["role"][] = ["button", "link", "tab", "menuitem", "option"];

  for (const role of roles) {
    const loc = page.getByRole(role);
    const count = await loc.count();
    const max = Math.min(count, 80);
    for (let i = 0; i < max; i++) {
      const el = loc.nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;
      const name = (
        (await el.innerText().catch(() => "")) ||
        (await el.getAttribute("aria-label").catch(() => "")) ||
        ""
      )
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);
      if (!name || name.length < 2) continue;
      const key = `${role}:${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name, role });
    }
  }
  return out;
}

async function clickNamed(page: Page, item: Clickable): Promise<boolean> {
  const loc = page.getByRole(item.role, { name: item.name, exact: true }).first();
  const fallback = page.getByRole(item.role, { name: new RegExp(`^${escapeRe(item.name)}$`, "i") }).first();
  const target = (await loc.count()) ? loc : fallback;
  if (!(await target.count())) return false;
  await target.click({ timeout: 4000 });
  await page.waitForLoadState("domcontentloaded", { timeout: 8000 }).catch(() => undefined);
  await page.waitForTimeout(350);
  return true;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function pickContextIfNeeded(page: Page, onLog: (line: string) => void): Promise<string | undefined> {
  const heading = page.getByRole("heading", { name: /Selecionar contexto/i });
  if (!(await heading.isVisible({ timeout: 1500 }).catch(() => false))) return undefined;

  const items = await collectClickables(page);
  const candidate =
    items.find((i) => i.role === "button" && !DANGEROUS.test(i.name) && !/entrar|login|continuar/i.test(i.name)) ??
    items.find((i) => i.role === "option");
  if (!candidate) {
    onLog("tour: tela de contexto visivel, mas nenhum botao de contexto clicavel");
    return undefined;
  }
  onLog(`tour: selecionando contexto "${candidate.name}"`);
  await clickNamed(page, candidate);
  return candidate.name;
}

function writeJornadaMd(opts: {
  baseUrl: string;
  headed: boolean;
  result: Omit<TourResult, "mdPath" | "reportPath"> & { reportPath?: string };
}): string {
  const lines = [
    "# Jornada — uso simulado no navegador",
    "",
    `URL: ${opts.baseUrl}`,
    `Janela visivel: ${opts.headed ? "sim (headed)" : "nao (headless)"}`,
    `Passos: ${opts.result.steps.length} | cliques ok: ${opts.result.clicks} | pulados (risco): ${opts.result.skipped} | telas: ${opts.result.pages}`,
    "",
    "Isto **nao** e cobertura de todos os CAs. E o que um usuario conseguiu abrir clicando na UI, com acoes destrutivas bloqueadas.",
    "",
    "| # | Resultado | Acao | URL |",
    "|---|-----------|------|-----|",
  ];
  for (const s of opts.result.steps) {
    lines.push(`| ${s.n} | ${s.result} | ${s.kind}: ${s.name.replace(/\|/g, "/")} | ${s.url} |`);
  }
  lines.push("");
  return lines.join("\n");
}

/** Simula uso real: login, contexto, cliques em botoes/abas/links visiveis; grava screenshots e JORNADA. */
export async function runUserTour(opts: {
  baseUrl: string;
  authKind: AuthKind;
  login: string;
  senha: string;
  onLog: (line: string) => void;
  headed?: boolean;
}): Promise<TourResult> {
  const headed = opts.headed ?? headedLaunch();
  const maxActions = config.tourMaxActions;
  const falhas = join(scriptsDir(), "falhas");
  const shotDir = join(falhas, "jornada");
  mkdirSync(shotDir, { recursive: true });

  opts.onLog(
    `▸ fase: Jornada — simulando uso real no navegador (${headed ? "janela visivel" : "headless"}, max ${maxActions} cliques)`,
  );

  const browser = await chromium.launch({
    headless: !headed,
    slowMo: headed ? config.tourSlowMo : 0,
  });
  const context = await browser.newContext({
    locale: "pt-BR",
    recordVideo: headed ? { dir: shotDir, size: { width: 1280, height: 720 } } : undefined,
  });
  const page = await context.newPage();

  const issues: string[] = [];
  page.on("pageerror", (err) => issues.push(`pageerror: ${err.message.slice(0, 240)}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") issues.push(`console: ${msg.text().slice(0, 240)}`);
  });

  const steps: TourStep[] = [];
  const clicked = new Set<string>();
  const urls = new Set<string>();
  let clicks = 0;
  let skipped = 0;
  let n = 0;
  let videoPath: string | undefined;

  const shot = async (label: string): Promise<string | undefined> => {
    const file = join(shotDir, `${String(n).padStart(3, "0")}-${label.replace(/[^\w-]+/g, "_").slice(0, 40)}.png`);
    try {
      await page.screenshot({ path: file, fullPage: true });
      return file.replace(/\\/g, "/");
    } catch {
      return undefined;
    }
  };

  const push = (step: Omit<TourStep, "n">): void => {
    n += 1;
    steps.push({ n, ...step });
  };

  try {
    await page.goto(opts.baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    const loginOk = await tryLogin(page, {
      authKind: opts.authKind,
      login: opts.login,
      senha: opts.senha,
    });
    const loginShot = await shot("login");
    push({
      url: page.url(),
      kind: "login",
      name: loginOk ? "login enviado" : "login: campos nao encontrados",
      result: loginOk ? "ok" : "fail",
      screenshot: loginShot,
    });
    opts.onLog(loginOk ? "tour: login enviado" : "tour: login nao encontrado; segue no visivel");

    const ctx = await pickContextIfNeeded(page, opts.onLog);
    if (ctx) {
      const ctxShot = await shot("contexto");
      push({ url: page.url(), kind: "click", name: `contexto: ${ctx}`, result: "ok", screenshot: ctxShot });
      clicks += 1;
    }

    urls.add(page.url().split("#")[0] ?? page.url());

    while (clicks + skipped < maxActions) {
      const items = await collectClickables(page);
      const urlKey = page.url().split("#")[0] ?? page.url();
      const next = items.find((item) => {
        const id = `${urlKey}|${item.role}|${item.name}`;
        if (clicked.has(id)) return false;
        if (DANGEROUS.test(item.name)) return false;
        return true;
      });

      if (!next) {
        opts.onLog("tour: nenhum clique novo nesta tela");
        break;
      }

      const id = `${urlKey}|${next.role}|${next.name}`;
      clicked.add(id);

      if (DANGEROUS.test(next.name)) {
        skipped += 1;
        push({ url: page.url(), kind: "skip", name: next.name, result: "skipped" });
        continue;
      }

      opts.onLog(`tour: clique ${clicks + 1}/${maxActions} — ${next.role} "${next.name.slice(0, 50)}"`);
      try {
        const ok = await clickNamed(page, next);
        const after = page.url();
        urls.add(after.split("#")[0] ?? after);
        if (ok) {
          clicks += 1;
          push({
            url: after,
            kind: "click",
            name: `${next.role}: ${next.name}`,
            result: "ok",
            screenshot: await shot(next.name),
          });
        } else {
          skipped += 1;
          push({ url: page.url(), kind: "skip", name: next.name, result: "skipped" });
        }
      } catch (err) {
        push({
          url: page.url(),
          kind: "error",
          name: next.name,
          result: "fail",
        });
        issues.push(err instanceof Error ? err.message : String(err));
      }
    }
  } finally {
    const video = page.video();
    await context.close();
    await browser.close();
    if (video) {
      try {
        videoPath = (await video.path()).replace(/\\/g, "/");
      } catch {
        videoPath = undefined;
      }
    }
  }

  const reportPath = join(falhas, "JORNADA.json");
  const mdPath = join(falhas, "JORNADA.md");
  const payload = {
    baseUrl: opts.baseUrl,
    at: new Date().toISOString(),
    headed,
    pages: urls.size,
    clicks,
    skipped,
    issues,
    steps,
    videoPath,
  };
  writeFileSync(reportPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  writeFileSync(
    mdPath,
    writeJornadaMd({
      baseUrl: opts.baseUrl,
      headed,
      result: { steps, pages: urls.size, clicks, skipped, issues: issues.length, screenshotDir: shotDir, videoPath },
    }),
    "utf8",
  );

  opts.onLog(
    `tour: ${clicks} clique(s), ${urls.size} tela(s), ${skipped} pulado(s), ${issues.length} erro(s) de runtime -> ${mdPath}`,
  );

  return {
    steps,
    pages: urls.size,
    clicks,
    skipped,
    issues: issues.length,
    reportPath,
    mdPath,
    screenshotDir: shotDir,
    videoPath,
  };
}

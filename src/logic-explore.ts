import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright-core";
import type { AuthKind } from "./types.ts";
import { config } from "./config.ts";
import { scriptsDir } from "./workspace.ts";

export type ExploreIssue = {
  url: string;
  kind: "console" | "pageerror" | "http5xx";
  message: string;
};

export type ExploreRoute = {
  path: string;
  title: string;
  headings: string[];
};

export type ExploreResult = {
  pages: number;
  loginOk: boolean;
  issues: ExploreIssue[];
  reportPath: string;
  mapaUiPath?: string;
  routes?: ExploreRoute[];
};

export async function tryLogin(page: Page, creds: { authKind: AuthKind; login: string; senha: string }): Promise<boolean> {
  const loginBox = page
    .getByLabel(/e-?mail|usu[aá]rio|usuario|cpf|login|documento/i)
    .or(page.getByPlaceholder(/e-?mail|cpf|usu[aá]rio|login/i))
    .first();
  const senhaBox = page
    .getByLabel(/senha|password/i)
    .or(page.getByPlaceholder(/senha|password/i))
    .or(page.locator('input[type="password"]'))
    .first();
  try {
    await loginBox.waitFor({ timeout: 8000 });
    await loginBox.fill(creds.login);
    await senhaBox.fill(creds.senha);
    const btn = page.getByRole("button", { name: /entrar|login|acessar|continuar|sign in/i }).first();
    if (await btn.count()) await btn.click();
    else await senhaBox.press("Enter");
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

function sameOrigin(base: URL, href: string): boolean {
  try {
    const u = new URL(href, base);
    return u.origin === base.origin && (u.protocol === "http:" || u.protocol === "https:");
  } catch {
    return false;
  }
}

function skipHref(href: string): boolean {
  return /logout|signout|sair|download|mailto:|javascript:/i.test(href);
}

/** Crawler Playwright: percorre o sistema apos login e registra erros de runtime. */
export async function runLogicExplore(opts: {
  baseUrl: string;
  authKind: AuthKind;
  login: string;
  senha: string;
  onLog: (line: string) => void;
}): Promise<ExploreResult> {
  const issues: ExploreIssue[] = [];
  const visited = new Set<string>();
  const routes: ExploreRoute[] = [];
  const queue: string[] = [opts.baseUrl];
  const origin = new URL(opts.baseUrl);
  let loginOk = false;

  opts.onLog("Exploracao de logica: crawler Playwright (console, pageerror, HTTP 5xx)");
  const browser = await chromium.launch({ headless: !config.playwrightHeaded });
  const page = await browser.newPage();

  page.on("pageerror", (err) => {
    issues.push({ url: page.url(), kind: "pageerror", message: err.message.slice(0, 500) });
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      issues.push({ url: page.url(), kind: "console", message: msg.text().slice(0, 500) });
    }
  });
  page.on("response", (res) => {
    if (res.status() >= 500) {
      issues.push({
        url: res.url(),
        kind: "http5xx",
        message: `HTTP ${res.status()} ${res.request().method()}`,
      });
    }
  });

  try {
    await page.goto(opts.baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    loginOk = await tryLogin(page, {
      authKind: opts.authKind,
      login: opts.login,
      senha: opts.senha,
    });
    opts.onLog(loginOk ? "login: tentativa enviada" : "login: campos nao encontrados; crawler segue no que estiver visivel");
    queue.push(page.url());

    const maxPages = config.crawlDepth;
    while (queue.length && visited.size < maxPages) {
      const next = queue.shift() ?? "";
      const key = next.split("#")[0] ?? next;
      if (!key || visited.has(key) || skipHref(key)) continue;
      visited.add(key);
      if (visited.size === 1 || visited.size % 3 === 0 || visited.size === maxPages) {
        opts.onLog(`crawler: pagina ${visited.size}/${maxPages} — ${key.slice(0, 80)}`);
      }
      try {
        await page.goto(key, { waitUntil: "domcontentloaded", timeout: 15000 });
        let pathname = "/";
        try {
          pathname = new URL(page.url()).pathname;
        } catch {
          pathname = key;
        }
        const title = await page.title().catch(() => "");
        const headings = await page
          .$$eval("h1, h2, [role=heading]", (els) =>
            els
              .map((el) => (el.textContent ?? "").trim())
              .filter((t) => t.length > 0 && t.length < 120),
          )
          .catch(() => [] as string[]);
        routes.push({ path: pathname, title, headings: headings.slice(0, 8) });

        const hrefs = await page.$$eval("a[href], [role='link']", (els) =>
          els.map((el) => {
            const withHref = el as { href?: string };
            return withHref.href || el.getAttribute("href") || "";
          }),
        );
        for (const href of hrefs) {
          if (!href) continue;
          if (sameOrigin(origin, href) && !skipHref(href) && !visited.has(href.split("#")[0] ?? href)) {
            queue.push(href);
          }
        }
      } catch (err) {
        issues.push({
          url: key,
          kind: "pageerror",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } finally {
    await browser.close();
  }

  const unique: ExploreIssue[] = [];
  const seen = new Set<string>();
  for (const i of issues) {
    const k = `${i.kind}|${i.url}|${i.message}`;
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(i);
  }

  const falhas = join(scriptsDir(), "falhas");
  mkdirSync(falhas, { recursive: true });
  const reportPath = join(falhas, "EXPLORACAO.json");
  const mapaUiPath = join(falhas, "MAPA-UI.json");
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        baseUrl: opts.baseUrl,
        loginOk,
        pages: visited.size,
        issues: unique,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  writeFileSync(
    mapaUiPath,
    JSON.stringify(
      {
        baseUrl: opts.baseUrl,
        at: new Date().toISOString(),
        routes: routes.slice(0, 80),
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  opts.onLog(
    `exploracao: ${visited.size} pagina(s), ${unique.length} achado(s), mapa-ui ${routes.length} rotas -> ${reportPath}`,
  );
  return { pages: visited.size, loginOk, issues: unique, reportPath, mapaUiPath, routes };
}

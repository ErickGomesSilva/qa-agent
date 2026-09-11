import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright-core";
import { config } from "./config.ts";
import { pathInEscopo, type RunEscopo } from "./escopo.ts";
import { tryLogin, type ExploreIssue, type ExploreResult, type ExploreRoute } from "./logic-explore.ts";
import type { AccessCredential } from "./types.ts";
import { scriptsDir } from "./workspace.ts";

export type HttpProbe = {
  method: string;
  url: string;
  status: number;
  codigo?: string;
};

export type ProfileRouteMap = {
  path: string;
  heading: string;
  title: string;
  headings: string[];
  menu: string[];
  controles: Record<string, "visivel" | "ausente">;
  emptyVisible: boolean;
  errorVisible: boolean;
  http: HttpProbe[];
};

export type ProfileMapEntry = {
  label: string;
  loginMasked: string;
  loginOk: boolean;
  rotas: ProfileRouteMap[];
  recusasVisiveis: string[];
};

export type ProfileMapFile = {
  version: 1;
  baseUrl: string;
  at: string;
  escopo: RunEscopo;
  /** Hash URL/F5/escopo/crawl — usado para pular novo crawl. */
  fingerprint?: string;
  perfis: ProfileMapEntry[];
};

function maskLogin(login: string): string {
  const at = login.indexOf("@");
  if (at > 0) return `${login.slice(0, Math.min(2, at))}***${login.slice(at)}`;
  if (login.length <= 4) return "***";
  return `${login.slice(0, 2)}***`;
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

function jsonCodigo(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const code = parsed.codigo ?? parsed.code ?? parsed.error ?? parsed.erro;
    return typeof code === "string" && code.trim() ? code.trim().slice(0, 80) : undefined;
  } catch {
    return undefined;
  }
}

async function maybeSelectContext(page: Page): Promise<void> {
  const heading = page.getByRole("heading", { name: /selecionar contexto|escolher (empresa|fazenda|conta)/i });
  if (!(await heading.isVisible({ timeout: 2500 }).catch(() => false))) return;
  const btn = page.getByRole("button").filter({ hasNotText: /sair|cancelar|voltar/i }).first();
  if (await btn.isVisible().catch(() => false)) {
    await btn.click({ timeout: 4000 }).catch(() => undefined);
    await page.waitForLoadState("domcontentloaded", { timeout: 8000 }).catch(() => undefined);
  }
}

async function collectMenu(page: Page): Promise<string[]> {
  const names: string[] = [];
  const loc = page.getByRole("link");
  const n = Math.min(await loc.count(), 60);
  for (let i = 0; i < n; i++) {
    const el = loc.nth(i);
    if (!(await el.isVisible().catch(() => false))) continue;
    const name = ((await el.innerText().catch(() => "")) || "").replace(/\s+/g, " ").trim().slice(0, 80);
    if (name.length >= 2 && !names.includes(name)) names.push(name);
  }
  return names.slice(0, 40);
}

async function collectControles(page: Page): Promise<Record<string, "visivel" | "ausente">> {
  const out: Record<string, "visivel" | "ausente"> = {};
  const loc = page.getByRole("button");
  const n = Math.min(await loc.count(), 40);
  for (let i = 0; i < n; i++) {
    const el = loc.nth(i);
    const name = (
      (await el.innerText().catch(() => "")) ||
      (await el.getAttribute("aria-label").catch(() => "")) ||
      ""
    )
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    if (name.length < 2) continue;
    const visible = await el.isVisible().catch(() => false);
    out[name] = visible ? "visivel" : "ausente";
  }
  return out;
}

async function snapshotRoute(page: Page, http: HttpProbe[]): Promise<ProfileRouteMap> {
  let pathname = "/";
  try {
    pathname = new URL(page.url()).pathname;
  } catch {
    pathname = "/";
  }
  const title = await page.title().catch(() => "");
  const headings = await page
    .$$eval("h1, h2, [role=heading]", (els) =>
      els
        .map((el) => (el.textContent ?? "").trim())
        .filter((t) => t.length > 0 && t.length < 120),
    )
    .catch(() => [] as string[]);
  const emptyVisible = await page
    .getByText(/nenhum registro|sem registros|lista vazia|n[aã]o h[aá] (itens|dados)|empty state/i)
    .first()
    .isVisible()
    .catch(() => false);
  const errorVisible = await page
    .getByRole("alert")
    .or(page.locator("[data-sonner-toast]"))
    .first()
    .isVisible()
    .catch(() => false);
  const recusaText = await page
    .getByText(/n[aã]o permite|sem permiss|acesso negado|n[aã]o (pode|autoriz)/i)
    .first()
    .innerText()
    .catch(() => "");
  return {
    path: pathname,
    heading: headings[0] ?? title,
    title,
    headings: headings.slice(0, 8),
    menu: await collectMenu(page),
    controles: await collectControles(page),
    emptyVisible,
    errorVisible: errorVisible || Boolean(recusaText),
    http: [...http],
  };
}

function uniqueIssues(issues: ExploreIssue[]): ExploreIssue[] {
  const unique: ExploreIssue[] = [];
  const seen = new Set<string>();
  for (const i of issues) {
    const k = `${i.kind}|${i.url}|${i.message}`;
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(i);
  }
  return unique;
}

export function profileMapToExplore(map: ProfileMapFile, issues: ExploreIssue[]): ExploreResult {
  const falhas = join(scriptsDir(), "falhas");
  const routes: ExploreRoute[] = [];
  const seen = new Set<string>();
  for (const p of map.perfis) {
    for (const r of p.rotas) {
      if (seen.has(r.path)) continue;
      seen.add(r.path);
      routes.push({ path: r.path, title: r.title, headings: r.headings });
    }
  }
  return {
    pages: routes.length,
    loginOk: map.perfis.some((p) => p.loginOk),
    issues,
    reportPath: join(falhas, "EXPLORACAO.json"),
    mapaUiPath: join(falhas, "MAPA-UI.json"),
    routes,
  };
}

export function writeExploreCompat(map: ProfileMapFile, issues: ExploreIssue[]): ExploreResult {
  const falhas = join(scriptsDir(), "falhas");
  mkdirSync(falhas, { recursive: true });
  const explore = profileMapToExplore(map, issues);
  writeFileSync(
    explore.reportPath,
    JSON.stringify(
      {
        baseUrl: map.baseUrl,
        loginOk: explore.loginOk,
        pages: explore.pages,
        issues,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  writeFileSync(
    explore.mapaUiPath ?? join(falhas, "MAPA-UI.json"),
    JSON.stringify(
      {
        baseUrl: map.baseUrl,
        at: map.at,
        routes: explore.routes ?? [],
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  return explore;
}

/** Crawl Playwright por cada acesso F5: menu, rotas do escopo, controles, HTTP 401/403 same-origin. Sem LLM. */
export async function runProfileMap(opts: {
  baseUrl: string;
  accesses: AccessCredential[];
  escopo: RunEscopo;
  fingerprint?: string;
  onLog: (line: string) => void;
}): Promise<{ map: ProfileMapFile; explore: ExploreResult }> {
  const origin = new URL(opts.baseUrl);
  const issues: ExploreIssue[] = [];
  const perfis: ProfileMapEntry[] = [];
  const maxPages = opts.escopo.modo === "focado" && opts.escopo.paths.length
    ? Math.max(opts.escopo.paths.length + 2, 8)
    : config.crawlDepth;

  opts.onLog(
    `mapa por perfil: ${opts.accesses.length} acesso(s), modo=${opts.escopo.modo}` +
      (opts.escopo.labels.length ? ` labels=${opts.escopo.labels.join(",")}` : "") +
      (opts.escopo.paths.length ? ` paths=${opts.escopo.paths.join(",")}` : ""),
  );

  const browser = await chromium.launch({ headless: !config.playwrightHeaded });
  try {
    for (let i = 0; i < opts.accesses.length; i++) {
      const access = opts.accesses[i]!;
      const label = access.label?.trim() || `acesso-${i + 1}`;
      const page = await browser.newPage();
      const recusasVisiveis: string[] = [];
      const rotas: ProfileRouteMap[] = [];
      let loginOk = false;

      const attach = (res: import("playwright-core").Response) => {
        const status = res.status();
        const url = res.url();
        if (!sameOrigin(origin, url)) return;
        if (status >= 500) {
          issues.push({
            url,
            kind: "http5xx",
            message: `HTTP ${status} ${res.request().method()}`,
          });
        }
      };

      page.on("pageerror", (err) => {
        issues.push({ url: page.url(), kind: "pageerror", message: err.message.slice(0, 500) });
      });
      page.on("console", (msg) => {
        if (msg.type() === "error") {
          issues.push({ url: page.url(), kind: "console", message: msg.text().slice(0, 500) });
        }
      });
      page.on("response", attach);

      try {
        await page.goto(opts.baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
        loginOk = await tryLogin(page, {
          authKind: access.authKind,
          login: access.login,
          senha: access.senha,
        });
        await maybeSelectContext(page);
        opts.onLog(
          loginOk
            ? `mapa: login ${label} enviado`
            : `mapa: ${label} — campos de login nao encontrados; segue no visivel`,
        );

        const visited = new Set<string>();
        const queue: string[] = [];
        if (opts.escopo.modo === "focado" && opts.escopo.paths.length) {
          for (const p of opts.escopo.paths) {
            queue.push(new URL(p, origin).href);
          }
        } else {
          queue.push(page.url());
        }

        while (queue.length && visited.size < maxPages) {
          const next = queue.shift() ?? "";
          const key = next.split("#")[0] ?? next;
          if (!key || visited.has(key) || skipHref(key)) continue;
          let pathname = "/";
          try {
            pathname = new URL(key, origin).pathname;
          } catch {
            continue;
          }
          if (!pathInEscopo(pathname, opts.escopo) && opts.escopo.modo === "focado" && opts.escopo.paths.length) {
            continue;
          }
          visited.add(key);

          const captured: HttpProbe[] = [];
          const onProbe = async (res: import("playwright-core").Response) => {
            const status = res.status();
            const url = res.url();
            if (!sameOrigin(origin, url)) return;
            if (status < 400 || status >= 500) {
              if (status >= 200 && status < 400 && captured.length < 12) {
                captured.push({ method: res.request().method(), url, status });
              }
              return;
            }
            if (status === 401 || status === 403) {
              let codigo: string | undefined;
              try {
                codigo = jsonCodigo(await res.text());
              } catch {
                codigo = undefined;
              }
              captured.push({ method: res.request().method(), url, status, codigo });
              issues.push({
                url,
                kind: "http4xx",
                message: `HTTP ${status} ${res.request().method()}${codigo ? ` ${codigo}` : ""}`,
              });
            }
          };
          page.on("response", onProbe);
          try {
            await page.goto(key, { waitUntil: "domcontentloaded", timeout: 15000 });
            await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => undefined);
            const snap = await snapshotRoute(page, captured);
            rotas.push(snap);
            const recusa = await page
              .getByText(/n[aã]o permite|sem permiss|acesso negado/i)
              .first()
              .innerText()
              .catch(() => "");
            if (recusa.trim()) recusasVisiveis.push(recusa.trim().slice(0, 160));

            if (opts.escopo.modo !== "focado" || opts.escopo.paths.length === 0) {
              const hrefs = await page.$$eval("a[href], [role='link']", (els) =>
                els.map((el) => {
                  const withHref = el as { href?: string };
                  return withHref.href || el.getAttribute("href") || "";
                }),
              );
              for (const href of hrefs) {
                if (!href || !sameOrigin(origin, href) || skipHref(href)) continue;
                const clean = href.split("#")[0] ?? href;
                if (!visited.has(clean)) queue.push(clean);
              }
            }
          } catch (err) {
            issues.push({
              url: key,
              kind: "pageerror",
              message: err instanceof Error ? err.message : String(err),
            });
          } finally {
            page.off("response", onProbe);
          }
        }
      } finally {
        page.off("response", attach);
        await page.close();
      }

      perfis.push({
        label,
        loginMasked: maskLogin(access.login),
        loginOk,
        rotas,
        recusasVisiveis: [...new Set(recusasVisiveis)],
      });
      opts.onLog(`mapa: ${label} — ${rotas.length} rota(s)`);
    }
  } finally {
    await browser.close();
  }

  const map: ProfileMapFile = {
    version: 1,
    baseUrl: opts.baseUrl,
    at: new Date().toISOString(),
    escopo: opts.escopo,
    ...(opts.fingerprint ? { fingerprint: opts.fingerprint } : {}),
    perfis,
  };

  const falhas = join(scriptsDir(), "falhas");
  mkdirSync(falhas, { recursive: true });
  const mapPath = join(falhas, "MAPA-PERFIL.json");
  writeFileSync(mapPath, JSON.stringify(map, null, 2) + "\n", "utf8");
  const explore = writeExploreCompat(map, uniqueIssues(issues));
  opts.onLog(`mapa por perfil gravado → ${mapPath.replace(/\\/g, "/")}`);
  return { map, explore };
}

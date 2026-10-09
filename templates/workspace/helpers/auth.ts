import { type Locator, type Page, expect } from "@playwright/test";
import { e2eAccessEnv } from "./access";
import { e2eEnv } from "./env";

/** Rotas e contexto da aplicação sob teste. Ajuste pelo .env do QA Agent, sem editar este arquivo. */
const LOGIN_PATH = process.env.E2E_LOGIN_PATH?.trim() || "/login";
const HOME_PATH = process.env.E2E_HOME_PATH?.trim() || "/";
const CONTEXT_NAME = process.env.E2E_CONTEXT?.trim() || "";

const USER_FIELD = /e-?mail|usu[aá]rio|login|user ?name|cpf|documento/i;
const PASSWORD_FIELD = /senha|password/i;
const SUBMIT = /entrar|acessar|login|log in|sign in|continuar|continue/i;
const CONTEXT_PICKER =
  /(selecion(ar|e)|escolh(er|a)|select|choose)\s+(o |a |um |uma |your |an? )?(contexto|empresa|conta|organiza|workspace|perfil|unidade|tenant|context|account|organization|company|profile)/i;
const NOT_A_CONTEXT = /sair|logout|sign.?out|cancelar|cancel|voltar|back/i;

async function fillCredential(field: Locator, value: string): Promise<void> {
  await field.click();
  await field.fill("");
  await field.pressSequentially(value, { delay: 15 });
  await expect(field).toHaveValue(value, { timeout: 2_000 });
}

async function firstVisible(candidates: Locator[]): Promise<Locator | undefined> {
  for (const c of candidates) {
    const el = c.first();
    if (await el.isVisible().catch(() => false)) return el;
  }
  return undefined;
}

function onLoginPath(page: Page): boolean {
  try {
    return new URL(page.url()).pathname.startsWith(LOGIN_PATH);
  } catch {
    return false;
  }
}

/** Indica se a pagina ja parece autenticada (sessao ou storageState). */
export async function isAuthenticated(page: Page): Promise<boolean> {
  if (!/^https?:/.test(page.url()) || onLoginPath(page)) return false;
  const passwordVisible = await page
    .locator('input[type="password"]')
    .first()
    .isVisible()
    .catch(() => false);
  return !passwordVisible;
}

export async function login(page: Page, opts?: { force?: boolean }): Promise<void> {
  return loginAs(page, 1, opts);
}

export async function loginAs(
  page: Page,
  access: number | string,
  opts?: { force?: boolean },
): Promise<void> {
  const env = typeof access === "number" && access <= 1 ? e2eEnv() : e2eAccessEnv(access);

  if (!opts?.force) {
    await page.goto(HOME_PATH);
    if (await isAuthenticated(page)) return;
  }

  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await page.goto(LOGIN_PATH);
    const password = page.getByLabel(PASSWORD_FIELD).or(page.locator('input[type="password"]')).first();
    await password.waitFor({ state: "visible" });

    const preferred = env.authKind === "cpf" ? /cpf|documento/i : /e-?mail/i;
    const user = await firstVisible([
      page.getByLabel(preferred),
      page.getByPlaceholder(preferred),
      page.getByLabel(USER_FIELD),
      page.getByPlaceholder(USER_FIELD),
      page.locator('input[type="email"], input[name*="user" i], input[name*="login" i]'),
    ]);
    if (!user) throw new Error(`Campo de usuario nao encontrado em ${LOGIN_PATH}. Ajuste E2E_LOGIN_PATH no .env.`);

    const userValue = env.authKind === "cpf" ? env.cpf || env.login : env.email || env.login;
    await fillCredential(user, userValue);
    await fillCredential(password, env.senha);

    const submit = await firstVisible([
      page.locator('form button[type="submit"], form input[type="submit"]'),
      page.getByRole("button", { name: SUBMIT }),
    ]);
    if (submit) await submit.click();
    else await password.press("Enter");

    try {
      await expect(password).toBeHidden({ timeout: 15_000 });
      return;
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      await page.waitForTimeout(1_000 * attempt);
    }
  }
}

/**
 * Escolhe o contexto (empresa, conta, workspace...) quando a aplicacao pede depois do login.
 * Com E2E_CONTEXT no .env, clica nesse nome; sem ele, clica no primeiro botao da tela de escolha.
 */
export async function selectContext(
  page: Page,
  contextName: string | RegExp | undefined = CONTEXT_NAME || undefined,
): Promise<void> {
  if (contextName) {
    const target = page
      .getByRole("button", { name: contextName })
      .or(page.getByRole("option", { name: contextName }))
      .or(page.getByRole("link", { name: contextName }))
      .first();
    if (await target.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await target.click();
      await page.waitForLoadState("domcontentloaded").catch(() => undefined);
    }
    return;
  }
  const picker = page.getByRole("heading", { name: CONTEXT_PICKER }).first();
  if (!(await picker.isVisible({ timeout: 2_000 }).catch(() => false))) return;
  const first = page.getByRole("button").filter({ hasNotText: NOT_A_CONTEXT }).first();
  if (await first.isVisible().catch(() => false)) {
    await first.click();
    await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  }
}

/** Garante app autenticado sem relogar se storageState/globalSetup ja fez login. */
export async function ensureAppReady(page: Page): Promise<void> {
  if (await isAuthenticated(page)) return;
  await login(page);
  await selectContext(page);
}

export async function loginWithContext(page: Page): Promise<void> {
  await ensureAppReady(page);
}

export async function gotoAppRoute(page: Page, path: string): Promise<void> {
  await ensureAppReady(page);
  await page.goto(path.startsWith("/") ? path : `/${path}`);
}

export async function expectRefused(page: Page): Promise<void> {
  const refused = page
    .getByRole("alert")
    .or(page.locator('[data-sonner-toast]'))
    .or(page.getByRole("status"));
  await refused.first().waitFor({ state: "visible", timeout: 10_000 }).catch(async () => {
    const disabled = page.locator("button[disabled], [aria-disabled='true']").first();
    await disabled.waitFor({ state: "visible", timeout: 5_000 });
  });
}

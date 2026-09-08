import { type Locator, type Page, expect } from "@playwright/test";
import { e2eAccessEnv } from "./access";
import { e2eEnv } from "./env";

async function fillCredential(field: Locator, value: string): Promise<void> {
  await field.click();
  await field.fill("");
  await field.pressSequentially(value, { delay: 15 });
  await expect(field).toHaveValue(value, { timeout: 2_000 });
}

/** Indica se a pagina ja parece autenticada (sessao ou storageState). */
export async function isAuthenticated(page: Page): Promise<boolean> {
  const url = page.url();
  if (url.includes("/login")) return false;
  const inApp =
    /\/app(\/|$)/.test(url) ||
    (await page
      .getByRole("link", { name: /Documentos|Financeiro|Visão geral|LCDPR/i })
      .first()
      .isVisible()
      .catch(() => false));
  return inApp;
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
    await page.goto("/app");
    if (await isAuthenticated(page)) return;
    if (!page.url().includes("/login")) {
      const home = page.getByRole("heading", { name: /Visão geral|Selecionar contexto/i });
      if (await home.isVisible({ timeout: 3_000 }).catch(() => false)) return;
    }
  }

  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await page.goto("/login");
    await page.getByRole("button", { name: "Entrar" }).waitFor({ state: "visible" });
    const emailField = page.getByLabel("E-mail");
    const cpfField = page.getByLabel("CPF");
    const passwordField = page.getByLabel("Senha");
    if (env.authKind === "cpf" && (await cpfField.count()) > 0) {
      await fillCredential(cpfField, env.cpf || env.login);
    } else {
      await fillCredential(emailField, env.email || env.login);
    }
    await fillCredential(passwordField, env.senha);
    await page.getByRole("button", { name: "Entrar" }).click();

    try {
      await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15_000 });
      return;
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      await page.waitForTimeout(1_000 * attempt);
    }
  }
}

export async function selectContext(page: Page, contextName = /Fazenda Horizonte/i): Promise<void> {
  const ctxBtn = page.getByRole("button", { name: contextName });
  const visible = await ctxBtn.isVisible({ timeout: 3_000 }).catch(() => false);
  if (visible) {
    await ctxBtn.click();
    await page.waitForURL(/\/app/, { timeout: 10_000 });
    await page.getByRole("heading", { name: /Visão geral|Selecionar contexto/i }).waitFor({ timeout: 10_000 });
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

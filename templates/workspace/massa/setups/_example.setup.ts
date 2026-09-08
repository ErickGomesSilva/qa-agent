/**
 * Exemplo de setup de massa E2E. Copie para US_XXX_CAyy.setup.ts
 * Executado em runtime pelo QA Agent (apply-massa / rodada full / unblock-massa)
 *
 * Env: BASE_URL, credenciais E2E, E2E_MASSA_* (dados.json)
 */
import { chromium } from "@playwright/test";
import { ensureAppReady } from "../../helpers/auth";
import { e2eEnv } from "../../helpers/env";
import { getMassa, hasMassa, reloadMassa } from "../../helpers/massa";

async function main(): Promise<void> {
  reloadMassa();
  const us = process.env.E2E_MASSA_US_ACL_001_CA02_US ?? "US_ACL_001";
  const ca = process.env.E2E_MASSA_US_ACL_001_CA02_CA ?? "CA02";

  if (!hasMassa(us, ca)) {
    console.log(`massa setup: ${us} ${ca} — sem dados prontos, skip`);
    return;
  }

  const env = e2eEnv();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ baseURL: env.baseURL });
  await ensureAppReady(page);

  const exemplo = getMassa(us, ca, "periodo") ?? getMassa(us, ca, "arquivo_estado");
  console.log(`massa setup: ${us} ${ca} — dado exemplo=${exemplo ?? "N/A"}`);

  // TODO: seed idempotente na aplicacao usando getMassa(us, ca, 'chave')
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { login, selectContext } from "./auth";
import { e2eEnv } from "./env";

const scriptsRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const authDir = join(scriptsRoot, ".auth");
const sessionPath = join(authDir, "session.json");
const fingerprintPath = join(authDir, "fingerprint");

function currentFingerprint(): string {
  const env = e2eEnv();
  return createHash("sha256")
    .update(`${env.baseURL}|${env.authKind}|${env.login}|${env.senha}`)
    .digest("hex");
}

export default async function globalSetup(): Promise<void> {
  mkdirSync(authDir, { recursive: true });
  const fp = currentFingerprint();
  const prev = existsSync(fingerprintPath) ? readFileSync(fingerprintPath, "utf8").trim() : "";

  if (existsSync(sessionPath) && prev === fp) {
    return;
  }

  const browser = await chromium.launch({
    headless: process.env.PLAYWRIGHT_HEADED !== "1" && process.env.PLAYWRIGHT_HEADED !== "true",
  });
  const context = await browser.newContext({ baseURL: e2eEnv().baseURL });
  const page = await context.newPage();

  await login(page, { force: true });
  await selectContext(page);
  await context.storageState({ path: sessionPath });
  writeFileSync(fingerprintPath, fp, "utf8");

  await browser.close();
}

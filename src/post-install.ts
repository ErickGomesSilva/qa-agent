/** Rodado pelo instalador: sincroniza templates do workspace e .env inicial. */
import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./config.ts";
import { ensureWorkspace } from "./workspace.ts";

ensureWorkspace();

const envExample = join(ROOT, ".env.example");
const env = join(ROOT, ".env");
if (!existsSync(env) && existsSync(envExample)) {
  copyFileSync(envExample, env);
  console.log(".env criado a partir de .env.example");
}

console.log("Workspace OK: data/workspace/scripts/ (templates, auth, playwright.config, k6/smoke.js)");

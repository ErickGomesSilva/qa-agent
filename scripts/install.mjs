#!/usr/bin/env node
/**
 * Instalador unificado QA Agent — Windows, Linux e macOS.
 * Uso: node instalar.mjs   |   ./instalar   |   instalar.cmd
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  BIN_DIR,
  CLI_HELP,
  DISPLAY_NAME,
  ROOT,
  addUnixPathToProfile,
  addWindowsUserPath,
  createWindowsStartMenuShortcuts,
  ensureUnixBinWrappers,
  nodeVersionOk,
  packageVersion,
  platformLabel,
  run,
  runNodeScript,
  symlinkUnixCommands,
  writeChromiumMarker,
} from "./install-lib.mjs";

function log(msg) {
  console.log(msg);
}

function main() {
  const ver = packageVersion();
  log(`${DISPLAY_NAME} v${ver} — instalador (${platformLabel()})`);
  log(`Pasta: ${ROOT}`);
  log("");

  if (!nodeVersionOk()) {
    log(`Node.js ${process.versions.node} é antigo. Precisa de >= 22.13.0.`);
    log("Instale em https://nodejs.org e rode o instalador de novo.");
    process.exit(1);
  }
  log(`Node.js ${process.versions.node} ok`);

  log("npm install...");
  if (run("npm", ["install"]) !== 0) process.exit(1);

  log("Verificando TypeScript...");
  const tc = run("npm", ["run", "typecheck"]);
  if (tc !== 0) {
    log("AVISO: typecheck falhou. Instalação continua; reporte o erro se qaagent não abrir.");
  }

  log("Sincronizando workspace (templates Playwright, auth, massa)...");
  if (runNodeScript("src/post-install.ts") !== 0) process.exit(1);

  log("Playwright Chromium (primeira vez pode demorar)...");
  if (run("npx", ["--yes", "playwright", "install", "chromium"]) !== 0) process.exit(1);

  writeChromiumMarker();

  if (existsSync(join(ROOT, ".git"))) {
    log("Configurando git hooks (security-check no pre-commit)...");
    run("node", ["scripts/setup-git-hooks.mjs"]);
  }

  let pathNote = "";
  if (process.platform === "win32") {
    const added = addWindowsUserPath();
    createWindowsStartMenuShortcuts();
    pathNote = added
      ? "IMPORTANTE: feche ESTE terminal e abra um novo para o PATH valer."
      : "O PATH já tinha a pasta bin. Abra um terminal novo mesmo assim.";
  } else {
    ensureUnixBinWrappers();
    const { added, profile } = addUnixPathToProfile();
    const localBin = symlinkUnixCommands();
    pathNote = added
      ? `PATH atualizado em ${profile}. Rode: source ${profile}  (ou abra um terminal novo).`
      : `PATH já configurado. Symlinks em ${localBin} (se ~/.local/bin estiver no PATH, já funciona).`;
  }

  log("");
  log("=== Instalação concluída ===");
  log("");
  log(`Comandos (pasta ${BIN_DIR}):`);
  for (const name of CLI_HELP) {
    log(`  ${name}`);
  }
  log("");
  log("  qaagent --plain          Modo texto");
  log("  qaagent --reconfigure    Refazer configuração");
  log("");
  log("Flags extras no qaagent --plain:");
  log("  --audit-only   --deepen-stubs   --unblock-massa   --tour   --load-only");
  log("");
  if (process.platform === "win32") {
    log("k6 (opcional): winget install GrafanaLabs.k6");
  } else {
    log("k6 (opcional): https://grafana.com/docs/k6/latest/set-up/install-k6/");
  }
  log("  K6_ENABLED=true no .env roda k6 após Playwright passar");
  log("");
  log(pathNote);
  log("");
  log("Primeira vez: qaagent  →  F1 chave, F2 modelo, F3 requisitos, F4 URL, F5 login, F8 rodada, F9 consulta");
  log("");
  log("Desinstalar só o comando: node desinstalar.mjs  (não apaga .env nem data/)");
}

main();

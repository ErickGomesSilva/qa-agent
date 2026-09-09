#!/usr/bin/env node
/**
 * Remove qaagent do PATH / symlinks / Menu Iniciar. Não apaga o código nem data/.
 */
import {
  BIN_DIR,
  DISPLAY_NAME,
  ROOT,
  removeUnixPathFromProfile,
  removeUnixSymlinks,
  removeWindowsStartMenuShortcuts,
  removeWindowsUserPath,
} from "./install-lib.mjs";

console.log(`${DISPLAY_NAME} — desinstalador`);
console.log(`Pasta: ${ROOT}`);
console.log("");

if (process.platform === "win32") {
  removeWindowsUserPath();
  removeWindowsStartMenuShortcuts();
  console.log("Comando qaagent removido do PATH do usuário. Abra um terminal novo.");
} else {
  removeUnixPathFromProfile();
  removeUnixSymlinks();
  console.log("PATH e symlinks removidos. Rode source ~/.bashrc ou abra um terminal novo.");
}

console.log(`O código em ${ROOT}, .env e data/ continuam no disco.`);

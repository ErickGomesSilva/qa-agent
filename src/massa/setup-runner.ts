import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { ROOT } from "../config.ts";
import type { MassaDataEntry } from "./data-types.ts";
import { scriptsDir } from "../workspace.ts";

export function setupsDir(): string {
  return join(scriptsDir(), "massa", "setups");
}

export function setupScriptPath(entry: MassaDataEntry): string {
  const name = entry.setup ?? `${entry.us}_${entry.ca}.setup.ts`;
  return join(setupsDir(), name);
}

export async function runMassaSetupScript(
  entry: MassaDataEntry,
  env: Record<string, string>,
  onLog: (line: string) => void,
): Promise<boolean> {
  const path = setupScriptPath(entry);
  if (!existsSync(path)) {
    onLog(`massa setup: ${entry.us} ${entry.ca} — script ausente (${entry.setup ?? "auto"})`);
    return true;
  }

  const name = entry.setup ?? `${entry.us}_${entry.ca}.setup.ts`;
  onLog(`massa setup: executando ${name} (${entry.us} ${entry.ca})`);

  const tsx = join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
  const runner = existsSync(tsx) ? process.execPath : "npx";
  const args = existsSync(tsx) ? [tsx, path] : ["--yes", "tsx", path];

  const code = await new Promise<number>((resolve, reject) => {
    const child = spawn(runner, args, {
      cwd: scriptsDir(),
      env: { ...process.env, ...env },
      stdio: "inherit",
      shell: process.platform === "win32",
      windowsHide: true,
    });
    child.on("error", reject);
    child.on("close", (c) => resolve(c ?? 1));
  });

  if (code !== 0) {
    onLog(`massa setup: ${name} falhou (codigo ${code})`);
    return false;
  }
  return true;
}

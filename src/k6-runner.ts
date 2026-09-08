import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { config } from "./config.ts";
import { parseK6Summary, writeK6Report, emitK6ReportTerminal } from "./k6-report.ts";
import type { K6Outcome, K6ScriptResult } from "./k6-types.ts";
import { listK6Scripts } from "./workspace.ts";

function spawnCmd(
  cmd: string,
  args: string[],
  cwd: string,
  env: Record<string, string>,
  useShell = false,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      env: { ...process.env, ...env, FORCE_COLOR: "0", NO_COLOR: "1" },
      shell: useShell,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (c: string) => {
      stdout += c;
    });
    child.stderr.on("data", (c: string) => {
      stderr += c;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ stdout, stderr, exitCode: code ?? 1 }));
  });
}

export async function k6Available(): Promise<boolean> {
  try {
    const { exitCode } = await spawnCmd("k6", ["version"], process.cwd(), {}, process.platform === "win32");
    return exitCode === 0;
  } catch {
    return false;
  }
}

export async function ensureK6(onLog?: (line: string) => void): Promise<void> {
  if (await k6Available()) {
    onLog?.("k6: binário encontrado no PATH");
    return;
  }
  throw new Error(
    "k6 não encontrado no PATH. Instale: winget install GrafanaLabs.k6  ou  choco install k6  (https://grafana.com/docs/k6/latest/set-up/install-k6/)",
  );
}

function loadMapaRoutes(): string[] {
  const path = join(config.workspaceDir, "scripts", "falhas", "MAPA-UI.json");
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as { routes?: Array<{ path?: string }> };
    return (raw.routes ?? [])
      .map((r) => r.path)
      .filter((p): p is string => typeof p === "string" && p.startsWith("/"))
      .slice(0, 15);
  } catch {
    return [];
  }
}

export function k6Env(baseUrl: string): Record<string, string> {
  return {
    BASE_URL: baseUrl.replace(/\/+$/, ""),
    K6_VUS: String(config.k6Vus),
    K6_DURATION: config.k6Duration,
    K6_ROUTES: JSON.stringify(loadMapaRoutes()),
  };
}

export async function runK6(opts: {
  runId: string;
  baseUrl: string;
  requisitosPath?: string;
  onLog?: (line: string) => void;
}): Promise<K6Outcome> {
  await ensureK6(opts.onLog);

  const scripts = listK6Scripts();
  if (!scripts.length) {
    throw new Error(
      "Nenhum script k6 em data/workspace/scripts/k6/*.js — template smoke.js sincronizado pelo instalador",
    );
  }

  const outDir = join(config.dataDir, "runs", opts.runId);
  mkdirSync(outDir, { recursive: true });
  const combinedLog = join(outDir, "k6.log");
  const env = k6Env(opts.baseUrl);
  const results: K6ScriptResult[] = [];
  let combined = "";

  for (const script of scripts) {
    const name = basename(script);
    const summaryPath = join(outDir, `k6-${name.replace(/\.js$/i, "")}-summary.json`);
    const logPath = join(outDir, `k6-${name.replace(/\.js$/i, "")}.log`);
    opts.onLog?.(`k6: executando ${name} (vus=${env.K6_VUS} duration=${env.K6_DURATION})`);

    const { stdout, stderr, exitCode } = await spawnCmd(
      "k6",
      ["run", "--summary-export", summaryPath, script],
      join(config.workspaceDir, "scripts", "k6"),
      env,
      false,
    );
    const logText = `${stderr}\n${stdout}`;
    writeFileSync(logPath, logText, "utf8");
    combined += `\n=== ${name} ===\n${logText}\n`;
    const parsed = parseK6Summary(summaryPath);
    results.push({
      script,
      name,
      passed: exitCode === 0,
      exitCode,
      ...parsed,
      summaryPath,
      logPath,
    });
    opts.onLog?.(
      `k6: ${name} → exit=${exitCode} checks=${parsed.checksPass ?? "?"} falhas=${parsed.checksFail ?? "?"}`,
    );
  }

  writeFileSync(combinedLog, combined, "utf8");

  const outcome: K6Outcome = {
    passed: results.every((r) => r.passed),
    scripts: results,
    logPath: combinedLog,
  };
  const { mdPath, jsonPath } = writeK6Report(outcome, opts.requisitosPath);
  outcome.reportMdPath = mdPath;
  outcome.reportJsonPath = jsonPath;
  emitK6ReportTerminal(outcome, opts.onLog ?? console.log);
  return outcome;
}

/** k6 habilitado (ou modo load-only) e com scripts disponíveis. */
export function shouldRunK6(opts?: { mode?: import("./types.ts").RunMode; enabled?: boolean }): boolean {
  if (!listK6Scripts().length) return false;
  if (opts?.mode === "load-only") return true;
  return opts?.enabled ?? config.k6Enabled;
}

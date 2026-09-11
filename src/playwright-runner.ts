import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.ts";
import { formatPlaywrightStreamLine } from "./run-telemetry.ts";
import type { PlaywrightFailure, PlaywrightOutcome } from "./types.ts";
import { playwrightCli } from "./workspace.ts";

type PwJson = {
  stats?: {
    expected?: number;
    unexpected?: number;
    skipped?: number;
    flaky?: number;
  };
  suites?: PwSuite[];
};

type PwSuite = {
  title?: string;
  file?: string;
  suites?: PwSuite[];
  specs?: Array<{
    title?: string;
    file?: string;
    tests?: Array<{
      results?: Array<{
        status?: string;
        error?: { message?: string };
        errors?: Array<{ message?: string }>;
      }>;
    }>;
  }>;
};

function collectFailures(suite: PwSuite, parent: string[], acc: PlaywrightFailure[]): void {
  const titles = suite.title ? [...parent, suite.title] : parent;
  for (const spec of suite.specs ?? []) {
    const name = [...titles, spec.title ?? ""].filter(Boolean).join(" › ");
    for (const test of spec.tests ?? []) {
      for (const result of test.results ?? []) {
        if (result.status !== "unexpected" && result.status !== "failed") continue;
        const error =
          result.error?.message ??
          result.errors?.map((e) => e.message).filter(Boolean).join("\n") ??
          "(sem mensagem)";
        acc.push({
          title: name,
          file: spec.file ?? suite.file,
          error,
          grepHint: grepFromTitle(name),
        });
      }
    }
  }
  for (const child of suite.suites ?? []) collectFailures(child, titles, acc);
}

function grepFromTitle(title: string): string | undefined {
  const us = title.match(/US_[A-Z0-9_]+/);
  const ca = title.match(/CA\d+/);
  if (us && ca) return `${us[0]}.*${ca[0]}`;
  if (us) return us[0];
  return undefined;
}

function extractJson(text: string): PwJson {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Playwright não emitiu JSON.parseável. Veja o log da rodada.");
  }
  return JSON.parse(text.slice(start, end + 1)) as PwJson;
}

export async function runPlaywright(opts: {
  e2eDir: string;
  grep: string;
  runId: string;
  env?: Record<string, string>;
  onLog?: (line: string) => void;
  grepInvert?: string;
  shouldAbort?: () => boolean;
}): Promise<PlaywrightOutcome> {
  const cli = playwrightCli();
  if (!existsSync(cli)) {
    throw new Error(`Playwright CLI não encontrado em ${cli}. Rode npm install no QA-Agent.`);
  }

  const outDir = join(config.dataDir, "runs", opts.runId);
  mkdirSync(outDir, { recursive: true });
  const rawJsonPath = join(outDir, "playwright.json");
  const logPath = join(outDir, "playwright.log");

  const args = [cli, "test", "--max-failures=1", "--reporter=list", "--reporter=json"];
  if (opts.grep) {
    args.push("--grep", opts.grep);
  }
  if (opts.grepInvert) {
    args.push("--grep-invert", opts.grepInvert);
  }
  if (config.playwrightHeaded) {
    args.push("--headed");
  }

  opts.onLog?.(
    `▸ fase: Playwright — grep=${opts.grep || "(todos)"}${opts.grepInvert ? ` invert=${opts.grepInvert}` : ""} max-failures=1`,
  );

  const { stdout, stderr, exitCode } = await spawnNode(
    args,
    opts.e2eDir,
    opts.env,
    opts.onLog,
    opts.shouldAbort,
  );
  const combined = `${stderr}\n${stdout}`;
  writeFileSync(logPath, combined, "utf8");

  let parsed: PwJson = {};
  try {
    parsed = extractJson(stdout || stderr);
    writeFileSync(rawJsonPath, JSON.stringify(parsed, null, 2), "utf8");
  } catch (err) {
    writeFileSync(rawJsonPath, stdout || combined, "utf8");
    if (exitCode !== 0) {
      return {
        passed: false,
        exitCode,
        stats: { expected: 0, unexpected: 1, skipped: 0 },
        failures: [
          {
            title: "Playwright (saída não-JSON)",
            error: String(err instanceof Error ? err.message : err) + "\n" + combined.slice(-4000),
          },
        ],
        rawJsonPath,
        logPath,
      };
    }
    throw err;
  }

  const failures: PlaywrightFailure[] = [];
  for (const suite of parsed.suites ?? []) collectFailures(suite, [], failures);
  const stats = {
    expected: parsed.stats?.expected ?? 0,
    unexpected: parsed.stats?.unexpected ?? failures.length,
    skipped: parsed.stats?.skipped ?? 0,
    flaky: parsed.stats?.flaky,
  };

  const ran = stats.expected + stats.unexpected + stats.skipped + (stats.flaky ?? 0);
  if (ran === 0) {
    return {
      passed: false,
      exitCode: exitCode === 0 ? 1 : exitCode,
      stats,
      failures: [
        {
          title: "Nenhum teste executado",
          error: opts.grep
            ? `Grep "${opts.grep}" não casou nenhum teste. Gere specs com @executavel ou esvazie PLAYWRIGHT_GREP.`
            : "A pasta scripts/tests não executou nenhum teste.",
        },
      ],
      rawJsonPath,
      logPath,
    };
  }

  return {
    passed: exitCode === 0 && failures.length === 0,
    exitCode,
    stats,
    failures,
    rawJsonPath,
    logPath,
  };
}

function spawnNode(
  args: string[],
  cwd: string,
  extraEnv?: Record<string, string>,
  onLog?: (line: string) => void,
  shouldAbort?: () => boolean,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd,
      env: { ...process.env, ...extraEnv, FORCE_COLOR: "0", NO_COLOR: "1" },
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let outBuf = "";
    let errBuf = "";
    let aborted = false;

    const flushLines = (buf: string, isErr: boolean): string => {
      const parts = buf.split(/\r?\n/);
      const rest = parts.pop() ?? "";
      for (const raw of parts) {
        const formatted = formatPlaywrightStreamLine(raw);
        if (formatted) onLog?.(formatted);
        else if (isErr && raw.trim() && !raw.trim().startsWith("{")) onLog?.(raw.trim().slice(0, 160));
      }
      return rest;
    };

    const abortTimer = shouldAbort
      ? setInterval(() => {
          if (!shouldAbort() || aborted) return;
          aborted = true;
          onLog?.("pausa: encerrando Playwright…");
          try {
            child.kill("SIGTERM");
          } catch {
            /* ignore */
          }
          setTimeout(() => {
            try {
              if (!child.killed) child.kill("SIGKILL");
            } catch {
              /* ignore */
            }
          }, 2000);
        }, 800)
      : undefined;

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      outBuf = flushLines(outBuf + chunk, false);
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      errBuf = flushLines(errBuf + chunk, true);
    });
    child.on("error", (err) => {
      if (abortTimer) clearInterval(abortTimer);
      reject(err);
    });
    child.on("close", (code) => {
      if (abortTimer) clearInterval(abortTimer);
      if (outBuf.trim()) flushLines(`${outBuf}\n`, false);
      if (errBuf.trim()) flushLines(`${errBuf}\n`, true);
      resolve({ stdout, stderr, exitCode: aborted ? 130 : (code ?? 1) });
    });
  });
}

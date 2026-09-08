import { createRl } from "./ask.ts";
import { startRun } from "./orchestrator.ts";
import { applySavedSettings } from "./setup.ts";
import { t } from "./i18n.ts";
import { runTui } from "./tui/app.ts";
import { printBanner, printErr, printKv, printLogLine, printOk, printSection } from "./tui/plain.ts";
import { runWizard } from "./wizard.ts";
import { ensureWorkspace, scriptsDir } from "./workspace.ts";

function print(line = ""): void {
  console.log(line);
}

async function runPlain(): Promise<void> {
  const auditOnly = process.argv.includes("--audit-only");
  const deepenStubs = process.argv.includes("--deepen-stubs");
  const unblockMassa = process.argv.includes("--unblock-massa");
  const userTour = process.argv.includes("--tour");
  const loadOnly = process.argv.includes("--load-only");
  const rl = createRl();
  try {
    printBanner();
    const { body } = await runWizard(rl, {
      reconfigure: process.argv.includes("--reconfigure"),
    });
    if (auditOnly) body.mode = "audit-only";
    else if (deepenStubs) body.mode = "deepen-stubs";
    else if (unblockMassa) body.mode = "unblock-massa";
    else if (userTour) body.mode = "user-tour";
    else if (loadOnly) body.mode = "load-only";
    print();
    printSection(t("cli.starting"));
    printKv(t("cli.reqs"), body.requisitosPath ?? "");
    printKv(t("cli.url"), body.baseUrl ?? "");
    printKv(t("cli.scripts"), scriptsDir());
    print();
    const run = await startRun(body, {
      wait: true,
      onLog: (line) => printLogLine(line),
    });
    print();
    printOk(t("cli.end", { status: run.status, error: run.error ? ` - ${run.error}` : "" }));
    if (run.triage) {
      printOk(
        t("cli.triage", {
          classe: run.triage.classe,
          us: run.triage.us ?? "",
          ca: run.triage.ca ?? "",
          resumo: run.triage.resumo,
        }),
      );
    }
    if (run.coverage) {
      printOk(
        t("cli.coverage", {
          real: run.coverage.real,
          rascunho: run.coverage.rascunho,
          massa: run.coverage.skipMassa,
          semUi: run.coverage.semUi,
        }),
      );
    }
    if (run.k6?.reportMdPath) {
      printOk(t("cli.k6Report", { path: run.k6.reportMdPath }));
    }
    const okStatuses = new Set([
      "passed",
      "audit_complete",
      "deepen_complete",
      "unblock_complete",
      "massa_complete",
      "tour_complete",
      "load_complete",
    ]);
    if (!okStatuses.has(run.status)) process.exitCode = 2;
  } catch (err) {
    printErr(t("cli.error", { msg: err instanceof Error ? err.message : String(err) }));
    process.exitCode = 1;
  } finally {
    rl.close();
  }
}

export async function runCli(): Promise<void> {
  ensureWorkspace();
  applySavedSettings();

  const plain = process.argv.includes("--plain") || !process.stdin.isTTY || !process.stdout.isTTY;
  if (plain) {
    await runPlain();
    return;
  }

  try {
    await runTui();
  } catch (err) {
    printErr(t("cli.error", { msg: err instanceof Error ? err.message : String(err) }));
    process.exitCode = 1;
  }
}

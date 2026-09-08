import { config, resolveRequisitosPath } from "./config.ts";
import { runCoverageAudit } from "./coverage-audit.ts";
import { emitCoverageReportTerminal, writeCoverageReport } from "./coverage-report.ts";
import { loadSettings } from "./settings.ts";
import { ensureWorkspace } from "./workspace.ts";

ensureWorkspace();

const settings = loadSettings();
const requisitosPath = settings.requisitosPath
  ? resolveRequisitosPath(settings.requisitosPath)
  : undefined;

const audit = runCoverageAudit({
  onLog: (line) => console.log(line),
  autoDowngrade: config.autoDowngradeStubs,
  strict: config.strictCoverage,
});

const report = writeCoverageReport({ audit, requisitosPath });
emitCoverageReportTerminal(report);

if (report.summary.downgradedThisRun > 0) {
  console.log(`Rebaixados nesta execução: ${report.summary.downgradedThisRun}`);
}

process.exitCode = config.strictCoverage && audit.warnings.length > 0 ? 2 : 0;

import { formatReportKind, formatReportStats, listAllReports } from "./coverage-list.ts";
import { getLocale, t } from "./i18n.ts";
import { displayReportInTerminal } from "./open-report.ts";
import { ensureWorkspace } from "./workspace.ts";

ensureWorkspace();

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(getLocale(), { hour12: false });
}

const reports = listAllReports();
const openArg = process.argv.find((a) => a.startsWith("--open="));
const openIdx = process.argv.indexOf("--open");

if (!reports.length) {
  console.log(t("reports.empty"));
  process.exitCode = 0;
} else {
  console.log("");
  console.log(t("reports.cliTitle", { n: reports.length }));
  console.log("");
  reports.forEach((r, i) => {
    const stats = formatReportStats(r);
    const line = stats ? `${stats}` : "";
    console.log(
      `${String(i + 1).padStart(2, " ")}. [${formatReportKind(r)}] ${r.projectSlug.padEnd(16)} ${fmtWhen(r.modifiedAt)}`,
    );
    console.log(`    ${r.mdPath}`);
    if (line) console.log(`    ${line}`);
  });
  console.log("");
  console.log(t("reports.cliHint"));
}

if (openArg || openIdx >= 0) {
  const raw = openArg?.slice("--open=".length) ?? process.argv[openIdx + 1];
  if (!raw) {
    console.error(t("reports.openUsage"));
    process.exitCode = 1;
  } else {
    const byIdx = Number(raw);
    const entry = Number.isInteger(byIdx) && byIdx >= 1 && byIdx <= reports.length
      ? reports[byIdx - 1]
      : reports.find((r) => r.projectSlug.toLowerCase() === raw.toLowerCase());
    if (!entry) {
      console.error(t("reports.notFound", { id: raw }));
      process.exitCode = 1;
    } else {
      displayReportInTerminal(entry.mdPath);
      console.log(t("reports.displayed", { path: entry.mdPath }));
    }
  }
}

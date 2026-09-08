import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { K6Outcome, K6SummaryExport } from "./k6-types.ts";
import { projectSlugFromPath } from "./project-name.ts";
import { scriptsDir } from "./workspace.ts";

export function parseK6Summary(jsonPath: string): {
  checksPass?: number;
  checksFail?: number;
  httpReqFailedRate?: number;
  httpReqDurationP95?: number;
} {
  if (!existsSync(jsonPath)) return {};
  try {
    const raw = JSON.parse(readFileSync(jsonPath, "utf8")) as K6SummaryExport;
    const m = raw.metrics ?? {};
    const checks = m.checks;
    const failed = m.http_req_failed;
    const duration = m.http_req_duration;
    const checksPass = checks?.values?.passes ?? checks?.passes;
    const checksFail = checks?.values?.fails ?? checks?.fails;
    const httpReqFailedRate = failed?.values?.rate ?? failed?.value;
    const httpReqDurationP95 = duration?.values?.["p(95)"] ?? duration?.["p(95)"];
    return {
      checksPass,
      checksFail,
      httpReqFailedRate,
      httpReqDurationP95,
    };
  } catch {
    return {};
  }
}

export function writeK6Report(out: K6Outcome, requisitosPath?: string): { mdPath: string; jsonPath: string } {
  const slug = requisitosPath ? projectSlugFromPath(requisitosPath) : "projeto";
  const base = `K6-RESUMO-${slug}`;
  const dir = join(scriptsDir(), "falhas");
  const mdPath = join(dir, `${base}.md`);
  const jsonPath = join(dir, `${base}.json`);

  const lines = [
    `# Resumo k6 — ${slug.replace(/-/g, " ")}`,
    "",
    `Gerado em: ${new Date().toISOString()}`,
    "",
    "| Script | Resultado | checks ok/falha | http falhou | p95 (ms) |",
    "|--------|-----------|-----------------|-------------|----------|",
  ];

  for (const s of out.scripts) {
    const ok = s.passed ? "OK" : "FALHOU";
    const checks =
      s.checksPass !== undefined ? `${s.checksPass}/${s.checksFail ?? 0}` : "—";
    const failRate =
      s.httpReqFailedRate !== undefined ? `${(s.httpReqFailedRate * 100).toFixed(2)}%` : "—";
    const p95 = s.httpReqDurationP95 !== undefined ? s.httpReqDurationP95.toFixed(0) : "—";
    lines.push(`| ${s.name} | ${ok} | ${checks} | ${failRate} | ${p95} |`);
  }

  lines.push("", "## Detalhes", "");
  for (const s of out.scripts) {
    lines.push(`### ${s.name}`, "", `- Script: \`${s.script}\``, `- Log: \`${s.logPath}\``);
    if (existsSync(s.summaryPath)) lines.push(`- Summary JSON: \`${s.summaryPath}\``);
    lines.push("");
  }

  writeFileSync(mdPath, lines.join("\n"), "utf8");
  writeFileSync(jsonPath, JSON.stringify({ ...out, mdPath }, null, 2), "utf8");
  return { mdPath, jsonPath };
}

export function emitK6ReportTerminal(out: K6Outcome, log: (line: string) => void = console.log): void {
  log("");
  log("══════════════════════════════════════════════════════════");
  log("  RESUMO k6 (carga / smoke HTTP)");
  log("══════════════════════════════════════════════════════════");
  for (const s of out.scripts) {
    const status = s.passed ? "OK" : "FALHOU";
    const metrics = [
      s.checksPass !== undefined ? `checks ${s.checksPass}/${(s.checksFail ?? 0) + s.checksPass}` : "",
      s.httpReqDurationP95 !== undefined ? `p95 ${s.httpReqDurationP95.toFixed(0)}ms` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    log(`  ${status}  ${s.name}${metrics ? ` — ${metrics}` : ""}`);
  }
  if (out.reportMdPath) log(`  Relatório: ${out.reportMdPath}`);
  log("══════════════════════════════════════════════════════════");
  log("");
}

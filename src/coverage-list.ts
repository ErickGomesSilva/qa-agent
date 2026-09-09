import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { CoverageReportDetail } from "./coverage-report.ts";
import type { K6Outcome } from "./k6-types.ts";
import { scriptsDir } from "./workspace.ts";

export type ReportKind = "cobertura" | "k6" | "matriz" | "quarentena" | "jornada";

export type ReportEntry = {
  kind: ReportKind;
  projectSlug: string;
  mdPath: string;
  jsonPath: string;
  modifiedAt: string;
  summary?: CoverageReportDetail["summary"];
  playwright?: CoverageReportDetail["playwright"];
  k6?: K6Outcome;
};

/** @deprecated use ReportEntry */
export type CoverageReportEntry = ReportEntry;

const COBERTURA_PREFIX = "COBERTURA-RESUMO";
const K6_PREFIX = "K6-RESUMO";

function slugFromBasename(prefix: string, base: string): string {
  if (base === prefix) return "geral";
  if (base.startsWith(`${prefix}-`)) return base.slice(prefix.length + 1);
  return base;
}

function readCoberturaEntry(dir: string, fileName: string): ReportEntry | undefined {
  if (!fileName.endsWith(".md") || !fileName.startsWith(COBERTURA_PREFIX)) return undefined;
  const mdPath = join(dir, fileName);
  const base = fileName.replace(/\.md$/i, "");
  const jsonPath = join(dir, `${base}.json`);
  let summary: CoverageReportDetail["summary"] | undefined;
  let playwright: CoverageReportDetail["playwright"];
  if (existsSync(jsonPath)) {
    try {
      const detail = JSON.parse(readFileSync(jsonPath, "utf8")) as CoverageReportDetail;
      summary = detail.summary;
      playwright = detail.playwright;
    } catch {
      /* ignore */
    }
  }
  return {
    kind: "cobertura",
    projectSlug: slugFromBasename(COBERTURA_PREFIX, base),
    mdPath,
    jsonPath,
    modifiedAt: statSync(mdPath).mtime.toISOString(),
    summary,
    playwright,
  };
}

function readNamedMd(
  dir: string,
  fileName: string,
  kind: ReportKind,
  slug: string,
): ReportEntry | undefined {
  if (!fileName.endsWith(".md")) return undefined;
  const mdPath = join(dir, fileName);
  const jsonPath = join(dir, fileName.replace(/\.md$/i, ".json"));
  return {
    kind,
    projectSlug: slug,
    mdPath,
    jsonPath,
    modifiedAt: statSync(mdPath).mtime.toISOString(),
  };
}

function readSpecial(dir: string, fileName: string): ReportEntry | undefined {
  if (fileName === "MATRIZ.md") return readNamedMd(dir, fileName, "matriz", "matriz");
  if (fileName === "QUARENTENA.md") return readNamedMd(dir, fileName, "quarentena", "quarentena");
  if (fileName === "JORNADA.md") return readNamedMd(dir, fileName, "jornada", "jornada");
  return undefined;
}

function readK6Entry(dir: string, fileName: string): ReportEntry | undefined {
  if (!fileName.endsWith(".md") || !fileName.startsWith(K6_PREFIX)) return undefined;
  const mdPath = join(dir, fileName);
  const base = fileName.replace(/\.md$/i, "");
  const jsonPath = join(dir, `${base}.json`);
  let k6: K6Outcome | undefined;
  if (existsSync(jsonPath)) {
    try {
      k6 = JSON.parse(readFileSync(jsonPath, "utf8")) as K6Outcome;
    } catch {
      /* ignore */
    }
  }
  return {
    kind: "k6",
    projectSlug: slugFromBasename(K6_PREFIX, base),
    mdPath,
    jsonPath,
    modifiedAt: statSync(mdPath).mtime.toISOString(),
    k6,
  };
}

function listFromDir(readFn: (dir: string, name: string) => ReportEntry | undefined): ReportEntry[] {
  const dir = join(scriptsDir(), "falhas");
  if (!existsSync(dir)) return [];
  const entries: ReportEntry[] = [];
  for (const name of readdirSync(dir)) {
    const row = readFn(dir, name);
    if (row) entries.push(row);
  }
  return entries.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

/** Resumos COBERTURA-RESUMO*.md */
export function listCoverageReports(): ReportEntry[] {
  return listFromDir(readCoberturaEntry);
}

/** Resumos K6-RESUMO*.md */
export function listK6Reports(): ReportEntry[] {
  return listFromDir(readK6Entry);
}

/** Cobertura + k6, mais recente primeiro. */
export function listAllReports(): ReportEntry[] {
  const dir = join(scriptsDir(), "falhas");
  if (!existsSync(dir)) return [];
  const byKey = new Map<string, ReportEntry>();
  for (const name of readdirSync(dir)) {
    const row = readCoberturaEntry(dir, name) ?? readK6Entry(dir, name) ?? readSpecial(dir, name);
    if (row) byKey.set(row.mdPath, row);
  }
  return [...byKey.values()].sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

export function formatReportKind(entry: ReportEntry): string {
  if (entry.kind === "k6") return "k6";
  if (entry.kind === "matriz") return "matriz";
  if (entry.kind === "quarentena") return "quarentena";
  if (entry.kind === "jornada") return "jornada";
  return "cobertura";
}

export function formatReportStats(entry: ReportEntry): string {
  if (entry.kind === "k6") {
    const k6 = entry.k6;
    if (!k6?.scripts?.length) return "k6";
    const ok = k6.scripts.filter((s) => s.passed).length;
    const total = k6.scripts.length;
    const status = k6.passed ? "OK" : "FALHOU";
    const first = k6.scripts[0];
    const p95 =
      first?.httpReqDurationP95 !== undefined ? `p95 ${first.httpReqDurationP95.toFixed(0)}ms` : "";
    return [`k6 ${status}`, `${ok}/${total} script(s)`, p95].filter(Boolean).join(" · ");
  }
  const s = entry.summary;
  if (!s) return "";
  const parts = [`${s.total} CAs`, `reais ${s.real}`];
  const pw = entry.playwright;
  if (pw?.passed || pw?.failed || pw?.skipped) {
    parts.push(`pw ${pw.passed?.length ?? 0}/${pw.failed?.length ?? 0}/${pw.skipped?.length ?? 0}`);
  }
  return parts.join(" · ");
}

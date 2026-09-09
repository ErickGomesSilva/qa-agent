import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { listParsedSpecTests } from "./coverage-audit.ts";
import { loadCoverageFile } from "./coverage-migrate.ts";
import type { CoverageNivel } from "./coverage-types.ts";
import type { PlaywrightTestRow } from "./playwright-parse.ts";
import { parsePlaywrightJsonFile } from "./playwright-parse.ts";
import { loadProductFindings, type ProductFinding } from "./product-findings.ts";
import { projectSlugFromPath } from "./project-name.ts";
import { loadQuarantine } from "./quarantine.ts";
import { listRequirementCases, listRequirementRns } from "./req-sync.ts";
import type { StuckCase } from "./types.ts";
import { scriptsDir } from "./workspace.ts";

export type MatrixKind = "ca" | "rn" | "variante" | "jornada" | "api";
export type MatrixVariant = "feliz" | "negativo" | "permissao" | "vazio" | "limite";
export type MatrixLast =
  | "passed"
  | "failed"
  | "skipped"
  | "never"
  | "stuck"
  | "produto"
  | "na";

export type MatrixRow = {
  us?: string;
  ca?: string;
  rn?: string;
  kind: MatrixKind;
  variant?: MatrixVariant;
  title: string;
  specPath?: string;
  nivel?: CoverageNivel | "orfao";
  last: MatrixLast;
  detail: string;
};

export type TraceMatrix = {
  at: string;
  projectSlug: string;
  counts: Record<MatrixLast, number> & { total: number };
  rows: MatrixRow[];
};

export function matrixJsonPath(): string {
  return join(scriptsDir(), "falhas", "MATRIZ.json");
}

export function matrixMdPath(): string {
  return join(scriptsDir(), "falhas", "MATRIZ.md");
}

function variantFromTitle(title: string): MatrixVariant | undefined {
  const m = title.match(/variante\s*:\s*(negativo|permissao|permissão|vazio|limite)/i);
  if (!m) return undefined;
  const v = m[1]!.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (v === "negativo") return "negativo";
  if (v === "permissao") return "permissao";
  if (v === "vazio") return "vazio";
  if (v === "limite") return "limite";
  return undefined;
}

function kindFromTitle(title: string, file: string): MatrixKind {
  if (/@jornada\b/i.test(title) || /jornadas\.spec/i.test(file)) return "jornada";
  if (/@api\b/i.test(title)) return "api";
  if (variantFromTitle(title) || /@variante\b/i.test(title)) return "variante";
  if (/\bRN[_-]?[A-Z0-9]+/i.test(title) && !/\bCA\d+/i.test(title)) return "rn";
  return "ca";
}

export function lastLabel(last: MatrixLast): string {
  switch (last) {
    case "passed":
      return "passou";
    case "failed":
      return "falhou";
    case "skipped":
      return "pulado";
    case "never":
      return "nunca rodou";
    case "stuck":
      return "não finalizado";
    case "produto":
      return "produto";
    case "na":
      return "N/A (sem UI)";
  }
}

function matchRow(
  us: string | undefined,
  ca: string | undefined,
  title: string,
  rows: PlaywrightTestRow[],
): PlaywrightTestRow | undefined {
  return (
    rows.find((r) => r.title === title) ??
    rows.find((r) => us && r.us === us && ca && r.ca === ca && r.title.includes(title.slice(0, 24))) ??
    rows.find((r) => us && r.us === us && ca && r.ca === ca)
  );
}

export function buildTraceMatrix(opts: {
  requisitosPath?: string;
  playwrightJsonPath?: string;
  stuck?: StuckCase[];
  products?: ProductFinding[];
}): TraceMatrix {
  const casos = listRequirementCases();
  const rns = listRequirementRns();
  const cob = loadCoverageFile();
  const specs = listParsedSpecTests();
  const pwRows =
    opts.playwrightJsonPath && existsSync(opts.playwrightJsonPath)
      ? parsePlaywrightJsonFile(opts.playwrightJsonPath)
      : [];
  const stuck = opts.stuck ?? loadQuarantine().cases;
  const products = opts.products ?? loadProductFindings();
  const slug = projectSlugFromPath(opts.requisitosPath ?? "");

  const rows: MatrixRow[] = [];
  const coveredSpec = new Set<string>();

  for (const c of casos) {
    const cobCase = cob?.casos.find((x) => x.us === c.us && x.ca === c.ca);
    const specHits = specs.filter((s) => s.us === c.us && s.ca === c.ca);
    const nivel = cobCase?.nivel;
    if (!specHits.length) {
      rows.push({
        us: c.us,
        ca: c.ca,
        kind: "ca",
        variant: "feliz",
        title: `${c.us} ${c.ca}`,
        specPath: cobCase?.specPath,
        nivel: nivel ?? "orfao",
        last: nivel === "sem-ui" ? "na" : "never",
        detail: nivel === "sem-ui" ? "sem superfície UI — não aplicável" : "sem spec",
      });
      continue;
    }
    for (const spec of specHits) {
      coveredSpec.add(`${spec.file}::${spec.title}`);
      const variant =
        variantFromTitle(spec.title) ?? (kindFromTitle(spec.title, spec.file) === "ca" ? "feliz" : undefined);
      const kind = kindFromTitle(spec.title, spec.file);
      const rel = relative(scriptsDir(), spec.file).replace(/\\/g, "/");
      const pw = matchRow(spec.us, spec.ca, spec.title, pwRows);
      const st = stuck.find((s) => s.us === spec.us && (!s.ca || s.ca === spec.ca));
      const prod = products.find((p) => p.us === spec.us && (!p.ca || p.ca === spec.ca));
      let last: MatrixLast = "never";
      let detail = cobCase?.motivo || "";
      if (nivel === "sem-ui" || /@sem-ui\b/i.test(spec.title)) {
        last = "na";
        detail = "sem superfície UI — não aplicável";
      } else if (st) {
        last = "stuck";
        detail = st.reason;
      } else if (prod) {
        last = "produto";
        detail = prod.resumo;
      } else if (pw) {
        last = pw.status;
        detail = pw.error ?? pw.reason ?? "";
      }
      rows.push({
        us: spec.us,
        ca: spec.ca,
        kind,
        variant,
        title: spec.title,
        specPath: rel,
        nivel,
        last,
        detail,
      });
    }
  }

  for (const spec of specs) {
    if (coveredSpec.has(`${spec.file}::${spec.title}`)) continue;
    const kind = kindFromTitle(spec.title, spec.file);
    const rel = relative(scriptsDir(), spec.file).replace(/\\/g, "/");
    const pw = matchRow(spec.us, spec.ca, spec.title, pwRows);
    const rn = spec.title.match(/\bRN[_-]?[A-Z0-9]+\b/i)?.[0];
    rows.push({
      us: spec.us,
      ca: spec.ca,
      rn,
      kind,
      variant: variantFromTitle(spec.title),
      title: spec.title,
      specPath: rel,
      last: pw?.status ?? "never",
      detail: pw?.error ?? pw?.reason ?? "",
    });
  }

  for (const rn of rns) {
    const has = rows.some((r) => r.rn === rn.rn || r.title.includes(rn.rn));
    if (has) continue;
    rows.push({
      us: rn.us,
      rn: rn.rn,
      kind: "rn",
      title: `${rn.rn} ${rn.texto}`.slice(0, 120),
      last: "never",
      detail: "RN no requisito sem teste observável",
    });
  }

  const counts: TraceMatrix["counts"] = {
    total: rows.length,
    passed: 0,
    failed: 0,
    skipped: 0,
    never: 0,
    stuck: 0,
    produto: 0,
    na: 0,
  };
  for (const r of rows) counts[r.last] += 1;

  return { at: new Date().toISOString(), projectSlug: slug, counts, rows };
}

function mdMatrix(m: TraceMatrix): string {
  const lines = [
    `# Matriz de rastreio — ${m.projectSlug || "projeto"}`,
    "",
    `Gerado em: ${m.at}`,
    "",
    "## Totais",
    "",
    `| Total | Passou | Falhou | Pulado | Nunca | Não finalizado | Produto | N/A |`,
    `|-------|--------|--------|--------|-------|----------------|---------|-----|`,
    `| ${m.counts.total} | ${m.counts.passed} | ${m.counts.failed} | ${m.counts.skipped} | ${m.counts.never} | ${m.counts.stuck} | ${m.counts.produto} | ${m.counts.na} |`,
    "",
    "## Linhas",
    "",
    "| US | CA/RN | Tipo | Último | Detalhe |",
    "|----|-------|------|--------|---------|",
  ];
  for (const r of m.rows) {
    const id = r.ca || r.rn || "—";
    const det = (r.detail || "").replace(/\|/g, "/").slice(0, 80);
    lines.push(
      `| ${r.us ?? "—"} | ${id} | ${r.kind}${r.variant && r.variant !== "feliz" ? `:${r.variant}` : ""} | ${lastLabel(r.last)} | ${det} |`,
    );
  }
  return lines.join("\n") + "\n";
}

export function writeTraceMatrix(opts: {
  requisitosPath?: string;
  playwrightJsonPath?: string;
  stuck?: StuckCase[];
  products?: ProductFinding[];
}): { matrix: TraceMatrix; jsonPath: string; mdPath: string } {
  const matrix = buildTraceMatrix(opts);
  mkdirSync(join(scriptsDir(), "falhas"), { recursive: true });
  const jsonPath = matrixJsonPath();
  const mdPath = matrixMdPath();
  writeFileSync(jsonPath, JSON.stringify(matrix, null, 2) + "\n", "utf8");
  writeFileSync(mdPath, mdMatrix(matrix), "utf8");
  return { matrix, jsonPath, mdPath };
}

export function loadTraceMatrix(): TraceMatrix | undefined {
  const path = matrixJsonPath();
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as TraceMatrix;
  } catch {
    return undefined;
  }
}

export function formatMatrixTerminal(m: TraceMatrix, max = 24): string[] {
  const lines = [
    `  MATRIZ ${m.projectSlug}  total=${m.counts.total}  passou=${m.counts.passed}  falhou=${m.counts.failed}  nunca=${m.counts.never}  ★=${m.counts.stuck}  produto=${m.counts.produto}  N/A=${m.counts.na}`,
  ];
  for (const r of m.rows.slice(0, max)) {
    const id = [r.us, r.ca || r.rn].filter(Boolean).join(" ") || r.title.slice(0, 40);
    lines.push(`  · ${id}  [${r.kind}]  ${lastLabel(r.last)}`);
  }
  if (m.rows.length > max) lines.push(`  … +${m.rows.length - max} na F9 Consulta`);
  return lines;
}

export function listJourneyFiles(): { mdPath: string; jsonPath: string; modifiedAt: string }[] {
  const falhas = join(scriptsDir(), "falhas");
  const md = join(falhas, "JORNADA.md");
  const json = join(falhas, "JORNADA.json");
  if (!existsSync(md)) return [];
  return [{ mdPath: md, jsonPath: json, modifiedAt: statSync(md).mtime.toISOString() }];
}

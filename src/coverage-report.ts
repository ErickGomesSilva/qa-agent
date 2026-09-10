import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { auditSummaryFromFindings } from "./coverage-audit.ts";
import { loadCoverageFile } from "./coverage-migrate.ts";
import type { CoverageAuditResult, CoverageNivel, CoverageSummary } from "./coverage-types.ts";
import {
  formatImpedimentsTerminal,
  writeImpedimentsReport,
  type ImpedimentsReport,
} from "./impediments.ts";
import { manifestSummary, loadMassaManifest } from "./massa/manifest.ts";
import {
  groupPlaywrightRows,
  parsePlaywrightJsonFile,
  type PlaywrightTestRow,
} from "./playwright-parse.ts";
import { coverageReportBasename, projectSlugFromPath } from "./project-name.ts";
import type { PlaywrightOutcome, ProductFinding, StuckCase } from "./types.ts";
import { scriptsDir } from "./workspace.ts";

export type NaoRodadoRow = {
  us: string;
  ca: string;
  nivel: CoverageNivel;
  motivo: string;
  titulo?: string;
};

export type CoverageReportDetail = {
  projectSlug: string;
  projectLabel: string;
  at: string;
  summary: CoverageSummary;
  playwright?: {
    passed: PlaywrightTestRow[];
    failed: PlaywrightTestRow[];
    skipped: PlaywrightTestRow[];
  };
  naoRodados: NaoRodadoRow[];
  triage?: { classe: string; us?: string; ca?: string; resumo: string };
  stuckCases?: StuckCase[];
  productFindings?: ProductFinding[];
  problemas?: ImpedimentsReport;
};

export type CoverageReportInput = {
  audit?: CoverageAuditResult;
  playwright?: PlaywrightOutcome;
  requisitosPath?: string;
  triage?: CoverageReportDetail["triage"];
  stuckCases?: StuckCase[];
  productFindings?: ProductFinding[];
  /** Abrir o .md no visualizador padrão após gravar (rodadas com Playwright). */
  openMd?: boolean;
};

export type CoverageReportOutput = {
  summary: CoverageSummary;
  detail: CoverageReportDetail;
  jsonPath: string;
  mdPath: string;
};

export function buildCoverageSummary(input: CoverageReportInput): CoverageSummary {
  const cob = loadCoverageFile();
  const findings = input.audit?.findings ?? [];
  const summary = auditSummaryFromFindings(findings, cob?.casos);
  if (input.audit) summary.downgradedThisRun = input.audit.downgraded;
  return summary;
}

function caseKey(us?: string, ca?: string): string {
  return us && ca ? `${us}:${ca}` : "";
}

function buildDetail(input: CoverageReportInput): CoverageReportDetail {
  const requisitosPath = input.requisitosPath ?? "";
  const projectSlug = requisitosPath ? projectSlugFromPath(requisitosPath) : "projeto";
  const summary = buildCoverageSummary(input);

  let pwGroups: CoverageReportDetail["playwright"];
  const ranKeys = new Set<string>();

  if (input.playwright?.rawJsonPath) {
    try {
      const rows = parsePlaywrightJsonFile(input.playwright.rawJsonPath);
      pwGroups = groupPlaywrightRows(rows);
      for (const r of rows) {
        const k = caseKey(r.us, r.ca);
        if (k) ranKeys.add(k);
      }
    } catch {
      pwGroups = undefined;
    }
  }

  const cob = loadCoverageFile();
  const findings = input.audit?.findings ?? [];
  const naoRodados: NaoRodadoRow[] = [];

  const pushNao = (us: string, ca: string, nivel: CoverageNivel, motivo: string, titulo?: string) => {
    const k = caseKey(us, ca);
    if (k && ranKeys.has(k)) return;
    if (nivel === "real" || nivel === "api") return;
    naoRodados.push({ us, ca, nivel, motivo: motivo || nivel, titulo });
  };

  if (cob?.casos.length) {
    for (const c of cob.casos) {
      const nivel = (c.nivel ?? (c.coberto ? "real" : "sem-ui")) as CoverageNivel;
      pushNao(c.us, c.ca, nivel, c.massaNecessaria || c.motivo || nivel, c.titulo);
    }
  } else {
    for (const f of findings) {
      pushNao(f.us, f.ca, f.nivel, f.massaNecessaria ?? f.motivo);
    }
  }

  return {
    projectSlug,
    projectLabel: projectSlug.replace(/-/g, " "),
    at: new Date().toISOString(),
    summary,
    playwright: pwGroups,
    naoRodados: naoRodados.sort((a, b) => `${a.us}:${a.ca}`.localeCompare(`${b.us}:${b.ca}`)),
    triage: input.triage,
    stuckCases: input.stuckCases ?? [],
    productFindings: input.productFindings ?? [],
  };
}

function nivelLabel(n: CoverageNivel): string {
  switch (n) {
    case "rascunho":
      return "rascunho (stub)";
    case "skip-massa":
      return "massa/perfil";
    case "sem-ui":
      return "sem UI";
    case "api":
      return "API";
    default:
      return n;
  }
}

function mdList(rows: PlaywrightTestRow[], max = 200): string[] {
  const lines: string[] = [];
  const slice = rows.slice(0, max);
  for (const r of slice) {
    const id = r.us && r.ca ? `**${r.us} ${r.ca}** — ` : "";
    const short = r.title.includes(" › ") ? r.title.split(" › ").pop()! : r.title;
    lines.push(`- ${id}${short}`);
    if (r.reason) lines.push(`  - *Motivo:* ${r.reason}`);
    if (r.error) {
      const errLines = r.error.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 4);
      for (const err of errLines) {
        lines.push(`  - *Erro:* \`${err.slice(0, 300)}\``);
      }
    }
  }
  if (rows.length > max) lines.push(`- … e mais **${rows.length - max}**`);
  return lines;
}

function mdNaoRodados(rows: NaoRodadoRow[], max = 150): string[] {
  const lines: string[] = [];
  const byNivel = new Map<CoverageNivel, NaoRodadoRow[]>();
  for (const r of rows) {
    const list = byNivel.get(r.nivel) ?? [];
    list.push(r);
    byNivel.set(r.nivel, list);
  }
  for (const [nivel, list] of byNivel) {
    lines.push(`### ${nivelLabel(nivel)} (${list.length})`, "");
    for (const r of list.slice(0, max)) {
      lines.push(`- **${r.us} ${r.ca}** — ${r.titulo ?? r.motivo}`);
      if (r.motivo && r.titulo) lines.push(`  - *Motivo:* ${r.motivo}`);
    }
    if (list.length > max) lines.push(`- … e mais **${list.length - max}**`);
    lines.push("");
  }
  return lines;
}

function mdReport(detail: CoverageReportDetail, pw?: PlaywrightOutcome): string {
  const s = detail.summary;
  const lines = [
    `# Resumo de cobertura — ${detail.projectLabel}`,
    "",
    `Projeto: \`${detail.projectSlug}\``,
    `Gerado em: ${detail.at}`,
    "",
    "## Visão geral",
    "",
    "| Métrica | Qtd |",
    "|---------|-----|",
    `| CAs no requisito (total) | ${s.total} |`,
    `| Executáveis reais (@executavel) | ${s.real} |`,
    `| Rascunho (stub) | ${s.rascunho} |`,
    `| Bloqueados massa/perfil | ${s.skipMassa} |`,
    `| Sem UI | ${s.semUi} |`,
    "",
  ];

  if (detail.problemas && detail.problemas.totais.total > 0) {
    const p = detail.problemas.totais;
    lines.push(
      "## Problemas e impedimentos",
      "",
      `Detalhe completo: \`scripts/falhas/PROBLEMAS.md\` (F9 → **5**).`,
      "",
      `| Total | Bloqueios | Produto | Falhas | Avisos |`,
      `|-------|-----------|---------|--------|--------|`,
      `| ${p.total} | ${p.bloqueio} | ${p.produto} | ${p.falha} | ${p.aviso} |`,
      "",
    );
    for (const item of detail.problemas.itens.slice(0, 25)) {
      const id = [item.us, item.ca].filter(Boolean).join(" ");
      lines.push(`- **[${item.severity}]** ${id ? `${id} — ` : ""}${item.titulo}`);
      lines.push(`  - ${item.detalhe.slice(0, 280)}`);
      lines.push(`  - *Impacto:* ${item.impacto}`);
      lines.push(`  - *Próximo passo:* ${item.proximoPasso}`);
    }
    if (detail.problemas.itens.length > 25) {
      lines.push(`- … e mais **${detail.problemas.itens.length - 25}** em PROBLEMAS.md`);
    }
    lines.push("");
  }

  if (detail.playwright) {
    const { passed, failed, skipped } = detail.playwright;
    lines.push(
      "## Rodada Playwright",
      "",
      "| Resultado | Qtd |",
      "|-----------|-----|",
      `| Passou | ${passed.length} |`,
      `| Falhou | ${failed.length} |`,
      `| Pulado (test.skip) | ${skipped.length} |`,
      "",
    );

    if (failed.length) {
      lines.push(`## Falharam (${failed.length})`, "", ...mdList(failed), "");
    }
    if (skipped.length) {
      lines.push(
        `## Pulados na rodada (${skipped.length})`,
        "",
        "Testes que casaram o grep mas tinham `test.skip` ou não rodaram o fluxo.",
        "",
        ...mdList(skipped),
        "",
      );
    }
    if (passed.length) {
      lines.push(`## Passaram (${passed.length})`, "", ...mdList(passed, 80), "");
    }
  } else if (pw) {
    lines.push(
      "## Playwright",
      "",
      `- OK: ${pw.stats.expected} | Falhas: ${pw.stats.unexpected} | Pulados: ${pw.stats.skipped}`,
      "",
    );
  }

  if (detail.stuckCases?.length) {
    lines.push(
      `## ★ Não finalizados (${detail.stuckCases.length})`,
      "",
      `Esgotaram ${detail.stuckCases[0]?.attempts ?? "?"} retomadas TESTE. A suíte **seguiu** para o próximo caso.`,
      "",
    );
    for (const c of detail.stuckCases) {
      const id = [c.us, c.ca].filter(Boolean).join(" ") || c.title;
      lines.push(`- **${id}**`);
      lines.push(`  - ${c.title}`);
      lines.push(`  - ${c.reason}`);
    }
    lines.push("");
  }

  if (detail.productFindings?.length) {
    lines.push(
      `## Produto nesta rodada (${detail.productFindings.length})`,
      "",
      "A suíte **seguiu** após cada PRODUTO (F7 Seguir após produto).",
      "",
    );
    for (const p of detail.productFindings) {
      const id = [p.us, p.ca].filter(Boolean).join(" ") || p.title;
      lines.push(`- **${id}** — ${p.resumo}`);
    }
    lines.push("");
  }

  if (detail.triage) {
    lines.push(
      "## Triagem (falha que parou a suíte)",
      "",
      `- Classe: **${detail.triage.classe}**`,
      `- Caso: ${detail.triage.us ?? "—"} ${detail.triage.ca ?? ""}`,
      `- ${detail.triage.resumo}`,
      "",
    );
  }

  const nao = detail.naoRodados.filter((r) => r.nivel !== "real" && r.nivel !== "api");
  if (nao.length) {
    lines.push(
      `## Não executados nesta rodada (${nao.length})`,
      "",
      "Fora do recorte Playwright (ex.: `@rascunho`, `@massa`, `sem-ui`) ou não casaram o grep.",
      "",
      ...mdNaoRodados(nao),
    );
  }

  const massa = manifestSummary(loadMassaManifest());
  if (massa.total > 0) {
    lines.push(
      "## Massa E2E (manifest)",
      "",
      `| pendente | ${massa.pendente} | desbloqueado | ${massa.desbloqueado} | total | ${massa.total} |`,
      "",
    );
  }

  if (s.downgradedThisRun > 0) {
    lines.push(`> ${s.downgradedThisRun} spec(s) rebaixados de @executavel para @rascunho nesta auditoria.`, "");
  }

  return lines.join("\n");
}

const TERMINAL_MAX = 12;

function terminalLines(rows: PlaywrightTestRow[], max: number): string[] {
  return rows.slice(0, max).map((r) => {
    const id = r.us && r.ca ? `${r.us} ${r.ca}` : r.title.slice(0, 70);
    if (r.status === "skipped" && r.reason) return `  · ${id} — ${r.reason.slice(0, 90)}`;
    if (r.status === "failed" && r.error) {
      return `  · ${id} — ${r.error.split("\n")[0]?.slice(0, 90)}`;
    }
    return `  · ${id}`;
  });
}

/** Linhas de resumo para terminal / TUI. */
export function formatCoverageReportTerminal(out: CoverageReportOutput): string[] {
  const d = out.detail;
  const s = d.summary;
  const lines: string[] = [
    "",
    "══════════════════════════════════════════════════════════",
    `  RESUMO — ${d.projectLabel}`,
    "══════════════════════════════════════════════════════════",
    `  Requisitos: ${s.total} CAs | reais: ${s.real} | rascunho: ${s.rascunho} | massa: ${s.skipMassa} | sem-ui: ${s.semUi}`,
  ];

  if (d.problemas && d.problemas.totais.total > 0) {
    lines.push("");
    lines.push(...formatImpedimentsTerminal(d.problemas, 12));
    lines.push("");
  }

  if (d.playwright) {
    const { passed, failed, skipped } = d.playwright;
    lines.push(`  Playwright: ${passed.length} passou | ${failed.length} falhou | ${skipped.length} pulou`, "");

    if (failed.length) {
      lines.push(`  FALHARAM (${failed.length})`, ...terminalLines(failed, TERMINAL_MAX), "");
    }
    if (skipped.length) {
      lines.push(`  PULADOS (${skipped.length})`, ...terminalLines(skipped, TERMINAL_MAX));
      if (skipped.length > TERMINAL_MAX) lines.push(`  … +${skipped.length - TERMINAL_MAX} (ver MD)`);
      lines.push("");
    }
    if (passed.length) {
      lines.push(`  PASSARAM (${passed.length})`, ...terminalLines(passed, TERMINAL_MAX));
      if (passed.length > TERMINAL_MAX) lines.push(`  … +${passed.length - TERMINAL_MAX} (ver MD)`);
      lines.push("");
    }
  }

  const nao = d.naoRodados.filter((r) => r.nivel === "rascunho" || r.nivel === "sem-ui");
  if (nao.length) {
    lines.push(
      `  NÃO RODADOS (${nao.length} rascunho/sem-ui)`,
      ...nao.slice(0, 8).map((r) => `  · ${r.us} ${r.ca} [${nivelLabel(r.nivel)}] ${r.motivo.slice(0, 60)}`),
      "",
    );
  }

  if (d.stuckCases?.length) {
    lines.push(`  ★ NÃO FINALIZADOS (${d.stuckCases.length}) — suíte seguiu após limite TESTE`);
    for (const c of d.stuckCases) {
      const id = [c.us, c.ca].filter(Boolean).join(" ") || c.title.slice(0, 70);
      lines.push(`  ★ ${id} — ${c.reason}`);
    }
    lines.push("");
  }

  if (d.productFindings?.length) {
    lines.push(`  PRODUTO (${d.productFindings.length}) — suíte seguiu`);
    for (const p of d.productFindings) {
      const id = [p.us, p.ca].filter(Boolean).join(" ") || p.title.slice(0, 70);
      lines.push(`  ▸ ${id} — ${p.resumo}`);
    }
    lines.push("");
  }

  if (d.triage) {
    lines.push(`  TRIAGEM: ${d.triage.classe} — ${d.triage.resumo.slice(0, 100)}`, "");
  }

    lines.push(`  Relatório: ${out.mdPath}  |  Problemas: scripts/falhas/PROBLEMAS.md`);
    lines.push("══════════════════════════════════════════════════════════", "");
  return lines;
}

/** Imprime resumo legível no terminal. */
export function printCoverageReportTerminal(out: CoverageReportOutput): void {
  for (const line of formatCoverageReportTerminal(out)) console.log(line);
}

/** Emite resumo via callback (orquestrador / TUI). */
export function emitCoverageReportTerminal(
  out: CoverageReportOutput,
  log: (line: string) => void = console.log,
): void {
  for (const line of formatCoverageReportTerminal(out)) log(line);
}

export function writeCoverageReport(input: CoverageReportInput): CoverageReportOutput {
  const detail = buildDetail(input);
  detail.problemas = writeImpedimentsReport({
    requisitosPath: input.requisitosPath,
    audit: input.audit,
    playwright: detail.playwright,
    stuckCases: input.stuckCases,
    productFindings: input.productFindings,
    triage: input.triage,
  }).report;
  const base = coverageReportBasename(detail.projectSlug);
  const jsonPath = join(scriptsDir(), "falhas", `${base}.json`);
  const mdPath = join(scriptsDir(), "falhas", `${base}.md`);

  writeFileSync(
    jsonPath,
    JSON.stringify({ ...detail, playwrightOutcome: input.playwright?.stats }, null, 2),
    "utf8",
  );
  writeFileSync(mdPath, mdReport(detail, input.playwright), "utf8");

  return { summary: detail.summary, detail, jsonPath, mdPath };
}

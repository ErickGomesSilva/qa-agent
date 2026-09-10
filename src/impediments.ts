import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CoverageAuditResult, CoverageFile, CoverageNivel } from "./coverage-types.ts";
import { loadCoverageFile } from "./coverage-migrate.ts";
import { loadMassaManifest } from "./massa/manifest.ts";
import type { MassaManifestEntry } from "./massa/types.ts";
import type { PlaywrightTestRow } from "./playwright-parse.ts";
import type { ProfileMapFile } from "./profile-map.ts";
import { loadProductFindings } from "./product-findings.ts";
import { projectSlugFromPath } from "./project-name.ts";
import { loadQuarantine } from "./quarantine.ts";
import type { SyncDiffEntry } from "./req-sync.ts";
import type { RoteiroFile } from "./roteiro.ts";
import type { ProductFinding, StuckCase, TriageClass } from "./types.ts";
import { scriptsDir } from "./workspace.ts";

export type ImpedimentSeverity = "bloqueio" | "produto" | "falha" | "aviso";

export type ImpedimentCategoria =
  | "playwright"
  | "produto"
  | "quarentena"
  | "massa"
  | "cobertura"
  | "permissao"
  | "mapa-http"
  | "sync"
  | "auditoria"
  | "exploracao"
  | "triagem"
  | "roteiro";

export type Impediment = {
  severity: ImpedimentSeverity;
  categoria: ImpedimentCategoria;
  us?: string;
  ca?: string;
  titulo: string;
  detalhe: string;
  impacto: string;
  evidencias: string[];
  proximoPasso: string;
};

export type ImpedimentsReport = {
  version: 1;
  at: string;
  projectSlug: string;
  totais: { total: number; bloqueio: number; produto: number; falha: number; aviso: number };
  itens: Impediment[];
};

export type ImpedimentsInput = {
  requisitosPath?: string;
  audit?: CoverageAuditResult;
  playwright?: { passed: PlaywrightTestRow[]; failed: PlaywrightTestRow[]; skipped: PlaywrightTestRow[] };
  stuckCases?: StuckCase[];
  productFindings?: ProductFinding[];
  triage?: { classe: string; us?: string; ca?: string; resumo: string };
  cobertura?: CoverageFile;
  roteiro?: RoteiroFile;
  mapa?: ProfileMapFile;
  sync?: { entries: SyncDiffEntry[] };
  exploracao?: { issues?: Array<{ kind: string; url: string; message: string }> };
  massaEntries?: MassaManifestEntry[];
};

const SEVERITY_ORDER: ImpedimentSeverity[] = ["bloqueio", "produto", "falha", "aviso"];

function readJson<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return undefined;
  }
}

function falhasDir(): string {
  return join(scriptsDir(), "falhas");
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "").replace(/\s+/g, " ").trim();
}

function clip(s: string, n = 500): string {
  const t = stripAnsi(s);
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

function keyOf(us?: string, ca?: string, extra = ""): string {
  return `${us ?? ""}:${ca ?? ""}:${extra}`;
}

export function loadImpedimentArtifacts(): Pick<
  ImpedimentsInput,
  | "cobertura"
  | "roteiro"
  | "mapa"
  | "sync"
  | "exploracao"
  | "stuckCases"
  | "productFindings"
  | "triage"
  | "audit"
  | "massaEntries"
> {
  const dir = falhasDir();
  const roteiro = readJson<RoteiroFile>(join(dir, "ROTEIRO.json"));
  const mapa = readJson<ProfileMapFile>(join(dir, "MAPA-PERFIL.json"));
  const sync = readJson<{ entries: SyncDiffEntry[] }>(join(dir, "SYNC-DIFF.json"));
  const exploracao = readJson<{ issues?: Array<{ kind: string; url: string; message: string }> }>(
    join(dir, "EXPLORACAO.json"),
  );
  const triageRaw = readJson<{
    classe?: string;
    us?: string;
    ca?: string;
    resumo?: string;
  }>(join(dir, "TRIAGEM.json"));
  const auditRaw = readJson<CoverageAuditResult>(join(dir, "AUDITORIA.json"));
  return {
    cobertura: loadCoverageFile() ?? undefined,
    roteiro,
    mapa,
    sync,
    exploracao,
    stuckCases: loadQuarantine().cases,
    productFindings: loadProductFindings(),
    triage:
      triageRaw?.classe && triageRaw.resumo
        ? { classe: triageRaw.classe, us: triageRaw.us, ca: triageRaw.ca, resumo: triageRaw.resumo }
        : undefined,
    audit: auditRaw?.findings ? auditRaw : undefined,
    massaEntries: loadMassaManifest().entries.filter((e) => e.status === "pendente"),
  };
}

export function buildImpediments(input: ImpedimentsInput): ImpedimentsReport {
  const itens: Impediment[] = [];
  const seen = new Set<string>();
  const push = (item: Impediment) => {
    const k = `${item.categoria}|${keyOf(item.us, item.ca, item.titulo)}`;
    if (seen.has(k)) return;
    seen.add(k);
    itens.push(item);
  };

  const products = input.productFindings ?? [];
  for (const p of products) {
    push({
      severity: "produto",
      categoria: "produto",
      us: p.us,
      ca: p.ca,
      titulo: [p.us, p.ca].filter(Boolean).join(" ") || p.title,
      detalhe: p.resumo || p.title,
      impacto: "A suíte classificou como defeito do produto e seguiu. O CA não está verde.",
      evidencias: [p.title, p.grepHint ? `grep ${p.grepHint}` : ""].filter(Boolean),
      proximoPasso: "Corrigir o produto e retestar este CA (F7 retestar quarentena se estiver ★).",
    });
  }

  for (const c of input.stuckCases ?? []) {
    push({
      severity: "falha",
      categoria: "quarentena",
      us: c.us,
      ca: c.ca,
      titulo: [c.us, c.ca].filter(Boolean).join(" ") || c.title,
      detalhe: `${c.reason} (${c.attempts} tentativa(s) TESTE)`,
      impacto: "Caso em quarentena: a rodada normal não o executa de novo até F7 retestar.",
      evidencias: [c.title, c.grepHint ? `grep ${c.grepHint}` : ""].filter(Boolean),
      proximoPasso: "Abrir o spec, corrigir locator/assert, ligar Retestar quarentena e rodar F8.",
    });
  }

  for (const row of input.playwright?.failed ?? []) {
    push({
      severity: "falha",
      categoria: "playwright",
      us: row.us,
      ca: row.ca,
      titulo: [row.us, row.ca].filter(Boolean).join(" ") || clip(row.title, 80),
      detalhe: clip(row.error ?? "(sem mensagem)", 700),
      impacto: "A suíte parou neste CA (max-failures=1) ou o registrou como falha da rodada.",
      evidencias: [row.file, row.title].filter((x): x is string => Boolean(x)),
      proximoPasso: "Ler o erro: seletor/timeout = TESTE; regra de negócio = PRODUTO; dado ausente = MASSA.",
    });
  }

  for (const row of input.playwright?.skipped ?? []) {
    const reason = row.reason ?? "test.skip";
    const massa = /massa|perfil|credencial|piloto/i.test(reason);
    push({
      severity: massa ? "bloqueio" : "aviso",
      categoria: massa ? "massa" : "playwright",
      us: row.us,
      ca: row.ca,
      titulo: [row.us, row.ca].filter(Boolean).join(" ") || clip(row.title, 80),
      detalhe: reason,
      impacto: massa
        ? "CA não prova o Entao: falta dado ou perfil no F5."
        : "Teste casou o grep mas foi pulado (skip).",
      evidencias: [row.file, row.title].filter((x): x is string => Boolean(x)),
      proximoPasso: massa
        ? "Incluir credencial/rótulo na F5 ou massa em dados.json e remover o skip."
        : "Ver o motivo do skip no spec; se for sem-ui, confirmar no mapa.",
    });
  }

  const cob = input.cobertura;
  const findings = input.audit?.findings ?? [];
  const casos =
    cob?.casos?.length
      ? cob.casos.map((c) => ({
          us: c.us,
          ca: c.ca,
          nivel: (c.nivel ?? (c.coberto ? "real" : "rascunho")) as CoverageNivel,
          motivo: c.massaNecessaria || c.motivo || "",
          titulo: c.titulo,
          specPath: c.specPath,
        }))
      : findings.map((f) => ({
          us: f.us,
          ca: f.ca,
          nivel: f.nivel,
          motivo: f.massaNecessaria ?? f.motivo,
          titulo: f.motivo,
          specPath: f.specPath,
        }));

  for (const c of casos) {
    if (c.nivel === "skip-massa") {
      push({
        severity: "bloqueio",
        categoria: "massa",
        us: c.us,
        ca: c.ca,
        titulo: `${c.us} ${c.ca}`,
        detalhe: c.motivo || c.titulo || "massa/perfil",
        impacto: "Fora do grep @executavel. Cobertura de permissão/dado não está feita.",
        evidencias: [c.specPath, c.titulo].filter((x): x is string => Boolean(x)),
        proximoPasso: "Provisionar o perfil na F5 ou o dado em scripts/massa; gerar spec com loginAs.",
      });
    } else if (c.nivel === "rascunho") {
      push({
        severity: "aviso",
        categoria: "cobertura",
        us: c.us,
        ca: c.ca,
        titulo: `${c.us} ${c.ca}`,
        detalhe: c.motivo || "spec @rascunho / stub (heading ou só navegação)",
        impacto: "Não entra na suíte padrão. O Entao ainda não é assertado.",
        evidencias: [c.specPath].filter((x): x is string => Boolean(x)),
        proximoPasso: "Aprofundar o spec (F8 deepen-stubs ou regenerate) usando o ROTEIRO.json, não só heading.",
      });
    } else if (c.nivel === "sem-ui") {
      push({
        severity: "aviso",
        categoria: "cobertura",
        us: c.us,
        ca: c.ca,
        titulo: `${c.us} ${c.ca}`,
        detalhe: c.motivo || "sem superfície de UI",
        impacto: "N/A na matriz — não é buraco se realmente não houver tela/API.",
        evidencias: [c.specPath].filter((x): x is string => Boolean(x)),
        proximoPasso: "Conferir o mapa por perfil; se a tela existir, o join deveria ter gerado rota (não sem-ui).",
      });
    }
  }

  const roteiro = input.roteiro;
  if (roteiro?.coberturaPermissao.aviso) {
    push({
      severity: "bloqueio",
      categoria: "permissao",
      titulo: "Cobertura de permissão incompleta",
      detalhe: roteiro.coberturaPermissao.aviso,
      impacto: "Variantes de perfil não podem ser dadas como cobertas. Um login não prova o outro papel.",
      evidencias: ["scripts/falhas/ROTEIRO.json"],
      proximoPasso: "Cadastrar na F5 um acesso por papel citado nas US (rótulo = nome do perfil).",
    });
  }
  for (const linha of roteiro?.linhas ?? []) {
    if (linha.esperado === "massa") {
      push({
        severity: "bloqueio",
        categoria: "roteiro",
        us: linha.us,
        ca: linha.ca,
        titulo: `${linha.us} ${linha.ca}`,
        detalhe: `Roteiro: esperado=massa. ${linha.fazer} Perfil citado: ${linha.perfil ?? "(ausente no F5)"}.`,
        impacto: "Generate deve marcar @massa, não inventar login de outro usuário.",
        evidencias: [linha.specHint, `onde: ${linha.onde}`],
        proximoPasso: "Incluir o label F5 do perfil e regenerar specs.",
      });
    }
    if (linha.esperado === "http-ok") {
      const perfil = linha.perfil;
      const rotas = input.mapa?.perfis.find((p) => p.label === perfil)?.rotas ?? [];
      const hit = rotas.find(
        (r) => r.path === linha.onde || r.http.some((h) => h.status === 401 || h.status === 403),
      );
      const recusa = hit?.http.find((h) => h.status === 401 || h.status === 403);
      if (recusa) {
        push({
          severity: "produto",
          categoria: "mapa-http",
          us: linha.us,
          ca: linha.ca,
          titulo: `${linha.us} ${linha.ca} — API recusou consulta no mapa`,
          detalhe: `Menu/rota ${hit?.path ?? linha.onde}: HTTP ${recusa.status} ${recusa.method} ${recusa.url}${recusa.codigo ? ` (${recusa.codigo})` : ""}. O CA autoriza consulta (esperado http-ok). Heading da página não conta.`,
          impacto: "Se o spec só assertar heading, passa verde à toa. O Entao correto deve falhar enquanto o 4xx existir.",
          evidencias: [`${recusa.method} ${recusa.url} → ${recusa.status}`, `perfil ${perfil ?? "?"}`],
          proximoPasso: "Tratar como defeito de produto (permissão/API) e no spec assertar lista/empty/HTTP, não heading.",
        });
      }
    }
  }

  for (const e of input.sync?.entries ?? []) {
    if (e.status === "novo") {
      push({
        severity: "aviso",
        categoria: "sync",
        us: e.us,
        ca: e.ca,
        titulo: `${e.us} ${e.ca} sem spec`,
        detalhe: `CA novo em ${e.arquivo ?? "requisitos"} ainda sem teste.`,
        impacto: "Buraco de cobertura: o requisito existe e o Playwright não.",
        evidencias: [e.arquivo ?? ""].filter(Boolean),
        proximoPasso: "Rodar generate (regenerate) para criar o spec a partir do ROTEIRO.json.",
      });
    } else if (e.status === "orfao") {
      push({
        severity: "aviso",
        categoria: "sync",
        us: e.us,
        ca: e.ca,
        titulo: `${e.us} ${e.ca} spec órfão`,
        detalhe: `Spec ${e.specPath ?? ""} sem CA correspondente nos requisitos.`,
        impacto: "Teste pode estar morto ou o requisito foi removido.",
        evidencias: [e.specPath ?? ""].filter(Boolean),
        proximoPasso: "Apagar o spec órfão ou restaurar o CA no markdown.",
      });
    }
  }

  for (const w of input.audit?.warnings ?? []) {
    push({
      severity: "aviso",
      categoria: "auditoria",
      titulo: "Auditoria de cobertura",
      detalhe: w,
      impacto: "Stub @executavel pode ter sido rebaixado para @rascunho.",
      evidencias: ["scripts/falhas/AUDITORIA.json"],
      proximoPasso: "Reescrever o spec para assertar o Entao (lista/HTTP), não só heading.",
    });
  }

  for (const issue of input.exploracao?.issues ?? []) {
    if (issue.kind === "console") continue;
    const http4 = issue.kind === "http4xx";
    const http5 = issue.kind === "http5xx";
    if (!http4 && !http5 && issue.kind !== "pageerror") continue;
    push({
      severity: http5 || issue.kind === "pageerror" ? "falha" : "aviso",
      categoria: "exploracao",
      titulo: http4 ? "HTTP 401/403 no mapa" : http5 ? "HTTP 5xx no mapa" : "Erro de runtime no browser",
      detalhe: clip(`${issue.message} — ${issue.url}`, 400),
      impacto: http4
        ? "Pode ser recusa esperada de outro perfil ou bug de permissão no perfil que o CA autoriza. Ver ROTEIRO."
        : "Achado do crawler: possível defeito de produto, independente do CA.",
      evidencias: [issue.url, issue.kind],
      proximoPasso: http4
        ? "Cruzar com o perfil do mapa e o esperado do roteiro (http-ok vs http-recusa)."
        : "Reproduzir a URL; se persistir, abrir como PRODUTO.",
    });
  }

  if (input.triage && input.triage.classe !== "TESTE") {
    const classe = input.triage.classe as TriageClass | string;
    const sev: ImpedimentSeverity =
      classe === "PRODUTO" ? "produto" : classe === "MASSA" ? "bloqueio" : classe === "AMBIENTE" ? "bloqueio" : "aviso";
    push({
      severity: sev,
      categoria: "triagem",
      us: input.triage.us,
      ca: input.triage.ca,
      titulo: `Triagem ${classe}`,
      detalhe: input.triage.resumo,
      impacto:
        classe === "PRODUTO"
          ? "Falha atribuída ao produto."
          : classe === "MASSA"
            ? "Falta dado/perfil — não é bug de produto."
            : classe === "AMBIENTE"
              ? "Ambiente/rede/URL impediu o teste."
              : "Triagem inconclusiva; não notificar desenvolvedor ainda.",
      evidencias: ["scripts/falhas/TRIAGEM.json"],
      proximoPasso:
        classe === "MASSA"
          ? "Completar F5 / dados.json e reexecutar o CA."
          : classe === "AMBIENTE"
            ? "Checar BASE_URL, VPN e se o app sobe; depois retomar."
            : "Seguir o PENDENTE.md se existir; não tratar como TESTE.",
    });
  }

  const massaPend = input.massaEntries ?? [];
  for (const e of massaPend) {
    push({
      severity: "bloqueio",
      categoria: "massa",
      us: e.us,
      ca: e.ca,
      titulo: `${e.us} ${e.ca}`,
      detalhe: `${e.motivo}${e.perfil ? ` (perfil ${e.perfil})` : ""}${e.precisa?.length ? ` — precisa: ${e.precisa.join(", ")}` : ""}`,
      impacto: "Manifest de massa ainda pendente.",
      evidencias: [e.specPath ?? ""].filter(Boolean),
      proximoPasso: "Gerar/aplicar massa (F8 com massa ligada, ou qaagent-massa / unblock).",
    });
  }

  itens.sort((a, b) => {
    const ds = SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
    if (ds !== 0) return ds;
    return `${a.us ?? ""}${a.ca ?? ""}`.localeCompare(`${b.us ?? ""}${b.ca ?? ""}`);
  });

  const totais = { total: itens.length, bloqueio: 0, produto: 0, falha: 0, aviso: 0 };
  for (const i of itens) totais[i.severity] += 1;

  return {
    version: 1,
    at: new Date().toISOString(),
    projectSlug: projectSlugFromPath(input.requisitosPath ?? "") || "projeto",
    totais,
    itens,
  };
}

function severityTitle(s: ImpedimentSeverity): string {
  switch (s) {
    case "bloqueio":
      return "Bloqueios (não consegue provar o CA)";
    case "produto":
      return "Produto (defeito ou recusa indevida)";
    case "falha":
      return "Falhas da rodada / runtime";
    default:
      return "Avisos (cobertura incompleta, N/A, sync)";
  }
}

export function mdImpediments(report: ImpedimentsReport): string {
  const t = report.totais;
  const lines = [
    `# Problemas e impedimentos — ${report.projectSlug}`,
    "",
    `Gerado em: ${report.at}`,
    "",
    "O que impede ou distorce a prova dos CAs: bloqueio de massa/perfil, falha Playwright, defeito de produto, HTTP 4xx no mapa, stub, CA sem spec.",
    "",
    "## Totais",
    "",
    `| Total | Bloqueios | Produto | Falhas | Avisos |`,
    `|-------|-----------|---------|--------|--------|`,
    `| ${t.total} | ${t.bloqueio} | ${t.produto} | ${t.falha} | ${t.aviso} |`,
    "",
  ];

  if (!report.itens.length) {
    lines.push("Nenhum impedimento registrado nesta coleta.", "");
    return lines.join("\n");
  }

  let current: ImpedimentSeverity | undefined;
  for (const item of report.itens) {
    if (item.severity !== current) {
      current = item.severity;
      const n = report.itens.filter((i) => i.severity === current).length;
      lines.push(`## ${severityTitle(current)} (${n})`, "");
    }
    const id = [item.us, item.ca].filter(Boolean).join(" ");
    lines.push(`### ${id ? `${id} — ` : ""}${item.titulo}`, "");
    lines.push(`- **Categoria:** ${item.categoria}`);
    lines.push(`- **O que aconteceu:** ${item.detalhe}`);
    lines.push(`- **Impacto:** ${item.impacto}`);
    if (item.evidencias.length) {
      lines.push("- **Evidências:**");
      for (const e of item.evidencias) lines.push(`  - ${e}`);
    }
    lines.push(`- **Próximo passo:** ${item.proximoPasso}`);
    lines.push("");
  }
  return lines.join("\n");
}

export function formatImpedimentsTerminal(report: ImpedimentsReport, max = 16): string[] {
  const t = report.totais;
  const lines = [
    `  PROBLEMAS  total=${t.total}  bloqueio=${t.bloqueio}  produto=${t.produto}  falha=${t.falha}  aviso=${t.aviso}`,
  ];
  for (const item of report.itens.slice(0, max)) {
    const id = [item.us, item.ca].filter(Boolean).join(" ") || item.titulo.slice(0, 36);
    lines.push(`  · [${item.severity}] ${id} — ${clip(item.detalhe, 90)}`);
  }
  if (report.itens.length > max) lines.push(`  … +${report.itens.length - max} em PROBLEMAS.md (F9 → 5)`);
  return lines;
}

export function writeImpedimentsReport(input: ImpedimentsInput): {
  report: ImpedimentsReport;
  jsonPath: string;
  mdPath: string;
} {
  const fromDisk = loadImpedimentArtifacts();
  const report = buildImpediments({
    ...fromDisk,
    ...input,
    cobertura: input.cobertura ?? fromDisk.cobertura,
    roteiro: input.roteiro ?? fromDisk.roteiro,
    mapa: input.mapa ?? fromDisk.mapa,
    sync: input.sync ?? fromDisk.sync,
    exploracao: input.exploracao ?? fromDisk.exploracao,
    stuckCases: input.stuckCases ?? fromDisk.stuckCases,
    productFindings: input.productFindings ?? fromDisk.productFindings,
    triage: input.triage ?? fromDisk.triage,
    audit: input.audit ?? fromDisk.audit,
    massaEntries: input.massaEntries ?? fromDisk.massaEntries,
  });
  const dir = falhasDir();
  mkdirSync(dir, { recursive: true });
  const jsonPath = join(dir, "PROBLEMAS.json");
  const mdPath = join(dir, "PROBLEMAS.md");
  writeFileSync(jsonPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  writeFileSync(mdPath, mdImpediments(report), "utf8");
  return { report, jsonPath, mdPath };
}

export function loadImpedimentsReport(): ImpedimentsReport | undefined {
  return readJson<ImpedimentsReport>(join(falhasDir(), "PROBLEMAS.json"));
}

export function impedimentsMdPath(): string {
  return join(falhasDir(), "PROBLEMAS.md");
}

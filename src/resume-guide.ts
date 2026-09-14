import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { projectSlugFromPath } from "./project-name.ts";
import type { OrchestratorRun, TriageClass } from "./types.ts";
import { listSpecFiles, scriptsDir } from "./workspace.ts";

export type ResumeArtifacts = {
  hasMapa: boolean;
  hasRoteiro: boolean;
  specCount: number;
  hasContinuar: boolean;
};

export type ResumeGuide = {
  kind: string;
  title: string;
  situation: string;
  reuse: string[];
  actions: string[];
  avoid: string[];
  mdPath?: string;
  lines: string[];
};

function stripStamp(line: string): string {
  return line.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s+/, "").trim();
}

function lastPhaseFromLog(log: string[]): string {
  for (let i = log.length - 1; i >= 0; i--) {
    const body = stripStamp(log[i] ?? "");
    const m = body.match(/▸\s*fase:\s*(.+)$/i) || body.match(/fase:\s*(.+)$/i);
    if (m?.[1]) return m[1].trim();
  }
  return "(fase não identificada)";
}

export function detectResumeArtifacts(dir = scriptsDir()): ResumeArtifacts {
  const falhas = join(dir, "falhas");
  return {
    hasMapa: existsSync(join(falhas, "MAPA-PERFIL.json")),
    hasRoteiro: existsSync(join(falhas, "ROTEIRO.json")),
    specCount: listSpecFiles(join(dir, "tests")).length,
    hasContinuar: existsSync(join(falhas, "CONTINUAR.md")),
  };
}

function reuseLines(a: ResumeArtifacts, opts?: { skipLogic?: boolean; skipTour?: boolean }): string[] {
  const out: string[] = [];
  if (a.hasMapa) out.push("MAPA-PERFIL.json — reutilizado se URL/F5/escopo não mudaram");
  else out.push("Mapa — ainda não existe; a próxima rodada vai gerar");
  if (a.hasRoteiro) out.push("ROTEIRO.json — reutilizado (ou só refaz se CAs mudaram)");
  else out.push("Roteiro — ainda não existe; será montado na próxima rodada");
  if (a.specCount > 0) {
    out.push(`${a.specCount} spec(s) — NÃO reescritos (Enter sem R)`);
  } else {
    out.push("Specs — ainda não há *.spec.ts; generate/lógica podem rodar de novo");
  }
  if (opts?.skipLogic) out.push("Agente de lógica/RNs — PULADO (CONTINUAR.md)");
  if (opts?.skipTour) out.push("Jornada headed — PULADA (CONTINUAR.md)");
  return out;
}

function baseAvoid(): string[] {
  return [
    "Não aperte R regenerate a menos que queira forçar mapa+roteiro+specs do zero",
  ];
}

function fatalKind(error: string): string {
  const e = error.toLowerCase();
  if (/run do agente falhou|agente cursor|cursoragent/i.test(error)) return "fatal_agent";
  if (/chromium|playwright install/i.test(e)) return "fatal_chromium";
  if (/credencial|login|senha|base_url|url inválida|url invalida/i.test(e)) return "fatal_config";
  if (/nenhum \*\.spec|sem criar nenhum/i.test(e)) return "fatal_no_specs";
  if (/caminho fora do workspace|erro_ferramenta/i.test(e)) return "fatal_tool";
  if (/limite interno de \d+ voltas/i.test(e)) return "fatal_loop_limit";
  if (/já existe uma rodada/i.test(e)) return "fatal_busy";
  return "fatal_generic";
}

function buildFatalGuide(
  run: OrchestratorRun,
  artifacts: ResumeArtifacts,
  error: string,
): Omit<ResumeGuide, "lines" | "mdPath"> {
  const kind = fatalKind(error);
  const phase = lastPhaseFromLog(run.log);
  const reuse = reuseLines(artifacts);
  const avoid = baseAvoid();

  if (kind === "fatal_agent") {
    return {
      kind,
      title: "Erro fatal — agente LLM",
      situation: `O agente caiu na fase «${phase}». Playwright: ${run.rounds} rodada(s).`,
      reuse,
      actions: [
        "Confira cota/rede/modelo na F1–F2 (e o runId no painel Cursor, se houver)",
        "F8 → Enter SEM R — reaproveita mapa/roteiro/specs já gravados",
        artifacts.specCount
          ? "Com specs no disco, a geração costuma ser pulada; o gargalo tende a ser lógica/triagem"
          : "Sem specs ainda: a lógica/generate pode rodar de novo — desligue tour/massa no F7 para enxugar",
        "Abra F10 durante a nova rodada para acompanhar o LLM",
        "Detalhe: scripts/falhas/FALHA-FATAL.md",
      ],
      avoid,
    };
  }
  if (kind === "fatal_chromium") {
    return {
      kind,
      title: "Erro fatal — Chromium/Playwright",
      situation: `Falhou ao instalar/abrir o browser (fase «${phase}»).`,
      reuse,
      actions: [
        "No terminal da instalação: npx playwright install chromium",
        "F8 → Enter SEM R depois que o Chromium estiver ok",
        "Detalhe: scripts/falhas/FALHA-FATAL.md",
      ],
      avoid,
    };
  }
  if (kind === "fatal_config") {
    return {
      kind,
      title: "Erro fatal — URL ou credenciais",
      situation: `Configuração inválida antes/durante a missão (fase «${phase}»).`,
      reuse: [
        ...reuse.filter((r) => !/spec/i.test(r)),
        "Specs/mapa no disco permanecem — só não rode com R",
      ],
      actions: [
        "Revise F4 (URL) e F5 (logins/arquivo de credenciais)",
        "F8 → Enter SEM R",
        "Detalhe: scripts/falhas/FALHA-FATAL.md",
      ],
      avoid,
    };
  }
  if (kind === "fatal_no_specs") {
    return {
      kind,
      title: "Erro fatal — nenhuma spec gerada",
      situation: `O agente terminou sem criar *.spec.ts (fase «${phase}»).`,
      reuse,
      actions: [
        "Confira F3 (requisitos) e se ROTEIRO.json tem linhas úteis (F9 / pasta falhas)",
        "F8 → Enter SEM R para tentar generate de novo (mapa/roteiro reaproveitam se fingerprint bater)",
        "Se o roteiro estiver vazio/errado: ajuste F5/escopo ou use R só se precisar forçar mapa+roteiro",
        "Detalhe: scripts/falhas/FALHA-FATAL.md",
      ],
      avoid: ["Evite R se o mapa já estiver bom — prefira corrigir requisitos/roteiro"],
    };
  }
  if (kind === "fatal_tool") {
    return {
      kind,
      title: "Erro fatal — ferramenta/caminho",
      situation: `Erro interno de ferramenta ou caminho fora do workspace (fase «${phase}»).`,
      reuse,
      actions: [
        "Atualize o QA Agent (instalador) — versões novas corrigem vários ERRO_FERRAMENTA",
        "F8 → Enter SEM R",
        "Se persistir: abra FALHA-FATAL.md e o run.json em data/runs/",
      ],
      avoid,
    };
  }
  if (kind === "fatal_loop_limit") {
    return {
      kind,
      title: "Erro fatal — limite de voltas da suíte",
      situation: `Muitas retomadas TESTE na mesma missão (fase «${phase}»).`,
      reuse,
      actions: [
        "Veja quarentena/★ na F9 (casos que não fecharam)",
        "Corrija os specs problemáticos ou ligue «retestar quarentena» na F7 se fizer sentido",
        "F8 → Enter SEM R para nova missão enxuta (grep na F7)",
      ],
      avoid,
    };
  }
  return {
    kind,
    title: "Erro fatal",
    situation: `Fluxo interrompido na fase «${phase}»: ${error.slice(0, 160)}`,
    reuse,
    actions: [
      "Leia scripts/falhas/FALHA-FATAL.md (onde parou + próximos passos)",
      "Corrija a causa e F8 → Enter SEM R para reaproveitar mapa/specs",
    ],
    avoid,
  };
}

function triageGuide(
  classe: TriageClass,
  run: OrchestratorRun,
  artifacts: ResumeArtifacts,
): Omit<ResumeGuide, "lines" | "mdPath"> {
  const reuse = reuseLines(artifacts);
  const avoid = baseAvoid();
  const failed = run.playwright?.failures?.[0]?.title?.slice(0, 80);
  const tip = failed ? ` Última falha: ${failed}.` : "";

  if (classe === "TESTE") {
    return {
      kind: "triage_teste",
      title: "Parou — triagem TESTE",
      situation: `Falha classificada como problema de spec/locator.${tip}`,
      reuse,
      actions: [
        run.autoResumeOnTeste && run.triage?.corrigiuTeste
          ? "Auto-resume já tentou corrigir; se parou aqui, revise o spec manualmente"
          : "Revise/ajuste o *.spec.ts indicado no log / COBERTURA",
        "F8 → Enter SEM R — Playwright recomeça do grep (casos ★/produto ficam invertidos se gravados)",
        "F9 → Matriz / Problemas para ver o caso",
      ],
      avoid,
    };
  }
  if (classe === "PRODUTO") {
    return {
      kind: "triage_produto",
      title: "Parou — bug de PRODUTO",
      situation: `Triagem confirmou bug na aplicação sob teste.${tip}`,
      reuse,
      actions: [
        "Trate o bug no produto (webhook pode ter avisado)",
        "Para seguir a suíte sem parar de novo: F7 → «seguir após PRODUTO» = sim, depois F8 Enter SEM R",
        "F9 → Matriz mostra o achado; detalhe em PRODUTO.json / COBERTURA",
      ],
      avoid,
    };
  }
  if (classe === "MASSA") {
    return {
      kind: "triage_massa",
      title: "Parou — MASSA / dado de teste",
      situation: `Falta dado, perfil ou pré-condição de massa.${tip}`,
      reuse,
      actions: [
        "Ajuste scripts/massa/dados.json (ou rode qaagent-massa / F7 massa)",
        "Confira se o perfil F5 casa com o caso (ROTEIRO / loginAs)",
        "F8 → Enter SEM R",
        "F9 → 5 Problemas se houver bloqueio de massa",
      ],
      avoid,
    };
  }
  if (classe === "AMBIENTE") {
    return {
      kind: "triage_ambiente",
      title: "Parou — AMBIENTE (não é bug de produto)",
      situation: `Infra/ferramenta/rede impediu o teste.${tip}`,
      reuse,
      actions: [
        "Leia scripts/falhas/AVISO-AMBIENTE.md e TRIAGEM.json",
        "Corrija VPN, URL, permissão, Chromium ou a própria ferramenta",
        "F8 → Enter SEM R — mapa/specs permanecem",
      ],
      avoid,
    };
  }
  return {
    kind: "triage_inconclusivo",
    title: "Parou — INCONCLUSIVO",
    situation: `Evidência insuficiente para classificar.${tip}`,
    reuse,
    actions: [
      "Abra o log Playwright em falhas/ e o vídeo/trace se houver",
      "Rode de novo headed (F7) ou foque o grep no caso",
      "F8 → Enter SEM R",
    ],
    avoid,
  };
}

/** Guia acionável: o que reaproveitar e o que fazer no próximo Enter. */
export function buildResumeGuide(
  run: Pick<
    OrchestratorRun,
    | "id"
    | "status"
    | "error"
    | "log"
    | "rounds"
    | "triage"
    | "playwright"
    | "stuckCases"
    | "productFindings"
    | "continuarPath"
    | "fatalSummaryPath"
    | "requisitosPath"
    | "projectPath"
    | "skipLogicAgent"
    | "skipTour"
  > & { autoResumeOnTeste?: boolean },
  artifacts: ResumeArtifacts = detectResumeArtifacts(),
): ResumeGuide {
  const status = run.status;
  const error = (run.error ?? "").trim();

  let core: Omit<ResumeGuide, "lines" | "mdPath">;

  if (status === "error" || (error && status !== "paused_user" && /erro fatal/i.test(error))) {
    core = buildFatalGuide(run as OrchestratorRun, artifacts, error || "erro desconhecido");
  } else if (status === "paused_user") {
    core = {
      kind: "paused_user",
      title: "Pausa do usuário — CONTINUAR",
      situation: `Você pausou na fase «${lastPhaseFromLog(run.log)}».`,
      reuse: reuseLines(artifacts, {
        skipLogic: true,
        skipTour: true,
      }),
      actions: [
        "F8 → Enter SEM R — lê CONTINUAR.md e costuma pular lógica/jornada",
        "Mapa/roteiro/specs: reaproveitados se já existirem",
        "Para recomeçar limpo: apague CONTINUAR.md e CONTINUAR.json",
        artifacts.hasContinuar
          ? "Guia: scripts/falhas/CONTINUAR.md"
          : "CONTINUAR.md deveria estar em scripts/falhas/",
      ],
      avoid: baseAvoid(),
    };
  } else if (
    status === "paused_produto" ||
    status === "paused_massa" ||
    status === "paused_ambiente" ||
    status === "paused_inconclusivo" ||
    status === "paused_triage"
  ) {
    const classe: TriageClass =
      run.triage?.classe ??
      (status === "paused_produto"
        ? "PRODUTO"
        : status === "paused_massa"
          ? "MASSA"
          : status === "paused_ambiente"
            ? "AMBIENTE"
            : status === "paused_triage"
              ? "TESTE"
              : "INCONCLUSIVO");
    core = triageGuide(classe, run as OrchestratorRun, artifacts);
  } else if (status === "passed") {
    core = {
      kind: "passed",
      title: "Missão ok",
      situation: `Playwright passou (${run.rounds} rodada(s)).`,
      reuse: reuseLines(artifacts),
      actions: [
        "Nada obrigatório — F9 para relatórios",
        "Próxima Enter na F8 (sem R) reaproveita mapa/specs se fingerprint bater",
      ],
      avoid: baseAvoid(),
    };
  } else if (status === "complete_with_findings") {
    core = {
      kind: "complete_with_findings",
      title: "Suíte terminou com achados PRODUTO",
      situation: `${run.productFindings?.length ?? 0} bug(s) de produto gravados; suíte seguiu.`,
      reuse: reuseLines(artifacts),
      actions: [
        "F9 → Matriz / Problemas para priorizar correções no produto",
        "Nova missão: F8 Enter SEM R (achados ficam na matriz)",
      ],
      avoid: baseAvoid(),
    };
  } else if (status === "load_failed" || status === "load_complete") {
    core = {
      kind: status === "load_failed" ? "load_failed" : "load_complete",
      title: status === "load_failed" ? "k6 falhou após Playwright" : "k6 ok",
      situation:
        status === "load_failed"
          ? "A suíte E2E já tinha resultado; a carga k6 não passou."
          : "Carga k6 concluída.",
      reuse: reuseLines(artifacts),
      actions:
        status === "load_failed"
          ? [
              "Veja K6-RESUMO na F9 / scripts/falhas",
              "Ajuste smoke k6 ou desligue k6 no F7 se não for o foco",
              "F8 Enter SEM R para nova missão E2E (mapa/specs intactos)",
            ]
          : ["F9 para relatórios", "F8 Enter SEM R quando quiser outra rodada"],
      avoid: baseAvoid(),
    };
  } else if (run.stuckCases?.length) {
    core = {
      kind: "stuck",
      title: "Casos ★ não finalizados",
      situation: `${run.stuckCases.length} caso(s) esgotaram retomadas TESTE.`,
      reuse: reuseLines(artifacts),
      actions: [
        "F9 → Quarentena / Matriz (★)",
        "Corrija os specs ou habilite reteste de quarentena no F7",
        "F8 Enter SEM R",
      ],
      avoid: baseAvoid(),
    };
  } else {
    core = {
      kind: "generic",
      title: `Fim — status ${status}`,
      situation: error ? error.slice(0, 160) : `Rodada encerrou como «${status}».`,
      reuse: reuseLines(artifacts),
      actions: [
        "F8 → Enter SEM R para nova missão reaproveitando artefatos",
        "F9 para relatórios / problemas",
      ],
      avoid: baseAvoid(),
    };
  }

  if (run.stuckCases?.length && !["stuck"].includes(core.kind)) {
    core.actions = [
      ...core.actions,
      `${run.stuckCases.length} caso(s) ★ em quarentena — veja F9 Quarentena`,
    ];
  }

  const slug = projectSlugFromPath(run.projectPath || run.requisitosPath);
  const lines = [
    `# Retomar — ${slug}`,
    "",
    `## ${core.title}`,
    "",
    core.situation,
    "",
    "## O que já pode reaproveitar",
    "",
    ...core.reuse.map((r) => `- ${r}`),
    "",
    "## O que fazer agora",
    "",
    ...core.actions.map((a) => `- ${a}`),
    "",
    "## Evite",
    "",
    ...core.avoid.map((a) => `- ${a}`),
    "",
    `Run: \`${run.id}\` · status: **${status}** · Playwright: **${run.rounds}** rodada(s)`,
    "",
  ];

  return { ...core, lines };
}

/** Linhas para telemetria TUI/CLI. */
export function formatResumeGuideTerminal(guide: ResumeGuide): string[] {
  return [
    `━━ Como retomar ━━`,
    guide.title,
    guide.situation,
    `Reaproveita: ${guide.reuse.map((r) => r.split(" — ")[0] ?? r).join(" · ")}`,
    ...guide.actions.slice(0, 4).map((a) => `→ ${a}`),
    ...guide.avoid.slice(0, 1).map((a) => `× ${a}`),
    ...(guide.mdPath ? [`Arquivo: ${guide.mdPath.replace(/\\/g, "/")}`] : []),
  ];
}

export function writeResumeGuide(run: OrchestratorRun, artifacts?: ResumeArtifacts): ResumeGuide {
  const dir = join(scriptsDir(), "falhas");
  mkdirSync(dir, { recursive: true });
  const mdPath = join(dir, "RETOMAR.md");
  const jsonPath = join(dir, "RETOMAR.json");
  const guide = buildResumeGuide(run, artifacts ?? detectResumeArtifacts());
  const withPath = { ...guide, mdPath: mdPath.replace(/\\/g, "/") };
  writeFileSync(mdPath, withPath.lines.join("\n"), "utf8");
  writeFileSync(jsonPath, JSON.stringify(withPath, null, 2), "utf8");
  return withPath;
}

/** Grava RETOMAR.md e imprime o bloco na telemetria. */
export function emitResumeGuide(run: OrchestratorRun, log: (line: string) => void): ResumeGuide {
  const guide = writeResumeGuide(run);
  for (const line of formatResumeGuideTerminal(guide)) log(line);
  return guide;
}

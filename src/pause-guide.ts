import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { projectSlugFromPath } from "./project-name.ts";
import type { OrchestratorRun } from "./types.ts";
import { scriptsDir } from "./workspace.ts";

export type ContinuarResume = {
  /** Pula agente de RN/lógica na próxima Enter. */
  skipLogicAgent: boolean;
  /** Pula jornada headed na retomada. */
  skipTour: boolean;
  /** Texto curto para o log. */
  note: string;
};

export type ContinuarGuide = {
  version: 1;
  kind: "continuar";
  at: string;
  reason: "user_pause" | "user_cancel";
  runId: string;
  projectSlug: string;
  status: string;
  lastPhase: string;
  completed: string[];
  whereStopped: string;
  howToResume: string[];
  resume: ContinuarResume;
  playwrightRounds: number;
  logTail: string[];
  mdPath: string;
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

const MILESTONES: Array<{ label: string; match: RegExp }> = [
  { label: "Sincronização de requisitos", match: /fase:\s*Preparacao|sincronizando requisitos/i },
  { label: "Mapa por perfil", match: /mapa por perfil gravado|fase:\s*Mapa por perfil|Mapa\/roteiro — reutilizados/i },
  { label: "Roteiro (ROTEIRO.json)", match: /roteiro:\s*\d+\s*linha|roteiro reutilizados/i },
  { label: "Geração de specs", match: /fase:\s*Gerando specs|scriptsCreated|Script de testes encontrados/i },
  { label: "Agente de lógica / RNs", match: /Agente de logica|fase:\s*Agente IA — regras|logica-rn|runId=run-/i },
  { label: "Jornada", match: /jornada gravada|fase:\s*.*[Jj]ornada|touring/i },
  { label: "Auditoria de cobertura", match: /fase:\s*Auditoria|auditoria de cobertura/i },
  { label: "Playwright", match: /Playwright rodada|Playwright concluido|running_playwright/i },
  { label: "Triagem IA", match: /fase:\s*Triagem|triagem classe=/i },
];

function completedMilestones(log: string[]): string[] {
  const bodies = log.map(stripStamp);
  const out: string[] = [];
  for (const ms of MILESTONES) {
    if (bodies.some((b) => ms.match.test(b))) out.push(ms.label);
  }
  return out;
}

function inferResume(opts: {
  lastPhase: string;
  completed: string[];
  rounds: number;
  status: string;
}): ContinuarResume {
  const phase = `${opts.lastPhase} ${opts.status}`.toLowerCase();
  const inLogicOrGen =
    /agente|l[oó]gica|gerando specs|runid=|running_agent|generating_scripts|exploring_logic/i.test(phase);
  const pastLogic = opts.completed.some((c) => /l[oó]gica|Playwright|Triagem|Auditoria/i.test(c));
  const skipLogicAgent = inLogicOrGen || pastLogic || opts.rounds > 0;
  const skipTour = true;
  const note = skipLogicAgent
    ? "Retomada: reutiliza mapa/roteiro/specs quando possível; pula agente de lógica; segue para auditoria/Playwright."
    : "Retomada: continua do ponto seguinte; mapa/roteiro podem ser reutilizados por fingerprint.";
  return { skipLogicAgent, skipTour, note };
}

export function continuarPaths(dir = scriptsDir()): { md: string; json: string } {
  const falhas = join(dir, "falhas");
  return { md: join(falhas, "CONTINUAR.md"), json: join(falhas, "CONTINUAR.json") };
}

export function loadContinuar(dir = scriptsDir()): ContinuarGuide | undefined {
  const { json } = continuarPaths(dir);
  if (!existsSync(json)) return undefined;
  try {
    return JSON.parse(readFileSync(json, "utf8")) as ContinuarGuide;
  } catch {
    return undefined;
  }
}

export function clearContinuar(dir = scriptsDir()): void {
  const { md, json } = continuarPaths(dir);
  for (const p of [md, json]) {
    try {
      if (existsSync(p)) unlinkSync(p);
    } catch {
      /* ignore */
    }
  }
}

/** Constrói guia de retomada (puro). */
export function buildContinuarGuide(
  run: Pick<
    OrchestratorRun,
    "id" | "status" | "requisitosPath" | "projectPath" | "log" | "rounds" | "error"
  >,
  opts: { reason: "user_pause" | "user_cancel"; mdPath?: string },
): ContinuarGuide {
  const lastPhase = lastPhaseFromLog(run.log);
  const completed = completedMilestones(run.log);
  const resume = inferResume({
    lastPhase,
    completed,
    rounds: run.rounds,
    status: run.status,
  });
  const projectSlug = projectSlugFromPath(run.projectPath || run.requisitosPath);
  const at = new Date().toISOString();
  const mdPath = opts.mdPath ?? "scripts/falhas/CONTINUAR.md";
  const whereStopped = `Pausa do usuário na fase «${lastPhase}» (status ${run.status}). Playwright: ${run.rounds} rodada(s).`;

  const howToResume = [
    "Na F8, pressione Enter (sem R regenerate) para retomar.",
    "Mapa/roteiro: reutilizados se o fingerprint ainda bater.",
    "Specs existentes: não são reescritos (salvo R regenerate).",
    resume.skipLogicAgent
      ? "Agente de lógica/RNs: será PULADO nesta retomada (já tinha começado ou passado)."
      : "Agente de lógica/RNs: ainda será executado se fizer parte do fluxo.",
    "Jornada headed: pulada na retomada (ligue de novo na F7 se quiser).",
    "Playwright: roda a suíte do início do grep atual (não retoma um test() no meio).",
    "Para descartar este guia e recomeçar limpo: apague scripts/falhas/CONTINUAR.md e CONTINUAR.json.",
  ];

  const lines = [
    `# Continuar — ${projectSlug}`,
    "",
    `Gerado em: ${at}`,
    `Motivo: **${opts.reason === "user_pause" ? "pausa do usuário" : "cancelamento"}**`,
    `Run: \`${run.id}\``,
    `Status ao pausar: **${run.status}**`,
    "",
    "## Onde parou",
    "",
    whereStopped,
    "",
    `Última fase no log: **${lastPhase}**`,
    "",
    "## Já tinha concluído",
    "",
    ...(completed.length ? completed.map((c) => `- ${c}`) : ["- (nenhum marco reconhecido)"]),
    "",
    "## Como o agente deve continuar",
    "",
    ...howToResume.map((s) => `- ${s}`),
    "",
    "## Retomada automática (próximo Enter)",
    "",
    `- skipLogicAgent: **${resume.skipLogicAgent}**`,
    `- skipTour: **${resume.skipTour}**`,
    `- ${resume.note}`,
    "",
    "## Cauda do log",
    "",
    "```",
    ...run.log.slice(-10).map(stripStamp),
    "```",
    "",
  ];

  return {
    version: 1,
    kind: "continuar",
    at,
    reason: opts.reason,
    runId: run.id,
    projectSlug,
    status: run.status,
    lastPhase,
    completed,
    whereStopped,
    howToResume,
    resume,
    playwrightRounds: run.rounds,
    logTail: run.log.slice(-10).map(stripStamp),
    mdPath,
    lines,
  };
}

export function formatContinuarTerminal(guide: ContinuarGuide): string[] {
  return [
    `━━ Pausa — guia CONTINUAR ━━`,
    `Onde: ${guide.whereStopped}`,
    `Concluído: ${guide.completed.length ? guide.completed.join(" · ") : "(nada)"}`,
    `Retomada: logic=${guide.resume.skipLogicAgent ? "pular" : "rodar"} · tour=${guide.resume.skipTour ? "pular" : "rodar"}`,
    ...guide.howToResume.slice(0, 3).map((s) => `→ ${s}`),
    `Arquivo: ${guide.mdPath.replace(/\\/g, "/")}`,
  ];
}

export function writeContinuarGuide(
  run: OrchestratorRun,
  reason: "user_pause" | "user_cancel" = "user_pause",
): ContinuarGuide {
  const dir = join(scriptsDir(), "falhas");
  mkdirSync(dir, { recursive: true });
  const mdPath = join(dir, "CONTINUAR.md");
  const jsonPath = join(dir, "CONTINUAR.json");
  const guide = buildContinuarGuide(run, { reason, mdPath: mdPath.replace(/\\/g, "/") });
  writeFileSync(mdPath, guide.lines.join("\n"), "utf8");
  writeFileSync(jsonPath, JSON.stringify(guide, null, 2), "utf8");
  return { ...guide, mdPath: mdPath.replace(/\\/g, "/") };
}

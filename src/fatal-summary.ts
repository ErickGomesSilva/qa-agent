import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { projectSlugFromPath } from "./project-name.ts";
import type { OrchestratorRun } from "./types.ts";
import { scriptsDir } from "./workspace.ts";

export type FatalSummary = {
  version: 1;
  at: string;
  runId: string;
  projectSlug: string;
  status: string;
  error: string;
  durationSec: number;
  durationLabel: string;
  lastPhase: string;
  completed: string[];
  whereStopped: string;
  nextSteps: string[];
  playwrightRounds: number;
  cursorRunId?: string;
  agentSeconds?: number;
  logTail: string[];
  mdPath: string;
  lines: string[];
};

function stripStamp(line: string): string {
  return line.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s+/, "").trim();
}

function parseDurationSec(createdAt: string, updatedAt: string): number {
  const a = Date.parse(createdAt);
  const b = Date.parse(updatedAt);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 1000);
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

type Milestone = { key: string; label: string; match: RegExp };

const MILESTONES: Milestone[] = [
  { key: "sync", label: "Sincronização de requisitos", match: /fase:\s*Preparacao|sincronizando requisitos/i },
  { key: "mapa", label: "Mapa por perfil", match: /mapa por perfil gravado|fase:\s*Mapa por perfil/i },
  { key: "roteiro", label: "Roteiro (ROTEIRO.json)", match: /roteiro:\s*\d+\s*linha/i },
  { key: "generate", label: "Geração de specs", match: /fase:\s*Gerando specs|Gerando scripts a partir/i },
  { key: "logic", label: "Agente de lógica / RNs", match: /Agente de logica|fase:\s*Agente IA — regras|logica-rn/i },
  { key: "explore", label: "Crawler / exploração UI", match: /fase:\s*Crawler|exploring_logic|mapa por perfil: \d+ acesso/i },
  { key: "audit", label: "Auditoria de cobertura", match: /fase:\s*Auditoria|auditoria de cobertura/i },
  { key: "playwright", label: "Playwright", match: /Playwright rodada|Playwright concluido|running_playwright/i },
  { key: "triage", label: "Triagem IA", match: /fase:\s*Triagem|triagem classe=/i },
  { key: "k6", label: "k6", match: /running_k6|Relatório k6|k6=/i },
];

function lastPhaseFromLog(log: string[]): string {
  for (let i = log.length - 1; i >= 0; i--) {
    const body = stripStamp(log[i] ?? "");
    const m = body.match(/▸\s*fase:\s*(.+)$/i) || body.match(/fase:\s*(.+)$/i);
    if (m?.[1]) return m[1].trim();
  }
  return "(fase não identificada no log)";
}

function completedMilestones(log: string[]): string[] {
  const out: string[] = [];
  const bodies = log.map(stripStamp);
  for (const ms of MILESTONES) {
    if (bodies.some((b) => ms.match.test(b))) out.push(ms.label);
  }
  return out;
}

function extractCursorRunId(error: string, log: string[]): string | undefined {
  const fromErr = error.match(/run-[a-f0-9-]+/i)?.[0];
  if (fromErr) return fromErr;
  for (let i = log.length - 1; i >= 0; i--) {
    const m = stripStamp(log[i] ?? "").match(/runId=(run-[a-f0-9-]+)/i);
    if (m?.[1]) return m[1];
  }
  return undefined;
}

function extractAgentSeconds(log: string[]): number | undefined {
  for (let i = log.length - 1; i >= 0; i--) {
    const m = stripStamp(log[i] ?? "").match(/agente:\s*processando[^\d]*(\d+)\s*s/i);
    if (m?.[1]) return Number.parseInt(m[1], 10);
  }
  return undefined;
}

function whereStopped(opts: {
  lastPhase: string;
  error: string;
  rounds: number;
  agentSeconds?: number;
  cursorRunId?: string;
}): string {
  const err = opts.error.toLowerCase();
  if (/run do agente falhou|agente cursor|cursoragent/i.test(opts.error)) {
    const secs = opts.agentSeconds != null ? ` após ~${formatDuration(opts.agentSeconds)}` : "";
    const rid = opts.cursorRunId ? ` (Cursor ${opts.cursorRunId})` : "";
    return `Parou no agente de IA${secs}${rid}, na fase «${opts.lastPhase}». Playwright não chegou a rodar (${opts.rounds} rodada(s)).`;
  }
  if (/chromium|playwright install/i.test(err)) {
    return `Parou na instalação/abertura do Chromium. Fase: «${opts.lastPhase}».`;
  }
  if (/credencial|login|senha|BASE_URL|url/i.test(err)) {
    return `Parou na configuração (URL/credenciais). Fase: «${opts.lastPhase}».`;
  }
  if (/nenhum \*\.spec|sem criar nenhum/i.test(err)) {
    return `O agente terminou sem gerar specs. Fase: «${opts.lastPhase}».`;
  }
  if (opts.rounds === 0 && /playwright/i.test(opts.lastPhase)) {
    return `Parou ao iniciar Playwright (0 rodadas). Fase: «${opts.lastPhase}».`;
  }
  return `Fluxo interrompido na fase «${opts.lastPhase}». Motivo: ${opts.error}`;
}

function nextSteps(opts: { error: string; rounds: number; completed: string[] }): string[] {
  const steps: string[] = [];
  const err = opts.error.toLowerCase();
  if (/run do agente falhou|agente cursor/i.test(opts.error)) {
    steps.push("Verifique cota/rede/modelo na F1–F2 (ou painel Cursor do runId).");
    steps.push("Rode de novo na F8: se já houver specs, a geração pode ser pulada.");
    if (!opts.completed.some((c) => /Playwright/i.test(c))) {
      steps.push("Se o mapa/roteiro já existem, o gargalo é só o agente de lógica — pode desligar tour/massa no F7 para enxugar.");
    }
  } else if (/credencial|login|senha/i.test(err)) {
    steps.push("Revise F5 (logins) e F4 (URL).");
  } else if (/chromium|playwright/i.test(err)) {
    steps.push("Rode: npx playwright install chromium");
  } else {
    steps.push("Abra o run.json em data/runs/<id>/ e o FALHA-FATAL.md do projeto.");
  }
  steps.push("Detalhe completo: scripts/falhas/FALHA-FATAL.md (e run.json).");
  return steps;
}

/** Constrói resumo legível de uma rodada que terminou em erro (puro — sem I/O). */
export function buildFatalSummary(run: Pick<
  OrchestratorRun,
  "id" | "status" | "createdAt" | "updatedAt" | "requisitosPath" | "projectPath" | "error" | "log" | "rounds"
>, opts?: { mdPath?: string }): FatalSummary {
  const error = (run.error ?? "erro desconhecido").trim();
  const durationSec = parseDurationSec(run.createdAt, run.updatedAt);
  const lastPhase = lastPhaseFromLog(run.log);
  const completed = completedMilestones(run.log);
  const cursorRunId = extractCursorRunId(error, run.log);
  const agentSeconds = extractAgentSeconds(run.log);
  const where = whereStopped({
    lastPhase,
    error,
    rounds: run.rounds,
    agentSeconds,
    cursorRunId,
  });
  const next = nextSteps({ error, rounds: run.rounds, completed });
  const logTail = run.log.slice(-8).map(stripStamp);
  const projectSlug = projectSlugFromPath(run.projectPath || run.requisitosPath);
  const mdPath = opts?.mdPath ?? "scripts/falhas/FALHA-FATAL.md";
  const at = new Date().toISOString();

  const lines = [
    `# Falha fatal — ${projectSlug}`,
    "",
    `Gerado em: ${at}`,
    `Run QA-Agent: \`${run.id}\``,
    `Status: **${run.status}**`,
    `Duração: **${formatDuration(durationSec)}** (${durationSec}s)`,
    `Playwright: **${run.rounds}** rodada(s)`,
    "",
    "## Onde parou",
    "",
    where,
    "",
    `Última fase no log: **${lastPhase}**`,
    "",
    "## Erro",
    "",
    "```",
    error,
    "```",
    "",
    ...(cursorRunId ? [`Run do agente Cursor: \`${cursorRunId}\``, ""] : []),
    ...(agentSeconds != null
      ? [`Tempo no agente (último heartbeat): ~**${formatDuration(agentSeconds)}**`, ""]
      : []),
    "## Já tinha concluído nesta rodada",
    "",
    ...(completed.length ? completed.map((c) => `- ${c}`) : ["- (nenhum marco reconhecido)"]),
    "",
    "## Próximos passos",
    "",
    ...next.map((s) => `- ${s}`),
    "",
    "## Cauda do log",
    "",
    "```",
    ...logTail,
    "```",
    "",
  ];

  return {
    version: 1,
    at,
    runId: run.id,
    projectSlug,
    status: run.status,
    error,
    durationSec,
    durationLabel: formatDuration(durationSec),
    lastPhase,
    completed,
    whereStopped: where,
    nextSteps: next,
    playwrightRounds: run.rounds,
    cursorRunId,
    agentSeconds,
    logTail,
    mdPath,
    lines,
  };
}

/** Linhas curtas para TUI / CLI (sem markdown). */
export function formatFatalSummaryTerminal(summary: FatalSummary): string[] {
  return [
    `━━ Falha fatal — resumo ━━`,
    `Onde: ${summary.whereStopped}`,
    `Duração: ${summary.durationLabel}  |  Playwright: ${summary.playwrightRounds} rodada(s)`,
    `Fase: ${summary.lastPhase}`,
    `Erro: ${summary.error.slice(0, 200)}`,
    `Concluído: ${summary.completed.length ? summary.completed.join(" · ") : "(nada marcado)"}`,
    ...summary.nextSteps.slice(0, 3).map((s) => `→ ${s}`),
    `Arquivo: ${summary.mdPath.replace(/\\/g, "/")}`,
  ];
}

export function writeFatalSummary(run: OrchestratorRun): FatalSummary {
  const dir = join(scriptsDir(), "falhas");
  mkdirSync(dir, { recursive: true });
  const mdPath = join(dir, "FALHA-FATAL.md");
  const jsonPath = join(dir, "FALHA-FATAL.json");
  const summary = buildFatalSummary(run, { mdPath: mdPath.replace(/\\/g, "/") });
  writeFileSync(mdPath, summary.lines.join("\n"), "utf8");
  writeFileSync(jsonPath, JSON.stringify(summary, null, 2), "utf8");
  return { ...summary, mdPath: mdPath.replace(/\\/g, "/") };
}

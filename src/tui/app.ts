import type { LlmModel, LlmProvider } from "../llm/types.ts";
import {
  cycleLlmProvider,
  defaultBaseUrl,
  LLM_PRESETS,
  llmProviderFromDigit,
  providerNeedsUrl,
} from "../llm/presets.ts";
import type { OrchestratorRun } from "../types.ts";
import { startRun, requestCancel, isCancelRequested } from "../orchestrator.ts";
import { activeRun } from "../store.ts";
import { loadContinuar } from "../pause-guide.ts";
import { buildResumeGuide, detectResumeArtifacts } from "../resume-guide.ts";
import { applyRunTelemetry, formatElapsed, type RunTelemetry } from "../run-telemetry.ts";
import {
  clearAgentTelemetry,
  formatAgentElapsed,
  getAgentTelemetry,
  ingestOrchestratorHint,
  subscribeAgentTelemetry,
} from "../agent-telemetry.ts";
import { config } from "../config.ts";
import type { CoverageReportDetail } from "../coverage-report.ts";
import { existsSync, readFileSync } from "node:fs";
import { getLocale, isScriptNotice, t, type Locale } from "../i18n.ts";
import { loadSettings } from "../settings.ts";
import {
  addEvidence,
  applySavedSettings,
  applyRunAll,
  buildRunBody,
  currentCredentialsDraft,
  currentOptionsDraft,
  type AccessDraft,
  type CredsSource,
  type OptionsDraft,
  type StepId,
  syncRunAllFlag,
  evidenceFor,
  getSteps,
  loadModels,
  missingConfig,
  saveApiKey,
  saveCredentials,
  saveCredentialsFile,
  saveLocale,
  saveLlmProvider,
  saveModel,
  saveOptions,
  saveRequisitos,
  gitTokenConfigured,
  saveUrl,
  saveWebhook,
  seedEvidenceFromDisk,
} from "../setup.ts";
import { detectWebhookProvider, webhookProviderLabel, type WebhookProvider } from "../webhook.ts";
import { listSpecFiles } from "../workspace.ts";
import { formatReportKind, formatReportStats, listAllReports, type ReportEntry } from "../coverage-list.ts";
import { loadImpedimentsReport } from "../impediments.ts";
import { loadQuarantine } from "../quarantine.ts";
import { lastLabel, listJourneyFiles, loadTraceMatrix } from "../trace-matrix.ts";
import { displayReportInTerminal, readReportLines } from "../open-report.ts";
import { attachKeys, type Key } from "./keys.ts";
import { coalesceLogLines, wrapVisible } from "./text.ts";
import {
  choiceRow,
  chip,
  evidencePanel,
  footer,
  inputField,
  joinColumns,
  modelRow,
  stepHeading,
  styleAgentEvent,
  styleLogLine,
  tabRail,
  tagline,
  wordmark,
} from "./chrome.ts";
import { fill, frame, ink, spinnerFrame, theme } from "./theme.ts";
import type { AuthKind } from "../types.ts";

const CREDS_TAB_FILE = [0, 1];
const CREDS_TAB_MANUAL_MULTI = [0, 1, 2, 3, 4, 5, 6];
const CREDS_TAB_MANUAL_SINGLE = [0, 1, 3, 4, 5, 6];

function credsTabOrder(state: State): number[] {
  if (state.draft.credsSource === "file") return CREDS_TAB_FILE;
  return state.draft.accessCount > 1 ? CREDS_TAB_MANUAL_MULTI : CREDS_TAB_MANUAL_SINGLE;
}

function ensureAccessDrafts(state: State): void {
  while (state.draft.accesses.length < state.draft.accessCount) {
    state.draft.accesses.push({ label: "", authKind: "email", login: "", senha: "" });
  }
  state.draft.accesses = state.draft.accesses.slice(0, state.draft.accessCount);
  if (state.draft.accessIndex >= state.draft.accessCount) {
    state.draft.accessIndex = Math.max(0, state.draft.accessCount - 1);
  }
}

function currentAccess(state: State): AccessDraft {
  ensureAccessDrafts(state);
  return state.draft.accesses[state.draft.accessIndex]!;
}

function cycleCredsField(state: State, dir: number): void {
  const order = credsTabOrder(state);
  const i = Math.max(0, order.indexOf(state.field));
  state.field = order[(i + dir + order.length) % order.length] ?? 0;
}

function setAccessCount(state: State, count: number): void {
  state.draft.accessCount = Math.min(10, Math.max(1, count));
  ensureAccessDrafts(state);
}

const STEPS: StepId[] = [
  "chave",
  "modelo",
  "requisitos",
  "url",
  "credenciais",
  "webhook",
  "opcoes",
  "app",
  "resumos",
  "agente",
];

const PROVIDERS: WebhookProvider[] = ["discord", "slack", "teams", "generic"];

type State = {
  tab: number;
  field: number;
  draft: {
    provider: LlmProvider;
    llmBaseUrl: string;
    chave: string;
    requisitos: string;
    gitToken: string;
    url: string;
    authKind: AuthKind;
    login: string;
    senha: string;
    accessCount: number;
    accessIndex: number;
    accesses: AccessDraft[];
    credsSource: CredsSource;
    credentialsFile: string;
    webhook: string;
    webhookProvider: WebhookProvider;
    autoResume: boolean;
    k6Enabled: boolean;
    continueOnProduto: boolean;
    retestQuarantine: boolean;
    massaEnabled: boolean;
    tourEnabled: boolean;
    headed: boolean;
    runAll: boolean;
    grep: string;
  };
  models: LlmModel[];
  modelIndex: number;
  modelsLoading: boolean;
  regenerate: boolean;
  running: boolean;
  spin: boolean;
  tick: number;
  log: string[];
  lastRun?: OrchestratorRun;
  flash: string;
  flashErr: boolean;
  reports: ReportEntry[];
  reportIndex: number;
  consultView: "relatorios" | "problemas" | "matriz" | "quarentena" | "jornadas";
  consultIndex: number;
  reportView?: { path: string; lines: string[]; scroll: number };
  runStartedAt?: number;
  runTelemetry: RunTelemetry;
  agentScroll: number;
  agentFollow: boolean;
};

let paintTimer: ReturnType<typeof setTimeout> | undefined;

function webhookChips(current: WebhookProvider): string[] {
  const labels: Record<WebhookProvider, string> = {
    discord: t("webhook.providerDiscord"),
    slack: t("webhook.providerSlack"),
    teams: t("webhook.providerTeams"),
    generic: t("webhook.providerGeneric"),
  };
  return PROVIDERS.map((p) => chip(labels[p], current === p));
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(getLocale(), { hour12: false });
}

function seedState(): State {
  applySavedSettings();
  seedEvidenceFromDisk();
  const s = loadSettings();
  const credDraft = currentCredentialsDraft();
  const first = credDraft.accesses[0];
  const opt = currentOptionsDraft();
  const webhookProvider =
    s.webhookProvider ?? (config.webhookUrl ? config.webhookProvider : "discord");
  return {
    tab: 0,
    field: 0,
    draft: {
      provider: (s.llmProvider ?? config.llmProvider ?? "cursor") as LlmProvider,
      llmBaseUrl: s.llmBaseUrl ?? config.llmBaseUrl ?? "https://api.openai.com/v1",
      chave: "",
      requisitos: s.requisitosPath ?? "",
      gitToken: "",
      url: s.baseUrl ?? "",
      authKind: first?.authKind ?? "email",
      login: first?.login ?? "",
      senha: "",
      accessCount: credDraft.accessCount,
      accessIndex: credDraft.accessIndex,
      accesses: credDraft.accesses,
      credsSource: credDraft.credsSource,
      credentialsFile: credDraft.credentialsFile,
      webhook: "",
      webhookProvider,
      autoResume: opt.autoResume,
      k6Enabled: opt.k6Enabled,
      continueOnProduto: opt.continueOnProduto,
      retestQuarantine: opt.retestQuarantine,
      massaEnabled: opt.massaEnabled,
      tourEnabled: opt.tourEnabled,
      headed: opt.headed,
      runAll: opt.runAll,
      grep: opt.grep,
    },
    models: [],
    modelIndex: 0,
    modelsLoading: false,
    regenerate: false,
    running: false,
    spin: false,
    tick: 0,
    log: [],
    flash: "",
    flashErr: false,
    reports: listAllReports(),
    reportIndex: 0,
    consultView: "relatorios",
    consultIndex: 0,
    runTelemetry: { phase: "", detail: "" },
    agentScroll: 0,
    agentFollow: true,
  };
}

function pushRunLog(state: State, line: string): void {
  state.log.push(line);
  if (state.log.length > 600) state.log.splice(0, state.log.length - 600);
  state.runTelemetry = applyRunTelemetry(state.runTelemetry, line);
  ingestOrchestratorHint(line);
  if (isScriptNotice(line)) {
    state.flash = line;
    state.flashErr = false;
  }
  schedulePaint(state, false);
}

function schedulePaint(state: State, immediate = false): void {
  if (immediate) {
    if (paintTimer) {
      clearTimeout(paintTimer);
      paintTimer = undefined;
    }
    paintNow(state);
    return;
  }
  if (paintTimer) return;
  paintTimer = setTimeout(() => {
    paintTimer = undefined;
    paintNow(state);
  }, 80);
}

function evidenceBlock(step: StepId, width: number): string[] {
  const items = evidenceFor(step, 8);
  const rows: string[] = [];
  for (const e of items) {
    for (const w of wrapVisible(`  ${fmtWhen(e.at)}  ${e.text}`, Math.max(20, width - 4))) {
      rows.push(ink(w, theme.muted));
    }
  }
  return evidencePanel(t("evidence.title"), rows, t("evidence.empty"), width);
}

function appendRunSummary(state: State, run: OrchestratorRun): void {
  state.log.push(`━━ ${t("app.summaryTitle")} ━━`);
  state.log.push(t("app.end", { status: run.status, extra: "" }));
  state.log.push(t("app.rounds", { n: run.rounds }));
  if (run.playwright) {
    const s = run.playwright.stats;
    const total = s.expected + s.unexpected + s.skipped + (s.flaky ?? 0);
    state.log.push(
      t("app.playwrightStats", {
        passed: s.expected,
        failed: s.unexpected,
        skipped: s.skipped,
        total,
      }),
    );
  }
  if (run.stuckCases?.length) {
    state.log.push(t("app.stuckHeader", { n: run.stuckCases.length }));
    for (const c of run.stuckCases) {
      const id = [c.us, c.ca].filter(Boolean).join(" ") || c.title.slice(0, 60);
      state.log.push(t("app.stuckItem", { id, reason: c.reason }));
    }
  }
  if (run.productFindings?.length) {
    state.log.push(t("app.productHeader", { n: run.productFindings.length }));
    for (const p of run.productFindings) {
      const id = [p.us, p.ca].filter(Boolean).join(" ") || p.title.slice(0, 60);
      state.log.push(t("app.productItem", { id, resumo: p.resumo }));
    }
  }
  if (run.matrixMdPath) {
    state.log.push(t("app.matrixPath", { path: run.matrixMdPath }));
  }
  if (run.coverageMdPath) {
    const jsonPath = run.coverageMdPath.replace(/\.md$/i, ".json");
    if (existsSync(jsonPath)) {
      try {
        const detail = JSON.parse(readFileSync(jsonPath, "utf8")) as CoverageReportDetail;
        if (detail.playwright?.skipped.length) {
          state.log.push(t("app.coverageSkippedHeader", { n: detail.playwright.skipped.length }));
          for (const row of detail.playwright.skipped.slice(0, 6)) {
            const id = row.us && row.ca ? `${row.us} ${row.ca}` : row.title.slice(0, 50);
            state.log.push(t("app.coverageSkippedItem", { id, reason: (row.reason ?? "test.skip").slice(0, 90) }));
          }
          if (detail.playwright.skipped.length > 6) {
            state.log.push(t("app.coverageMoreInMd", { n: detail.playwright.skipped.length - 6 }));
          }
        }
        if (detail.playwright?.failed.length) {
          state.log.push(t("app.coverageFailedHeader", { n: detail.playwright.failed.length }));
          for (const row of detail.playwright.failed.slice(0, 4)) {
            const id = row.us && row.ca ? `${row.us} ${row.ca}` : row.title.slice(0, 50);
            const err = (row.error ?? "").split("\n")[0]?.slice(0, 90) ?? "";
            state.log.push(t("app.coverageFailedItem", { id, error: err }));
          }
        }
      } catch {
        /* ignore parse errors */
      }
    }
    state.log.push(t("app.coverageReport", { path: run.coverageMdPath }));
  }
  if (run.triage) {
    state.log.push(
      t("app.triageSummary", {
        classe: run.triage.classe,
        resumo: run.triage.resumo.slice(0, 120),
      }),
    );
  }
  if (run.error) state.log.push(`${t("app.error", { msg: run.error })}`);
  if (run.continuarPath) {
    state.log.push(t("app.continuarSummary", { path: run.continuarPath }));
  }
  if (run.fatalSummaryPath) {
    state.log.push(t("app.fatalSummary", { path: run.fatalSummaryPath }));
  }
  try {
    const guide = buildResumeGuide(run, detectResumeArtifacts());
    state.log.push(t("app.resumeTitle", { title: guide.title }));
    for (const a of guide.actions.slice(0, 4)) {
      state.log.push(t("app.resumeAction", { action: a }));
    }
    state.log.push(t("app.resumeFile"));
  } catch {
    /* ignore */
  }
}

function renderLogPanel(state: State, width: number, height: number): string[] {
  const inner = Math.max(20, width - 2);
  const maxRaw = Math.max(40, (height - 2) * 3);
  const rawTail = state.log.length > maxRaw ? state.log.slice(-maxRaw) : state.log;
  const wrapped: string[] = [];
  for (const raw of coalesceLogLines(rawTail)) {
    const parts = wrapVisible(raw, Math.max(8, inner - 3));
    parts.forEach((w, i) => {
      wrapped.push(i === 0 ? styleLogLine(w, state.tick) : ink(`  ${w}`, theme.muted));
    });
  }
  const body = wrapped.length
    ? wrapped.slice(-Math.max(1, height - 2))
    : [ink(`  ${t("app.logEmpty")}`, theme.muted)];
  return frame(body, width, height, t("app.log"), "double");
}

function refreshReports(state: State): void {
  state.reports = listAllReports();
  state.reportIndex = Math.min(state.reportIndex, Math.max(0, state.reports.length - 1));
}

function boardLines(state: State, width: number): string[] {
  const lines: string[] = [];
  for (const w of wrapVisible(t("app.intro"), Math.max(12, width))) {
    lines.push(ink(w, theme.muted));
  }
  lines.push("");
  for (const st of getSteps().filter((x) => x.id !== "app")) {
    const optional = st.id === "opcoes" || st.id === "webhook";
    const on = st.done || optional;
    const lamp = on ? ink("◆", theme.ok) : ink("○", theme.warn);
    const fkey = ink(`F${st.f}`, theme.accent);
    const title = ink(st.title.padEnd(10), theme.fg);
    const summary = ink(st.summary, theme.muted);
    lines.push(`${lamp} ${fkey} ${title} ${summary}`);
  }
  lines.push("");
  const regen = state.regenerate ? t("app.regenYes") : t("common.no");
  lines.push(
    `${ink("▸", theme.accent)} ${ink(t("app.specs", { n: listSpecFiles().length, regen, slug: config.projectSlug }), theme.fg)} ${ink("(R)", theme.muted)}`,
  );
  lines.push(
    `${ink("·", theme.muted)} ${ink(
      t("app.k6AfterPw", {
        k6: state.draft.k6Enabled ? t("common.yes") : t("common.no"),
        massa: state.draft.massaEnabled ? t("common.yes") : t("common.no"),
        tour: state.draft.tourEnabled ? t("common.yes") : t("common.no"),
        headed: state.draft.headed ? t("common.yes") : t("common.no"),
      }),
      theme.muted,
    )} ${ink("(F7)", theme.muted)}`,
  );
  const miss = missingConfig();
  lines.push("");
  const recent = state.reports.slice(0, 3);
  if (recent.length) {
    lines.push(ink(t("app.recentReports"), theme.muted));
    for (const r of recent) {
      const tag = ink(`[${formatReportKind(r)}]`, theme.info);
      lines.push(`  · ${tag} ${ink(r.projectSlug, theme.fg)} — ${fmtWhen(r.modifiedAt)} ${ink("(F9)", theme.muted)}`);
    }
    lines.push("");
  }
  if (state.running) {
    const elapsed = formatElapsed(state.runStartedAt);
    lines.push(
      `${ink(spinnerFrame(state.tick), theme.info)} ${ink(t("app.running"), theme.info)} ${ink(`· ${elapsed}`, theme.muted)}`,
    );
    if (state.runTelemetry.phase) {
      lines.push(ink(`  ${t("app.phase")}: ${state.runTelemetry.phase}`, theme.accentHi));
    }
    if (state.runTelemetry.detail) {
      for (const w of wrapVisible(state.runTelemetry.detail, Math.max(12, width - 4))) {
        lines.push(ink(`  ${w}`, theme.muted));
      }
    }
    const grep = state.draft.grep.trim();
    lines.push(
      ink(`  ${t("app.grepFilter", { grep: grep || t("app.grepAll") })}`, theme.muted),
    );
    lines.push(ink(`  ${t("app.pauseHint")}`, theme.warn));
  } else if (miss.length) {
    lines.push(ink(`× ${t("app.missing", { list: miss.join(" · ") })}`, theme.err));
  } else {
    const cont = loadContinuar();
    if (cont) {
      lines.push(ink(`◆ ${t("app.continuarPending", { phase: cont.lastPhase.slice(0, 50) })}`, theme.warn));
    } else if (state.lastRun) {
      try {
        const guide = buildResumeGuide(state.lastRun, detectResumeArtifacts());
        lines.push(ink(`◆ ${guide.title}`, theme.warn));
        for (const a of guide.actions.slice(0, 2)) {
          for (const w of wrapVisible(`→ ${a}`, Math.max(12, width - 2))) {
            lines.push(ink(`  ${w}`, theme.muted));
          }
        }
        lines.push(ink(`  ${t("app.resumeHintFile")}`, theme.info));
      } catch {
        lines.push(ink(`◆ ${t("app.ready")}`, theme.ok));
      }
    } else {
      lines.push(ink(`◆ ${t("app.ready")}`, theme.ok));
    }
  }
  return lines;
}

const CONSULT_VIEWS = ["relatorios", "matriz", "quarentena", "jornadas", "problemas"] as const;
type ConsultView = (typeof CONSULT_VIEWS)[number];

/** Visão 1: coberturas, k6 e resumo de interrupção fatal. */
function listRelatoriosReports(reports: ReportEntry[]): ReportEntry[] {
  return reports.filter(
    (r) =>
      r.kind === "cobertura" ||
      r.kind === "k6" ||
      r.kind === "falha-fatal" ||
      r.kind === "continuar" ||
      r.kind === "retomar" ||
      r.kind === "aviso-ambiente",
  );
}

function consultMdPath(view: ConsultView, reports: ReportEntry[]): string | undefined {
  if (view === "relatorios") return listRelatoriosReports(reports)[0]?.mdPath;
  const kind =
    view === "matriz"
      ? "matriz"
      : view === "quarentena"
        ? "quarentena"
        : view === "jornadas"
          ? "jornada"
          : "problemas";
  return reports.find((r) => r.kind === kind)?.mdPath;
}

function renderResumosTab(state: State, width: number, rows: number): string[] {
  const inner = Math.max(12, width - 4);
  const lines: string[] = [];

  if (state.reportView) {
    const rv = state.reportView;
    const maxRows = Math.max(6, rows - 5);
    for (const w of wrapVisible(t("reports.viewing", { path: rv.path }), inner)) {
      lines.push(ink(`  ${w}`, theme.accentHi));
    }
    lines.push(ink(`  ${t("reports.viewHint")}`, theme.muted), "");
    const slice = rv.lines.slice(rv.scroll, rv.scroll + maxRows - 3);
    for (const raw of slice) {
      const text = raw.length ? raw : " ";
      for (const w of wrapVisible(text, inner - 2)) {
        lines.push(`  ${w}`);
      }
    }
    const end = Math.min(rv.scroll + slice.length, rv.lines.length);
    lines.push("");
    lines.push(ink(`  ${t("reports.viewScroll", { from: rv.scroll + 1, to: end, total: rv.lines.length })}`, theme.muted));
    return frame(lines, width, rows, t("tab.resumos"), "heavy");
  }

  for (const w of wrapVisible(t("reports.intro"), inner)) {
    lines.push(ink(`  ${w}`, theme.muted));
  }
  lines.push("");
  lines.push(
    choiceRow(
      t("consult.view"),
      [
        chip(`1 ${t("consult.relatorios")}`, state.consultView === "relatorios"),
        chip(`2 ${t("consult.matriz")}`, state.consultView === "matriz"),
        chip(`3 ${t("consult.quarentena")}`, state.consultView === "quarentena"),
        chip(`4 ${t("consult.jornadas")}`, state.consultView === "jornadas"),
        chip(`5 ${t("consult.problemas")}`, state.consultView === "problemas"),
      ],
      true,
      t("help.hint16"),
    ),
  );
  lines.push(ink(`  ${t("consult.openMd")}`, theme.muted));
  lines.push("");

  if (state.consultView === "problemas") {
    const p = loadImpedimentsReport();
    if (!p || !p.itens.length) {
      lines.push(ink(`  ${t("consult.problemasEmpty")}`, theme.warn));
    } else {
      lines.push(
        ink(
          `  ${t("consult.problemasCounts", {
            total: p.totais.total,
            bloqueio: p.totais.bloqueio,
            produto: p.totais.produto,
            falha: p.totais.falha,
            aviso: p.totais.aviso,
          })}`,
          theme.accentHi,
        ),
      );
      lines.push("");
      const maxRows = Math.max(4, rows - 14);
      const start = Math.max(0, state.consultIndex - Math.floor(maxRows / 2));
      const slice = p.itens.slice(start, start + maxRows);
      slice.forEach((item, i) => {
        const idx = start + i;
        const selected = idx === state.consultIndex;
        const mark = selected ? ink("▸", theme.accentHi) : ink("·", theme.muted);
        const id = [item.us, item.ca].filter(Boolean).join(" ") || item.titulo.slice(0, 28);
        const tone =
          item.severity === "bloqueio" || item.severity === "falha" || item.severity === "produto"
            ? theme.warn
            : theme.muted;
        lines.push(
          `  ${mark} ${ink(`[${item.severity}]`, tone)} ${ink(id, selected ? theme.accentHi : theme.fg)} ${ink(item.categoria, theme.info)}`,
        );
        if (selected) {
          for (const w of wrapVisible(item.detalhe, inner - 6).slice(0, 3)) {
            lines.push(ink(`      ${w}`, theme.muted));
          }
          lines.push(ink(`      → ${item.proximoPasso.slice(0, inner - 8)}`, theme.info));
        }
      });
    }
    return frame(lines, width, rows, t("tab.resumos"), "heavy");
  }

  if (state.consultView === "matriz") {
    const m = loadTraceMatrix();
    if (!m) {
      lines.push(ink(`  ${t("consult.matrizEmpty")}`, theme.warn));
    } else {
      lines.push(
        ink(
          `  ${t("consult.matrizCounts", {
            total: m.counts.total,
            passed: m.counts.passed,
            failed: m.counts.failed,
            never: m.counts.never,
            stuck: m.counts.stuck,
            produto: m.counts.produto,
            na: m.counts.na,
          })}`,
          theme.accentHi,
        ),
      );
      lines.push("");
      const maxRows = Math.max(4, rows - 14);
      const start = Math.max(0, state.consultIndex - Math.floor(maxRows / 2));
      const slice = m.rows.slice(start, start + maxRows);
      slice.forEach((r, i) => {
        const idx = start + i;
        const selected = idx === state.consultIndex;
        const mark = selected ? ink("▸", theme.accentHi) : ink("·", theme.muted);
        const id = [r.us, r.ca || r.rn].filter(Boolean).join(" ") || r.title.slice(0, 28);
        const tone =
          r.last === "passed"
            ? theme.ok
            : r.last === "stuck" || r.last === "produto" || r.last === "failed"
              ? theme.warn
              : theme.muted;
        lines.push(`  ${mark} ${ink(id.padEnd(22), selected ? theme.accentHi : theme.fg)} ${ink(`[${r.kind}]`, theme.info)} ${ink(lastLabel(r.last), tone)}`);
      });
    }
    return frame(lines, width, rows, t("tab.resumos"), "heavy");
  }

  if (state.consultView === "quarentena") {
    const q = loadQuarantine();
    if (!q.cases.length) {
      lines.push(ink(`  ${t("consult.quarentenaEmpty")}`, theme.warn));
    } else {
      q.cases.forEach((c, i) => {
        const selected = i === state.consultIndex;
        const mark = selected ? ink("▸", theme.accentHi) : ink("★", theme.warn);
        const id = [c.us, c.ca].filter(Boolean).join(" ") || c.title.slice(0, 40);
        lines.push(`  ${mark} ${ink(id, selected ? theme.accentHi : theme.warn)}`);
        lines.push(ink(`      ${c.reason}`, theme.muted));
      });
    }
    return frame(lines, width, rows, t("tab.resumos"), "heavy");
  }

  if (state.consultView === "jornadas") {
    const files = listJourneyFiles();
    const m = loadTraceMatrix();
    const jrows = m?.rows.filter((r) => r.kind === "jornada") ?? [];
    if (!files.length && !jrows.length) {
      lines.push(ink(`  ${t("consult.jornadaEmpty")}`, theme.warn));
    }
    for (const f of files) {
      lines.push(`  ${ink("▸", theme.accentHi)} ${ink("JORNADA.md", theme.fg)} ${ink(fmtWhen(f.modifiedAt), theme.muted)}`);
      lines.push(ink(`      ${f.mdPath}`, theme.info));
    }
    for (const r of jrows) {
      lines.push(`  ${ink("·", theme.muted)} ${ink(r.title.slice(0, inner - 8), theme.fg)} ${ink(lastLabel(r.last), theme.info)}`);
    }
    return frame(lines, width, rows, t("tab.resumos"), "heavy");
  }

  const list = listRelatoriosReports(state.reports);
  if (!list.length) {
    lines.push(ink(`  ${t("reports.empty")}`, theme.warn));
    lines.push(ink(`  ${t("reports.emptyHint")}`, theme.muted));
  } else {
    lines.push(ink(`  ${t("reports.count", { n: list.length })}`, theme.fg));
    lines.push("");
    const maxRows = Math.max(4, rows - 12);
    const start = Math.max(0, state.reportIndex - Math.floor(maxRows / 2));
    const slice = list.slice(start, start + maxRows);
    slice.forEach((r, i) => {
      const idx = start + i;
      const selected = idx === state.reportIndex;
      const mark = selected ? ink("▸", theme.accentHi) : ink("·", theme.muted);
      const kind = ink(
        `[${formatReportKind(r)}]`,
        r.kind === "k6" ? theme.info : r.kind === "falha-fatal" ? theme.warn : theme.accent,
      );
      const title = ink(r.projectSlug.padEnd(14), selected ? theme.accentHi : theme.fg);
      const when = ink(fmtWhen(r.modifiedAt), theme.muted);
      const stats = formatReportStats(r);
      lines.push(`  ${mark} ${kind} ${title} ${when}`);
      if (stats) lines.push(ink(`      ${stats}`, theme.muted));
      if (selected) {
        for (const w of wrapVisible(r.mdPath, inner - 6)) {
          lines.push(ink(`      ${w}`, theme.info));
        }
      }
    });
  }
  return frame(lines, width, rows, t("tab.resumos"), "heavy");
}

function renderAppTab(state: State, width: number, rows: number): string[] {
  const split = width >= 110 && rows >= 12;
  if (split) {
    const leftW = Math.max(36, Math.floor(width * 0.4));
    const rightW = width - leftW;
    const inner = Math.max(12, leftW - 4);
    const left = frame(boardLines(state, inner), leftW, rows, t("app.board"), "heavy");
    const right = renderLogPanel(state, rightW, rows);
    return joinColumns(left, right, leftW, rightW);
  }
  const board = boardLines(state, Math.max(12, width - 4));
  const boardH = Math.min(board.length + 2, Math.max(8, Math.floor(rows * 0.48)));
  const logH = Math.max(6, rows - boardH);
  return [...frame(board, width, boardH, t("app.board"), "heavy"), ...renderLogPanel(state, width, logH)];
}

function fmtAgentClock(at: number): string {
  const d = new Date(at);
  return d.toLocaleTimeString(getLocale(), { hour12: false });
}

function renderAgenteTab(state: State, width: number, rows: number): string[] {
  const inner = Math.max(12, width - 4);
  const snap = getAgentTelemetry();
  const lines: string[] = [];

  for (const w of wrapVisible(t("agente.intro"), inner)) {
    lines.push(ink(`  ${w}`, theme.muted));
  }
  lines.push("");
  lines.push(
    ink(
      `  ${t("agente.meta", {
        provider: snap.provider || "—",
        model: (snap.model || "—").slice(0, 28),
        phase: (snap.phase || "—").slice(0, 40),
        tools: snap.toolCount,
        round: snap.round,
        elapsed: formatAgentElapsed(),
        live: snap.active ? t("agente.liveWord") : "",
      })}`,
      snap.active ? theme.info : theme.muted,
    ),
  );
  lines.push(
    ink(
      `  ${snap.active ? t("agente.sessionActive") : t("agente.sessionEnded")}`,
      snap.active ? theme.ok : theme.muted,
    ),
  );
  lines.push(
    ink(`  ${state.agentFollow ? t("agente.followOn") : t("agente.followOff")}`, theme.muted),
  );
  lines.push("");

  if (!snap.events.length) {
    lines.push(ink(`  ${t("agente.empty")}`, theme.warn));
    return frame(lines, width, rows, t("tab.agente"), "heavy");
  }

  const headerUsed = lines.length + 2;
  const maxRows = Math.max(4, rows - headerUsed);
  const total = snap.events.length;
  const start = state.agentFollow
    ? Math.max(0, total - maxRows)
    : Math.min(Math.max(0, state.agentScroll), Math.max(0, total - maxRows));
  state.agentScroll = start;
  const slice = snap.events.slice(start, start + maxRows);

  for (const ev of slice) {
    const clock = ink(fmtAgentClock(ev.at), theme.muted);
    lines.push(`  ${clock} ${styleAgentEvent(ev.kind, ev.text.slice(0, Math.max(20, inner - 12)), state.tick)}`);
  }

  return frame(lines, width, rows, t("tab.agente"), "heavy");
}

function render(state: State): string {
  const cols = process.stdout.columns || 100;
  const rows = process.stdout.rows || 30;
  const width = Math.max(48, cols);
  const steps = getSteps();
  const current = steps[state.tab]!;
  const required = steps.filter(
    (s) =>
      s.id !== "app" &&
      s.id !== "resumos" &&
      s.id !== "agente" &&
      s.id !== "webhook" &&
      s.id !== "opcoes",
  );
  const armed = required.filter((s) => s.done).length;
  const live = state.running || state.spin || state.modelsLoading;

  const head: string[] = [
    wordmark(width, getLocale(), armed, required.length, state.tick, live),
    tagline(width),
    tabRail(steps, state.tab, width),
    fill(ink("━".repeat(width), theme.border), width),
    stepHeading(
      current,
      current.id === "app" || current.id === "resumos" || current.id === "agente",
      width,
    ),
    fill("", width),
  ];

  const footerH = 2;
  const bodyRows = Math.max(8, rows - head.length - footerH);
  const body =
    current.id === "app"
      ? renderAppTab(state, width, bodyRows)
      : current.id === "resumos"
        ? renderResumosTab(state, width, bodyRows)
        : current.id === "agente"
          ? renderAgenteTab(state, width, bodyRows)
          : tabBody(state, current.id, width, bodyRows);
  const padded = [...body];
  while (padded.length < bodyRows) padded.push("");

  const help =
    current.id === "app"
      ? t("help.app")
      : current.id === "resumos"
        ? state.reportView
          ? t("help.reportsView")
          : t("help.reports")
        : current.id === "agente"
          ? t("help.agente")
          : t("help.config");
  const out = [
    ...head,
    ...padded.slice(0, bodyRows).map((l) => fill(l, width)),
    ...footer(help, state.flash, state.flashErr, width),
  ];

  return `${theme.bg}${out.slice(0, rows).join("\n")}${theme.reset}`;
}

function langChips(locale: Locale): string[] {
  return [chip("PT-BR", locale === "pt-BR"), chip("EN-US", locale === "en-US")];
}

function providerChips(current: LlmProvider): string[] {
  return LLM_PRESETS.map((p, i) => chip(`${i + 1} ${p.label.toUpperCase()}`, current === p.id));
}

function chaveFieldCount(state: State): number {
  return state.draft.provider === "cursor" ? 2 : 3;
}

function modeloFieldCount(state: State): number {
  return state.draft.provider === "cursor" ? 1 : 2;
}

function reqsFieldCount(): number {
  return 2;
}

function webhookFieldCount(): number {
  return 2;
}

function tabBody(state: State, id: StepId, width: number, bodyRows: number): string[] {
  const lines: string[] = [];
  const pushMuted = (s: string) => {
    for (const w of wrapVisible(s, Math.max(12, width - 2))) lines.push(`  ${ink(w, theme.muted)}`);
  };

  if (id === "chave") {
    pushMuted(t("chave.intro1"));
    pushMuted(t("chave.intro2"));
    pushMuted(
      t("common.current") +
        ": " +
        (config.llmApiKey ? `${config.llmProvider} ${mask(config.llmApiKey)}` : t("common.notSaved")),
    );
    lines.push("");
    lines.push(choiceRow(t("chave.provider"), providerChips(state.draft.provider), state.field === 0, t("help.hint16")));
    lines.push("");
    if (state.draft.provider !== "cursor") {
      lines.push(...inputField(t("chave.baseUrl"), state.draft.llmBaseUrl, state.field === 1, width));
      lines.push("");
      lines.push(...inputField(t("chave.apiKey"), state.draft.chave, state.field === 2, width, true));
    } else {
      lines.push(...inputField(t("chave.apiKeyCursor"), state.draft.chave, state.field === 1, width, true));
    }
    lines.push("");
    lines.push(...evidenceBlock(id, width));
    return lines;
  }

  if (id === "modelo") {
    pushMuted(t("modelo.intro"));
    pushMuted(
      t("common.current") +
        ": " +
        `${config.llmProvider} ${config.llmModel || t("common.none")}`,
    );
    lines.push("");
    lines.push(choiceRow(t("modelo.provider"), providerChips(state.draft.provider), state.field === 0, t("help.hint16")));
    lines.push("");
    if (state.draft.provider !== "cursor") {
      lines.push(...inputField(t("chave.baseUrl"), state.draft.llmBaseUrl, state.field === 1, width));
      lines.push("");
    }
    if (state.modelsLoading) {
      lines.push(`  ${ink(spinnerFrame(state.tick), theme.info)} ${ink(t("modelo.loading"), theme.info)}`);
    } else if (!config.llmApiKey) {
      lines.push(`  ${ink("○", theme.warn)} ${ink(t("modelo.needKey"), theme.warn)}`);
    } else if (!state.models.length) {
      lines.push(`  ${ink("▸", theme.accent)} ${ink(t("modelo.pressEnter"), theme.fg)}`);
    } else {
      // Reserva: cabeçalho já em `lines` + contador + dica; evita cortar o item selecionado
      const footerHint = 1;
      const countLine = 1;
      const listH = Math.max(4, bodyRows - lines.length - countLine - footerHint);
      const half = Math.floor(listH / 2);
      let start = Math.max(0, state.modelIndex - half);
      if (start + listH > state.models.length) start = Math.max(0, state.models.length - listH);
      const slice = state.models.slice(start, start + listH);
      const moreAbove = start > 0 ? ` ↑${start}` : "";
      const moreBelow =
        start + slice.length < state.models.length
          ? ` ↓${state.models.length - (start + slice.length)}`
          : "";
      lines.push(
        `  ${ink(`${state.modelIndex + 1}/${state.models.length}${moreAbove}${moreBelow}  ${t("modelo.scrollHint")}`, theme.muted)}`,
      );
      slice.forEach((m, i) => {
        const abs = start + i;
        const label = m.displayName && m.displayName !== m.id ? `${m.id}  ${m.displayName}` : m.id;
        lines.push(modelRow(label, abs === state.modelIndex, Math.max(24, width - 2)));
      });
    }
    // Lista longa: não empurrar evidência (ela roubava altura e o clip cortava modelos)
    if (state.models.length <= 8) {
      lines.push("");
      const ev = evidenceFor(id, 2);
      if (ev.length) {
        const rows = ev.flatMap((e) =>
          wrapVisible(`  ${fmtWhen(e.at)}  ${e.text}`, width - 4).map((w) => ink(w, theme.muted)),
        );
        lines.push(...evidencePanel(t("evidence.title"), rows, t("evidence.empty"), width));
      }
    }
    return lines.slice(0, bodyRows);
  }

  if (id === "requisitos") {
    pushMuted(t("reqs.intro"));
    lines.push("");
    lines.push(...inputField(t("reqs.field"), state.draft.requisitos, state.field === 0, width));
    lines.push("");
    lines.push(...inputField(t("reqs.tokenField"), state.draft.gitToken, state.field === 1, width, true));
    pushMuted(gitTokenConfigured() ? t("reqs.tokenOn") : t("reqs.tokenOff"));
    pushMuted(t("reqs.tokenHint"));
    lines.push("");
    lines.push(...evidenceBlock(id, width));
    return lines;
  }

  if (id === "url") {
    pushMuted(t("url.intro"));
    lines.push("");
    lines.push(...inputField(t("url.field"), state.draft.url, true, width));
    lines.push("");
    lines.push(...evidenceBlock(id, width));
    return lines;
  }

  if (id === "credenciais") {
    const access = currentAccess(state);
    pushMuted(t("creds.intro"));
    lines.push("");
    lines.push(
      choiceRow(
        t("creds.source"),
        [
          chip(`1 ${t("creds.sourceManual").toUpperCase()}`, state.draft.credsSource === "manual"),
          chip(`2 ${t("creds.sourceFile").toUpperCase()}`, state.draft.credsSource === "file"),
        ],
        state.field === 0,
        t("help.hint12"),
      ),
    );

    if (state.draft.credsSource === "file") {
      lines.push("");
      lines.push(...inputField(t("creds.fileField"), state.draft.credentialsFile, state.field === 1, width));
      lines.push(ink(`  ${t("creds.fileHint")}`, theme.muted));
      lines.push("");
      lines.push(...evidenceBlock(id, width));
      return lines;
    }

    lines.push("");
    lines.push(
      choiceRow(
        t("creds.count"),
        [chip(String(state.draft.accessCount), state.field === 1)],
        state.field === 1,
        "← →",
      ),
    );
    if (state.draft.accessCount > 1) {
      lines.push("");
      lines.push(
        choiceRow(
          t("creds.access"),
          [chip(`${state.draft.accessIndex + 1} / ${state.draft.accessCount}`, state.field === 2)],
          state.field === 2,
          "← →",
        ),
      );
    }
    lines.push("");
    lines.push(
      choiceRow(
        t("creds.type"),
        [
          chip(`1 ${t("step.email").toUpperCase()}`, access.authKind === "email"),
          chip(`2 ${t("creds.cpf")}`, access.authKind === "cpf"),
        ],
        state.field === 3,
        t("help.hint12"),
      ),
    );
    lines.push("");
    lines.push(...inputField(t("creds.label"), access.label, state.field === 4, width));
    lines.push(ink(`  ${t("creds.labelHint")}`, theme.muted));
    lines.push("");
    lines.push(
      ...inputField(
        access.authKind === "cpf" ? t("creds.cpf") : t("creds.email"),
        access.login,
        state.field === 5,
        width,
      ),
    );
    lines.push("");
    lines.push(...inputField(t("creds.password"), access.senha, state.field === 6, width, true));
    lines.push("");
    lines.push(...evidenceBlock(id, width));
    return lines;
  }

  if (id === "webhook") {
    pushMuted(t("webhook.intro"));
    pushMuted(
      t("common.current") +
        ": " +
        (config.webhookUrl
          ? `${webhookProviderLabel(config.webhookProvider)} ${mask(config.webhookUrl)}`
          : t("common.off")),
    );
    lines.push("");
    lines.push(
      choiceRow(t("webhook.provider"), webhookChips(state.draft.webhookProvider), state.field === 0, t("help.hint12")),
    );
    lines.push("");
    lines.push(...inputField(t("webhook.field"), state.draft.webhook, state.field === 1, width, true));
    lines.push("");
    lines.push(...evidenceBlock(id, width));
    return lines;
  }

  if (id === "opcoes") {
    pushMuted(t("opcoes.intro"));
    lines.push("");
    lines.push(choiceRow(t("opcoes.language"), langChips(getLocale()), state.field === 0, t("help.hint12")));
    lines.push("");
    const runAll = state.draft.runAll ? chip(t("opcoes.runAllOn"), true) : chip(t("opcoes.runAllOff"), true);
    lines.push(choiceRow(t("opcoes.runAll"), [runAll], state.field === 1, t("help.space")));
    lines.push("");
    const ar = state.draft.autoResume ? chip(t("opcoes.resumeOn"), true) : chip(t("opcoes.resumeOff"), true);
    lines.push(choiceRow(t("opcoes.autoResume"), [ar], state.field === 2, t("help.space")));
    lines.push("");
    const k6 = state.draft.k6Enabled ? chip(t("opcoes.k6On"), true) : chip(t("opcoes.k6Off"), true);
    lines.push(choiceRow(t("opcoes.k6"), [k6], state.field === 3, t("help.space")));
    lines.push("");
    const massa = state.draft.massaEnabled ? chip(t("opcoes.massaOn"), true) : chip(t("opcoes.massaOff"), true);
    lines.push(choiceRow(t("opcoes.massa"), [massa], state.field === 4, t("help.space")));
    lines.push("");
    const tour = state.draft.tourEnabled ? chip(t("opcoes.tourOn"), true) : chip(t("opcoes.tourOff"), true);
    lines.push(choiceRow(t("opcoes.tour"), [tour], state.field === 5, t("help.space")));
    lines.push("");
    const headed = state.draft.headed ? chip(t("opcoes.headedOn"), true) : chip(t("opcoes.headedOff"), true);
    lines.push(choiceRow(t("opcoes.headed"), [headed], state.field === 6, t("help.space")));
    lines.push("");
    const prod = state.draft.continueOnProduto
      ? chip(t("opcoes.continueProdutoOn"), true)
      : chip(t("opcoes.continueProdutoOff"), true);
    lines.push(choiceRow(t("opcoes.continueProduto"), [prod], state.field === 7, t("help.space")));
    lines.push("");
    const ret = state.draft.retestQuarantine ? chip(t("opcoes.retestOn"), true) : chip(t("opcoes.retestOff"), true);
    lines.push(choiceRow(t("opcoes.retest"), [ret], state.field === 8, t("help.space")));
    lines.push("");
    lines.push(...inputField(t("opcoes.grep"), state.draft.grep, state.field === 9, width));
    lines.push("");
    lines.push(...evidenceBlock(id, width));
    return lines;
  }

  return lines;
}

function opcoesFieldCount(): number {
  return 10;
}

function draftAsOptions(state: State): OptionsDraft {
  return {
    runAll: state.draft.runAll,
    autoResume: state.draft.autoResume,
    k6Enabled: state.draft.k6Enabled,
    continueOnProduto: state.draft.continueOnProduto,
    retestQuarantine: state.draft.retestQuarantine,
    massaEnabled: state.draft.massaEnabled,
    tourEnabled: state.draft.tourEnabled,
    headed: state.draft.headed,
    grep: state.draft.grep,
  };
}

function applyOptionsToDraft(state: State, opts: OptionsDraft): void {
  state.draft.runAll = opts.runAll;
  state.draft.autoResume = opts.autoResume;
  state.draft.k6Enabled = opts.k6Enabled;
  state.draft.continueOnProduto = opts.continueOnProduto;
  state.draft.retestQuarantine = opts.retestQuarantine;
  state.draft.massaEnabled = opts.massaEnabled;
  state.draft.tourEnabled = opts.tourEnabled;
  state.draft.headed = opts.headed;
  state.draft.grep = opts.grep;
}

function mask(v: string): string {
  if (v.length <= 8) return "********";
  return `${v.slice(0, 4)}...${v.slice(-4)}`;
}

function paintNow(state: State): void {
  process.stdout.write("\x1b[H\x1b[J" + render(state));
}

function paint(state: State, immediate = true): void {
  schedulePaint(state, immediate);
}

function activeDraft(state: State): { get: () => string; set: (v: string) => void } | undefined {
  const id = STEPS[state.tab];
  if (id === "chave") {
    if (state.draft.provider === "cursor") {
      if (state.field === 1) return { get: () => state.draft.chave, set: (v) => { state.draft.chave = v; } };
      return undefined;
    }
    if (state.field === 1)
      return { get: () => state.draft.llmBaseUrl, set: (v) => { state.draft.llmBaseUrl = v; } };
    if (state.field === 2)
      return { get: () => state.draft.chave, set: (v) => { state.draft.chave = v; } };
    return undefined;
  }
  if (id === "requisitos") {
    if (state.field === 1) {
      return { get: () => state.draft.gitToken, set: (v) => { state.draft.gitToken = v; } };
    }
    return { get: () => state.draft.requisitos, set: (v) => { state.draft.requisitos = v; } };
  }
  if (id === "url") return { get: () => state.draft.url, set: (v) => { state.draft.url = v; } };
  if (id === "modelo" && state.draft.provider !== "cursor" && state.field === 1) {
    return { get: () => state.draft.llmBaseUrl, set: (v) => { state.draft.llmBaseUrl = v; } };
  }
  if (id === "webhook") {
    if (state.field === 1) return { get: () => state.draft.webhook, set: (v) => { state.draft.webhook = v; } };
    return undefined;
  }
  if (id === "opcoes") {
    if (state.field === 9) return { get: () => state.draft.grep, set: (v) => { state.draft.grep = v; } };
    return undefined;
  }
  if (id === "credenciais") {
    if (state.draft.credsSource === "file" && state.field === 1) {
      return {
        get: () => state.draft.credentialsFile,
        set: (v) => {
          state.draft.credentialsFile = v;
        },
      };
    }
    if (state.draft.credsSource === "manual") {
      const access = currentAccess(state);
      if (state.field === 6) return { get: () => access.senha, set: (v) => { access.senha = v; } };
      if (state.field === 5) return { get: () => access.login, set: (v) => { access.login = v; } };
      if (state.field === 4) return { get: () => access.label, set: (v) => { access.label = v; } };
    }
    return undefined;
  }
  return undefined;
}

function typeChar(state: State, ch: string): void {
  const d = activeDraft(state);
  if (!d) return;
  d.set(d.get() + ch);
}

function backspace(state: State): void {
  const d = activeDraft(state);
  if (!d) return;
  d.set(d.get().slice(0, -1));
}

async function saveTab(state: State): Promise<void> {
  const id = STEPS[state.tab];
  state.spin = true;
  try {
    if (id === "chave") {
      const key = state.draft.chave.trim() || config.llmApiKey;
      if (!key) throw new Error(t("chave.needKey"));
      state.flash = t("chave.validating");
      state.flashErr = false;
      paint(state);
      state.models = await saveApiKey({
        provider: state.draft.provider,
        apiKey: key,
        baseUrl: state.draft.llmBaseUrl,
      });
      state.draft.chave = "";
      const idx = state.models.findIndex((m) => m.id === config.llmModel);
      state.modelIndex = idx >= 0 ? idx : 0;
      state.flash = t("chave.ok", { provider: state.draft.provider, n: state.models.length });
    } else if (id === "modelo") {
      saveLlmProvider(state.draft.provider, state.draft.llmBaseUrl);
      if (!state.models.length) {
        state.modelsLoading = true;
        paint(state);
        state.models = await loadModels();
        state.modelsLoading = false;
        const idx = state.models.findIndex((m) => m.id === config.llmModel);
        state.modelIndex = idx >= 0 ? idx : 0;
        state.flash = t("modelo.loaded", { n: state.models.length });
      } else {
        const m = state.models[state.modelIndex];
        if (!m) throw new Error(t("modelo.empty"));
        saveModel(m.id);
        state.flash = t("modelo.saved", { id: m.id });
      }
    } else if (id === "requisitos") {
      saveRequisitos(state.draft.requisitos, state.draft.gitToken);
      state.draft.gitToken = "";
      state.flash = t("reqs.saved");
    } else if (id === "url") {
      saveUrl(state.draft.url);
      state.flash = t("url.saved");
    } else if (id === "credenciais") {
      if (state.draft.credsSource === "file") {
        saveCredentialsFile(state.draft.credentialsFile);
        state.flash = t("creds.fileSaved");
      } else {
        ensureAccessDrafts(state);
        saveCredentials(state.draft.accessCount, state.draft.accesses);
        for (const row of state.draft.accesses) row.senha = "";
        state.flash = t("creds.saved");
      }
    } else if (id === "webhook") {
      saveWebhook(state.draft.webhook, state.draft.webhookProvider);
      state.draft.webhook = "";
      state.flash = config.webhookUrl ? t("webhook.saved") : t("webhook.off");
    } else if (id === "opcoes") {
      saveOptions(draftAsOptions(state));
      state.flash = t("opcoes.saved");
    } else if (id === "app") {
      await runApp(state);
      return;
    } else if (id === "resumos") {
      if (state.reportView) {
        state.reportView = undefined;
        state.flash = t("reports.viewClosed");
        state.flashErr = false;
        return;
      }
      const r =
        state.consultView === "relatorios"
          ? listRelatoriosReports(state.reports)[state.reportIndex]
          : undefined;
      const md = r?.mdPath ?? consultMdPath(state.consultView, state.reports);
      if (!md) {
        state.flash = t("reports.empty");
        state.flashErr = true;
      } else {
        const mdLines = readReportLines(md);
        if (!mdLines.length) {
          state.flash = t("reports.notReadable", { path: md });
          state.flashErr = true;
        } else {
          state.reportView = { path: md, lines: mdLines, scroll: 0 };
          state.flash = t("reports.displayed", { path: md });
          state.flashErr = false;
        }
      }
      return;
    }
    state.flashErr = false;
  } catch (err) {
    state.flashErr = true;
    state.flash = err instanceof Error ? err.message : String(err);
  } finally {
    state.spin = false;
  }
}

async function runApp(state: State): Promise<void> {
  if (state.running) {
    state.flash = t("app.busy");
    state.flashErr = true;
    return;
  }
  const body = buildRunBody(state.regenerate);
  state.running = true;
  state.log = [];
  clearAgentTelemetry();
  state.agentScroll = 0;
  state.agentFollow = true;
  state.lastRun = undefined;
  state.runStartedAt = Date.now();
  state.runTelemetry = { phase: "Preparacao", detail: t("app.runStarting") };
  state.flash = t("app.running");
  state.flashErr = false;
  addEvidence("app", t("app.start", { regen: String(state.regenerate), url: body.baseUrl ?? "" }));
  paint(state, true);
  try {
    const run = await startRun(body, {
      wait: true,
      onLog: (line) => {
        pushRunLog(state, line);
      },
    });
    state.lastRun = run;
    refreshReports(state);
    appendRunSummary(state, run);
    addEvidence(
      "app",
      t("app.end", {
        status: run.status,
        extra: run.triage ? ` triagem=${run.triage.classe}` : "",
      }),
    );
    state.flash = t("app.end", { status: run.status, extra: "" });
    state.flashErr = !["passed"].includes(run.status);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    state.log.push(t("app.error", { msg }));
    addEvidence("app", t("app.error", { msg }));
    state.flash = msg;
    state.flashErr = true;
  } finally {
    state.running = false;
    state.runStartedAt = undefined;
    paint(state, true);
  }
}

async function onEnterTab(state: State): Promise<void> {
  if (STEPS[state.tab] === "resumos") {
    refreshReports(state);
    state.flash = t("reports.refreshed", { n: state.reports.length });
    state.flashErr = false;
    return;
  }
  if (STEPS[state.tab] === "modelo" && config.llmApiKey && !state.models.length && !state.modelsLoading) {
    try {
      state.modelsLoading = true;
      paint(state);
      state.models = await loadModels();
      const idx = state.models.findIndex((m) => m.id === config.llmModel);
      state.modelIndex = idx >= 0 ? idx : 0;
      state.flash = t("modelo.loadedShort", { n: state.models.length });
      state.flashErr = false;
    } catch (err) {
      state.flashErr = true;
      state.flash = err instanceof Error ? err.message : String(err);
    } finally {
      state.modelsLoading = false;
    }
  }
}

export async function runTui(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(t("app.needTty"));
  }

  const state = seedState();
  process.stdout.write("\x1b[?1049h\x1b[?25l");

  const restore = () => {
    process.stdout.write("\x1b[?25h\x1b[?1049l" + theme.reset);
  };

  let stopKeys: () => void = () => {};
  const unsubAgent = subscribeAgentTelemetry(() => {
    if (state.agentFollow || STEPS[state.tab] === "agente" || state.running) {
      schedulePaint(state, false);
    }
  });
  const spinTimer = setInterval(() => {
    if (state.running || state.spin || state.modelsLoading || getAgentTelemetry().active) {
      state.tick += 1;
      schedulePaint(state, false);
    }
  }, 400);

  const done = new Promise<void>((resolve) => {
    const exit = () => {
      clearInterval(spinTimer);
      unsubAgent();
      stopKeys();
      restore();
      resolve();
    };

    stopKeys = attachKeys((key: Key) => {
      void (async () => {
        if ((key.type === "ctrl" && key.ch === "c") || (key.type === "escape" && !state.running)) {
          exit();
          return;
        }
        if (state.running && (key.type === "escape" || (key.type === "char" && (key.ch === "p" || key.ch === "P")))) {
          const run = activeRun();
          if (run && requestCancel(run.id)) {
            state.log.push(t("app.pauseRequested"));
            state.flash = t("app.pauseRequested");
            state.flashErr = false;
          } else if (run && isCancelRequested(run.id)) {
            state.flash = t("app.pausePending");
            state.flashErr = false;
          } else {
            state.flash = t("app.pauseNoRun");
            state.flashErr = true;
          }
          paint(state);
          return;
        }
        if (key.type === "f" && key.n >= 1 && key.n <= 10) {
          state.tab = key.n - 1;
          state.field = 0;
          state.flash = "";
          await onEnterTab(state);
          paint(state);
          return;
        }
        if (state.running && STEPS[state.tab] === "app" && key.type !== "f") {
          paint(state);
          return;
        }

        const id = STEPS[state.tab];

        if (id === "agente") {
          const snap = getAgentTelemetry();
          const viewRows = Math.max(4, (process.stdout.rows || 30) - 14);
          if (key.type === "up" || key.type === "down" || key.type === "pageup" || key.type === "pagedown") {
            state.agentFollow = false;
            const step =
              key.type === "pageup" || key.type === "pagedown" ? viewRows : 1;
            const dir = key.type === "down" || key.type === "pagedown" ? step : -step;
            const maxScroll = Math.max(0, snap.events.length - viewRows);
            state.agentScroll = Math.max(0, Math.min(maxScroll, state.agentScroll + dir));
            paint(state);
            return;
          }
          if (key.type === "home") {
            state.agentFollow = false;
            state.agentScroll = 0;
            paint(state);
            return;
          }
          if (key.type === "end") {
            state.agentFollow = true;
            state.agentScroll = Math.max(0, snap.events.length - viewRows);
            paint(state);
            return;
          }
          if (key.type === "char" && (key.ch === "c" || key.ch === "C")) {
            clearAgentTelemetry();
            state.agentScroll = 0;
            state.agentFollow = true;
            state.flash = t("agente.cleared");
            state.flashErr = false;
            paint(state);
            return;
          }
          paint(state);
          return;
        }

        if (key.type === "tab") {
          if (id === "credenciais") {
            cycleCredsField(state, key.shift ? -1 : 1);
          }
          if (id === "chave") {
            const n = chaveFieldCount(state);
            const dir = key.shift ? -1 : 1;
            state.field = (state.field + dir + n) % n;
          }
          if (id === "requisitos") {
            const dir = key.shift ? -1 : 1;
            state.field = (state.field + dir + reqsFieldCount()) % reqsFieldCount();
          }
          if (id === "webhook") {
            const dir = key.shift ? -1 : 1;
            state.field = (state.field + dir + webhookFieldCount()) % webhookFieldCount();
          }
          if (id === "modelo") {
            const n = modeloFieldCount(state);
            const dir = key.shift ? -1 : 1;
            state.field = (state.field + dir + n) % n;
          }
          if (id === "opcoes") {
            const dir = key.shift ? -1 : 1;
            state.field = (state.field + dir + opcoesFieldCount()) % opcoesFieldCount();
          }
          paint(state);
          return;
        }

        if (
          id === "chave" &&
          state.field === 0 &&
          (key.type === "left" ||
            key.type === "right" ||
            (key.type === "char" && llmProviderFromDigit(key.ch)))
        ) {
          if (key.type === "char") {
            state.draft.provider = llmProviderFromDigit(key.ch) ?? state.draft.provider;
          } else {
            state.draft.provider = cycleLlmProvider(state.draft.provider, key.type === "right" ? 1 : -1);
          }
          if (!providerNeedsUrl(state.draft.provider) || !state.draft.llmBaseUrl.trim()) {
            state.draft.llmBaseUrl = defaultBaseUrl(state.draft.provider);
          }
          if (state.field >= chaveFieldCount(state)) state.field = 0;
          state.models = [];
          paint(state);
          return;
        }

        if (
          id === "modelo" &&
          state.field === 0 &&
          (key.type === "left" ||
            key.type === "right" ||
            (key.type === "char" && llmProviderFromDigit(key.ch)))
        ) {
          if (key.type === "char") {
            state.draft.provider = llmProviderFromDigit(key.ch) ?? state.draft.provider;
          } else {
            state.draft.provider = cycleLlmProvider(state.draft.provider, key.type === "right" ? 1 : -1);
          }
          state.draft.llmBaseUrl = defaultBaseUrl(state.draft.provider) || state.draft.llmBaseUrl;
          state.models = [];
          state.flash = t("modelo.providerHint");
          state.flashErr = false;
          paint(state);
          return;
        }

        if (
          id === "credenciais" &&
          state.field === 0 &&
          (key.type === "left" || key.type === "right" || (key.type === "char" && (key.ch === "1" || key.ch === "2")))
        ) {
          if (key.type === "char") state.draft.credsSource = key.ch === "2" ? "file" : "manual";
          else state.draft.credsSource = state.draft.credsSource === "manual" ? "file" : "manual";
          state.field = 1;
          paint(state);
          return;
        }

        if (
          id === "credenciais" &&
          state.draft.credsSource === "manual" &&
          state.field === 1 &&
          (key.type === "left" || key.type === "right")
        ) {
          setAccessCount(state, state.draft.accessCount + (key.type === "right" ? 1 : -1));
          paint(state);
          return;
        }

        if (
          id === "credenciais" &&
          state.draft.credsSource === "manual" &&
          state.field === 1 &&
          key.type === "char" &&
          key.ch >= "1" &&
          key.ch <= "9"
        ) {
          setAccessCount(state, Number(key.ch));
          paint(state);
          return;
        }

        if (
          id === "credenciais" &&
          state.draft.credsSource === "manual" &&
          state.field === 1 &&
          key.type === "char" &&
          key.ch === "0"
        ) {
          setAccessCount(state, 10);
          paint(state);
          return;
        }

        if (
          id === "credenciais" &&
          state.draft.credsSource === "manual" &&
          state.field === 2 &&
          state.draft.accessCount > 1 &&
          (key.type === "left" || key.type === "right")
        ) {
          const dir = key.type === "right" ? 1 : -1;
          state.draft.accessIndex =
            (state.draft.accessIndex + dir + state.draft.accessCount) % state.draft.accessCount;
          paint(state);
          return;
        }

        if (
          id === "credenciais" &&
          state.draft.credsSource === "manual" &&
          state.field === 3 &&
          (key.type === "left" || key.type === "right" || (key.type === "char" && (key.ch === "1" || key.ch === "2")))
        ) {
          const access = currentAccess(state);
          if (key.type === "char") access.authKind = key.ch === "2" ? "cpf" : "email";
          else access.authKind = access.authKind === "email" ? "cpf" : "email";
          paint(state);
          return;
        }

        if (
          id === "webhook" &&
          state.field === 0 &&
          (key.type === "left" ||
            key.type === "right" ||
            (key.type === "char" && ["1", "2", "3", "4"].includes(key.ch)))
        ) {
          if (key.type === "char") {
            const idx = Number(key.ch) - 1;
            state.draft.webhookProvider = PROVIDERS[idx] ?? state.draft.webhookProvider;
          } else {
            const i = PROVIDERS.indexOf(state.draft.webhookProvider);
            const next = key.type === "right" ? (i + 1) % PROVIDERS.length : (i - 1 + PROVIDERS.length) % PROVIDERS.length;
            state.draft.webhookProvider = PROVIDERS[next]!;
          }
          if (state.draft.webhook.trim()) {
            const detected = detectWebhookProvider(state.draft.webhook);
            if (detected !== "generic" || state.draft.webhookProvider === "generic") {
              state.draft.webhookProvider = detected !== "generic" ? detected : state.draft.webhookProvider;
            }
          }
          paint(state);
          return;
        }

        if (
          id === "modelo" &&
          (key.type === "up" ||
            key.type === "down" ||
            key.type === "pageup" ||
            key.type === "pagedown" ||
            key.type === "home" ||
            key.type === "end")
        ) {
          if (state.models.length) {
            const page = Math.max(5, Math.floor(((process.stdout.rows || 30) - 16) * 0.75));
            let next = state.modelIndex;
            if (key.type === "up") next -= 1;
            else if (key.type === "down") next += 1;
            else if (key.type === "pageup") next -= page;
            else if (key.type === "pagedown") next += page;
            else if (key.type === "home") next = 0;
            else if (key.type === "end") next = state.models.length - 1;
            state.modelIndex = Math.max(0, Math.min(state.models.length - 1, next));
          }
          paint(state);
          return;
        }

        if (
          id === "opcoes" &&
          state.field === 0 &&
          (key.type === "left" || key.type === "right" || (key.type === "char" && (key.ch === "1" || key.ch === "2")))
        ) {
          const next: Locale =
            key.type === "char"
              ? key.ch === "2"
                ? "en-US"
                : "pt-BR"
              : getLocale() === "pt-BR"
                ? "en-US"
                : "pt-BR";
          saveLocale(next);
          state.flash = t("opcoes.localeSaved", { locale: next });
          state.flashErr = false;
          paint(state);
          return;
        }

        if (id === "opcoes" && key.type === "char" && key.ch === " ") {
          const opts = draftAsOptions(state);
          if (state.field === 1) applyRunAll(opts, !opts.runAll);
          else if (state.field === 2) opts.autoResume = !opts.autoResume;
          else if (state.field === 3) {
            opts.k6Enabled = !opts.k6Enabled;
            syncRunAllFlag(opts);
          } else if (state.field === 4) {
            opts.massaEnabled = !opts.massaEnabled;
            syncRunAllFlag(opts);
          } else if (state.field === 5) {
            opts.tourEnabled = !opts.tourEnabled;
            syncRunAllFlag(opts);
          } else if (state.field === 6) {
            opts.headed = !opts.headed;
            syncRunAllFlag(opts);
          } else if (state.field === 7) {
            opts.continueOnProduto = !opts.continueOnProduto;
          } else if (state.field === 8) {
            opts.retestQuarantine = !opts.retestQuarantine;
          }
          applyOptionsToDraft(state, opts);
          paint(state);
          return;
        }

        if (id === "resumos") {
          if (key.type === "enter") {
            await saveTab(state);
            paint(state);
            return;
          }
          if (state.reportView) {
            if (key.type === "up" || key.type === "down") {
              const maxStep = Math.max(1, Math.floor((process.stdout.rows || 30) / 2));
              const dir = key.type === "down" ? maxStep : -maxStep;
              const maxScroll = Math.max(0, state.reportView.lines.length - maxStep);
              state.reportView.scroll = Math.max(0, Math.min(maxScroll, state.reportView.scroll + dir));
              paint(state);
              return;
            }
            if (key.type === "char" && (key.ch === "q" || key.ch === "Q")) {
              state.reportView = undefined;
              state.flash = t("reports.viewClosed");
              paint(state);
              return;
            }
          } else {
            if (
              key.type === "left" ||
              key.type === "right" ||
              (key.type === "char" && ["1", "2", "3", "4", "5"].includes(key.ch))
            ) {
              let i = CONSULT_VIEWS.indexOf(state.consultView);
              if (key.type === "char") i = Number(key.ch) - 1;
              else i = key.type === "right" ? (i + 1) % CONSULT_VIEWS.length : (i - 1 + CONSULT_VIEWS.length) % CONSULT_VIEWS.length;
              state.consultView = CONSULT_VIEWS[i] ?? "relatorios";
              state.consultIndex = 0;
              state.reportIndex = 0;
              paint(state);
              return;
            }
            if (key.type === "up" || key.type === "down") {
              const dir = key.type === "down" ? 1 : -1;
              if (state.consultView === "matriz") {
                const n = loadTraceMatrix()?.rows.length ?? 0;
                if (n) state.consultIndex = (state.consultIndex + dir + n) % n;
              } else if (state.consultView === "quarentena") {
                const n = loadQuarantine().cases.length;
                if (n) state.consultIndex = (state.consultIndex + dir + n) % n;
              } else if (state.consultView === "problemas") {
                const n = loadImpedimentsReport()?.itens.length ?? 0;
                if (n) state.consultIndex = (state.consultIndex + dir + n) % n;
              } else {
                const list = listRelatoriosReports(state.reports);
                if (list.length) state.reportIndex = (state.reportIndex + dir + list.length) % list.length;
              }
              paint(state);
              return;
            }
            if (key.type === "char" && (key.ch === "r" || key.ch === "R")) {
              refreshReports(state);
              state.flash = t("reports.refreshed", { n: state.reports.length });
              state.flashErr = false;
              paint(state);
              return;
            }
          }
          paint(state);
          return;
        }

        if (id === "app" && key.type === "char" && (key.ch === "r" || key.ch === "R")) {
          state.regenerate = !state.regenerate;
          paint(state);
          return;
        }

        if (key.type === "enter") {
          await saveTab(state);
          paint(state);
          return;
        }

        if (key.type === "backspace") {
          backspace(state);
          paint(state);
          return;
        }

        if (key.type === "char") {
          typeChar(state, key.ch);
          paint(state);
        }
      })();
    });

    process.on("SIGINT", exit);
    process.stdout.on("resize", () => paint(state));
    paint(state);
    void onEnterTab(state).then(() => paint(state));
  });

  await done;
}

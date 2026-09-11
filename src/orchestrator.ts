import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { ensureAuthSessionFresh } from "./auth-session.ts";
import { config, resolveRequisitosPath } from "./config.ts";
import {
  countMassaCredentialMatches,
  mergeMultiCredentials,
  placeholderSenha,
  primaryCredentials,
  readMultiCredenciaisFromPath,
  resolveCredentialsMdPath,
} from "./credentials.ts";
import { loadMassaManifest } from "./massa/manifest.ts";
import { t } from "./i18n.ts";
import { runGenerateAgent } from "./generate-agent.ts";
import { runLogicAgent } from "./logic-agent.ts";
import { filterAccessesByEscopo, loadRunEscopo } from "./escopo.ts";
import { runLogicExplore } from "./logic-explore.ts";
import { ensureMapAndRoteiro } from "./roteiro-cache.ts";
import { runUserTour } from "./user-tour.ts";
import { runPlaywright } from "./playwright-runner.ts";
import { runK6, shouldRunK6 } from "./k6-runner.ts";
import { formatFatalSummaryTerminal, writeFatalSummary } from "./fatal-summary.ts";
import { activeRun, appendLog, getRun, saveRun } from "./store.ts";
import { runCoverageAudit } from "./coverage-audit.ts";
import { runDeepenAgent } from "./deepen-agent.ts";
import { runReqSync } from "./req-sync.ts";
import { runMassaUnblockBatch } from "./massa/runner.ts";
import { applyMassaBatch, mergePlaywrightEnvWithMassa } from "./massa/apply.ts";
import { prepareMassaForRun } from "./massa/generate.ts";
import { playwrightEnvFromResolved } from "./playwright-env.ts";
import { parsePlaywrightJsonFile } from "./playwright-parse.ts";
import { emitCoverageReportTerminal, writeCoverageReport } from "./coverage-report.ts";
import { displayReportInTerminal } from "./open-report.ts";
import type { CoverageAuditResult } from "./coverage-types.ts";
import { runTriageAgent } from "./triage-agent.ts";
import {
  loadProductFindings,
  mergeProductFindings,
  saveProductFindings,
} from "./product-findings.ts";
import { loadQuarantine, quarantineGrep, saveQuarantine, settleQuarantine } from "./quarantine.ts";
import { formatMatrixTerminal, writeTraceMatrix } from "./trace-matrix.ts";
import type {
  CreateRunBody,
  OrchestratorRun,
  PlaywrightFailure,
  ProductFinding,
  ResolvedCredentials,
  RunMode,
  StartRunOptions,
  StuckCase,
} from "./types.ts";
import {
  credenciaisPath,
  ensureChromium,
  ensureWorkspace,
  listSpecFiles,
  scriptsDir,
  syncRequisitos,
  workspaceDir,
} from "./workspace.ts";

function escapeGrep(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function failureKey(failure?: PlaywrightFailure): string {
  return (failure?.grepHint || failure?.title || "desconhecida").trim();
}

function invertFromItems(items: Array<{ grepHint?: string; us?: string }>): string | undefined {
  const parts = items
    .map((c) => c.grepHint || c.us)
    .filter((s): s is string => Boolean(s?.trim()))
    .map((s) => escapeGrep(s.trim()));
  const unique = [...new Set(parts)];
  return unique.length ? unique.join("|") : undefined;
}

function invertFromStuck(stuck: StuckCase[]): string | undefined {
  return invertFromItems(stuck);
}

function productFromFailure(failure: PlaywrightFailure | undefined, resumo: string): ProductFinding {
  const title = failure?.title ?? "desconhecida";
  const us = title.match(/US_[A-Z0-9_]+/)?.[0];
  const ca = title.match(/CA\d+/)?.[0];
  return {
    us,
    ca,
    title,
    grepHint: failure?.grepHint ?? us,
    resumo,
    classe: "PRODUTO",
  };
}

function stuckFromFailure(failure: PlaywrightFailure | undefined, attempts: number, limit: number): StuckCase {
  const title = failure?.title ?? "desconhecida";
  const us = title.match(/US_[A-Z0-9_]+/)?.[0];
  const ca = title.match(/CA\d+/)?.[0];
  return {
    us,
    ca,
    title,
    grepHint: failure?.grepHint ?? us,
    attempts,
    reason: `Limite de ${limit} retomadas TESTE — não finalizado; suíte seguiu`,
  };
}

const cancelled = new Set<string>();
const secrets = new Map<string, ResolvedCredentials>();

function credPrimary(creds: ResolvedCredentials) {
  return primaryCredentials(creds);
}

export function requestCancel(id: string): boolean {
  const run = getRun(id);
  if (!run) return false;
  cancelled.add(id);
  return true;
}

function resolveRunCredentials(body: CreateRunBody): ResolvedCredentials {
  const defaultMd = credenciaisPath();
  const mdPath = body.credentialsMd
    ? resolveCredentialsMdPath(body.credentialsMd, scriptsDir())
    : existsSync(defaultMd)
      ? defaultMd
      : undefined;
  let fromMd: ReturnType<typeof readMultiCredenciaisFromPath> | undefined;
  if (mdPath && existsSync(mdPath)) {
    fromMd = readMultiCredenciaisFromPath(mdPath);
    if (fromMd.accesses[0] && placeholderSenha(fromMd.accesses[0])) {
      fromMd = {
        ...fromMd,
        accesses: fromMd.accesses.map((row, i) =>
          i === 0 ? { ...row, senha: undefined } : row,
        ),
      };
    }
  }

  const inlineAccess =
    body.login && body.senha
      ? [
          {
            authKind: body.authKind,
            login: body.login ?? body.email,
            senha: body.senha,
          },
        ]
      : undefined;

  return mergeMultiCredentials([
    fromMd,
    {
      baseUrl: body.baseUrl,
      accessCount: inlineAccess?.length,
      accesses: inlineAccess,
    },
  ]);
}

export async function startRun(
  body: CreateRunBody,
  opts: StartRunOptions = {},
): Promise<OrchestratorRun> {
  if (activeRun()) {
    throw Object.assign(new Error("Já existe uma rodada em andamento"), { status: 409 });
  }

  const requisitosPath = resolveRequisitosPath(body.requisitosPath);
  const { workspace, scripts } = ensureWorkspace();
  const creds = resolveRunCredentials(body);
  const grep = (body.grep ?? config.playwrightGrep).trim();
  const autoResumeOnTeste = body.autoResumeOnTeste ?? config.autoResumeOnTeste;
  const k6Enabled = body.k6Enabled ?? config.k6Enabled;
  const continueOnProduto = body.continueOnProduto ?? config.continueOnProduto;
  const retestQuarantine = body.retestQuarantine ?? config.retestQuarantine;
  const mode: RunMode = body.mode ?? "full";
  const now = new Date().toISOString();
  const run: OrchestratorRun = {
    id: randomUUID(),
    status: "queued",
    createdAt: now,
    updatedAt: now,
    requisitosPath,
    baseUrl: creds.baseUrl,
    projectPath: workspace,
    e2eDir: scripts,
    grep,
    regenerate: Boolean(body.regenerate),
    autoResumeOnTeste,
    k6Enabled,
    continueOnProduto,
    retestQuarantine,
    mode,
    stuckCases: [],
    productFindings: [],
    rounds: 0,
    log: [],
  };
  secrets.set(run.id, creds);
  saveRun(run);

  const done = loop(run, opts.onLog).catch((err) => {
    const log = bindLog(run, opts.onLog);
    recordFatal(run, log, err instanceof Error ? err.message : String(err));
  }).finally(() => {
    secrets.delete(run.id);
  });

  if (opts.wait) {
    await done;
    return getRun(run.id) ?? run;
  }
  return run;
}

function bindLog(
  run: OrchestratorRun,
  onLog?: (line: string) => void,
): (line: string) => void {
  return (line: string) => {
    appendLog(run, line);
    onLog?.(line);
  };
}

function recordFatal(run: OrchestratorRun, log: (line: string) => void, errMsg: string): void {
  run.status = "error";
  run.error = errMsg;
  log(`erro fatal: ${run.error}`);
  try {
    const summary = writeFatalSummary(run);
    run.fatalSummaryPath = summary.mdPath;
    for (const line of formatFatalSummaryTerminal(summary)) log(line);
  } catch (summaryErr) {
    log(
      `aviso: nao foi possivel gravar FALHA-FATAL.md (${summaryErr instanceof Error ? summaryErr.message : String(summaryErr)})`,
    );
  }
  saveRun(run);
}

async function runCoverageAuditPhase(
  run: OrchestratorRun,
  log: (line: string) => void,
): Promise<CoverageAuditResult> {
  run.status = "auditing_coverage";
  saveRun(run);
  log("auditoria de cobertura: classificando specs (@executavel vs @rascunho / massa / sem-ui)");
  try {
    return runCoverageAudit({
      onLog: log,
      autoDowngrade: config.autoDowngradeStubs,
      strict: config.strictCoverage,
    });
  } catch (err) {
    run.status = "error";
    run.error = err instanceof Error ? err.message : String(err);
    saveRun(run);
    throw err;
  }
}

async function finalizeCoverageReport(
  run: OrchestratorRun,
  audit: CoverageAuditResult,
  log: (line: string) => void,
  playwright?: import("./types.ts").PlaywrightOutcome,
): Promise<void> {
  const hadPlaywright = !!playwright;
  const report = writeCoverageReport({
    audit,
    playwright,
    requisitosPath: run.requisitosPath,
    triage: run.triage
      ? {
          classe: run.triage.classe,
          us: run.triage.us,
          ca: run.triage.ca,
          resumo: run.triage.resumo,
        }
      : undefined,
    stuckCases: run.stuckCases,
    productFindings: run.productFindings,
  });
  run.coverage = report.summary;
  run.coverageMdPath = report.mdPath;
  const matrix = writeTraceMatrix({
    requisitosPath: run.requisitosPath,
    playwrightJsonPath: playwright?.rawJsonPath,
    stuck: run.stuckCases,
    products: run.productFindings,
  });
  run.matrixMdPath = matrix.mdPath;
  emitCoverageReportTerminal(report, log);
  for (const line of formatMatrixTerminal(matrix.matrix, 12)) log(line);
  if (hadPlaywright) {
    displayReportInTerminal(report.mdPath, log);
  }
  saveRun(run);
}

async function tryRunK6Phase(
  run: OrchestratorRun,
  log: (line: string) => void,
): Promise<boolean> {
  if (!shouldRunK6({ mode: run.mode, enabled: run.k6Enabled })) return true;

  run.status = "running_k6";
  saveRun(run);
  try {
    run.k6 = await runK6({
      runId: run.id,
      baseUrl: run.baseUrl,
      requisitosPath: run.requisitosPath,
      onLog: log,
    });
    saveRun(run);
    if (run.k6.reportMdPath) displayReportInTerminal(run.k6.reportMdPath, log);
    if (!run.k6.passed) {
      log(
        config.k6Strict || run.mode === "load-only"
          ? "k6: thresholds falharam — rodada marcada como load_failed"
          : "k6: aviso — thresholds falharam (Playwright ok; defina K6_STRICT=true para falhar a rodada)",
      );
      if (run.mode === "load-only") return false;
      return !config.k6Strict;
    }
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`k6: ${msg}`);
    if (run.mode === "load-only" || config.k6Strict) return false;
    return true;
  }
}

async function loop(run: OrchestratorRun, onLog?: (line: string) => void): Promise<void> {
  const log = bindLog(run, onLog);
  const creds = secrets.get(run.id);
  if (!creds) throw new Error("credenciais da rodada ausentes na memória");

  log(`sincronizando requisitos → ${workspaceDir()}/requisitos`);
  log("▸ fase: Preparacao — sincronizando requisitos");
  syncRequisitos(run.requisitosPath);
  runReqSync(log);

  if (run.mode === "load-only") {
    log("modo load-only — smoke/carga k6 (Playwright não executado)");
    const k6ok = await tryRunK6Phase(run, log);
    run.status = k6ok ? "load_complete" : "load_failed";
    saveRun(run);
    return;
  }

  if (run.mode === "audit-only") {
    const audit = await runCoverageAuditPhase(run, log);
    await finalizeCoverageReport(run, audit, log);
    run.status = "audit_complete";
    log("modo audit-only — Playwright não executado");
    saveRun(run);
    return;
  }

  if (run.mode === "deepen-stubs") {
    await ensureChromium(log);
    run.status = "exploring_logic";
    saveRun(run);
    await runLogicExplore({
      baseUrl: creds.baseUrl,
      authKind: credPrimary(creds).authKind,
      login: credPrimary(creds).login,
      senha: credPrimary(creds).senha,
      onLog: log,
    });
    let audit = await runCoverageAuditPhase(run, log);
    run.status = "deepening_stubs";
    saveRun(run);
    await runDeepenAgent({
      baseUrl: creds.baseUrl,
      cases: audit.findings,
      limit: config.deepenLimit,
      onLog: log,
    });
    audit = runCoverageAudit({
      onLog: log,
      autoDowngrade: config.autoDowngradeStubs,
      strict: config.strictCoverage,
    });
    await finalizeCoverageReport(run, audit, log);
    run.status = "deepen_complete";
    log("modo deepen-stubs concluido");
    saveRun(run);
    return;
  }

  if (run.mode === "unblock-massa") {
    await ensureChromium(log);
    ensureAuthSessionFresh({
      baseUrl: creds.baseUrl,
      authKind: credPrimary(creds).authKind,
      login: credPrimary(creds).login,
      senha: credPrimary(creds).senha,
      accesses: creds.accesses,
      onLog: log,
    });
    let audit = await runCoverageAuditPhase(run, log);
    log("▸ fase: Massa — sincronizando dados e aplicando setups");
    await prepareMassaForRun({
      creds,
      generateLimit: config.massaGenerateLimit,
      onLog: log,
    });
    await applyMassaBatch({ creds, limit: config.massaApplyLimit, onLog: log });
    run.status = "unblocking_massa";
    saveRun(run);
    await runMassaUnblockBatch({
      creds,
      runId: run.id,
      limit: config.massaUnblockLimit,
      onLog: log,
    });
    audit = runCoverageAudit({
      onLog: log,
      autoDowngrade: config.autoDowngradeStubs,
      strict: config.strictCoverage,
    });
    await finalizeCoverageReport(run, audit, log);
    run.status = "unblock_complete";
    log("modo unblock-massa concluido");
    saveRun(run);
    return;
  }

  if (run.mode === "generate-massa") {
    let audit = await runCoverageAuditPhase(run, log);
    run.status = "generating_massa";
    saveRun(run);
    log("▸ fase: Massa — gerando scripts/massa/dados.json (runtime)");
    const prep = await prepareMassaForRun({
      creds,
      generateLimit: config.massaGenerateLimit,
      onLog: log,
    });
    log(`massa generate concluido: ${prep.entries} entrada(s), ${prep.generated} preenchida(s) pelo agente`);
    audit = runCoverageAudit({
      onLog: log,
      autoDowngrade: config.autoDowngradeStubs,
      strict: config.strictCoverage,
    });
    await finalizeCoverageReport(run, audit, log);
    run.status = "massa_complete";
    saveRun(run);
    return;
  }

  if (run.mode === "user-tour") {
    await ensureChromium(log);
    run.status = "touring";
    saveRun(run);
    const tour = await runUserTour({
      baseUrl: creds.baseUrl,
      authKind: credPrimary(creds).authKind,
      login: credPrimary(creds).login,
      senha: credPrimary(creds).senha,
      headed: true,
      onLog: log,
    });
    log(`jornada gravada: ${tour.mdPath}`);
    run.status = "tour_complete";
    saveRun(run);
    return;
  }

  await ensureChromium(log);

  run.status = "exploring_logic";
  saveRun(run);
  log("▸ fase: Mapa por perfil — Playwright (menu, controles, HTTP 4xx) antes de gerar specs");
  const escopo = loadRunEscopo();
  const mapAccesses = filterAccessesByEscopo(creds.accesses, escopo);
  const { explore, mapReused, roteiroReused } = await ensureMapAndRoteiro({
    baseUrl: creds.baseUrl,
    accesses: mapAccesses,
    allAccessesForLabels: creds.accesses,
    escopo,
    force: run.regenerate,
    onLog: log,
  });
  if (mapReused && roteiroReused) {
    log("▸ fase: Mapa/roteiro — reutilizados (sem novo crawl)");
  } else if (mapReused) {
    log("▸ fase: Mapa reutilizado — roteiro atualizado");
  }

  const specsBefore = listSpecFiles();
  if (specsBefore.length === 0 || run.regenerate) {
    run.status = "generating_scripts";
    saveRun(run);
    log(
      specsBefore.length === 0
        ? "sem scripts — disparando agente para escrever Playwright a partir do roteiro + requisitos"
        : "regenerate=true — agente vai reescrever os scripts",
    );
    log("▸ fase: Gerando specs — agente IA (ROTEIRO.json + MAPA-PERFIL + requisitos)");
    await runGenerateAgent({
      requisitosPath: run.requisitosPath,
      baseUrl: run.baseUrl,
      authKind: credPrimary(creds).authKind,
      regenerate: run.regenerate,
      onLog: log,
    });
    log(t("notice.scriptsCreated", { n: listSpecFiles().length }));
  } else {
    log(t("notice.scriptsFound", { n: specsBefore.length }));
  }

  await runLogicAgent({
    baseUrl: creds.baseUrl,
    explore,
    onLog: log,
  });

  if (config.tourEnabled) {
    run.status = "touring";
    saveRun(run);
    const tour = await runUserTour({
      baseUrl: creds.baseUrl,
      authKind: credPrimary(creds).authKind,
      login: credPrimary(creds).login,
      senha: credPrimary(creds).senha,
      onLog: log,
    });
    log(`jornada gravada: ${tour.mdPath}`);
  }

  log("▸ fase: Auditoria — classificando cobertura dos CAs");
  const audit = await runCoverageAuditPhase(run, log);
  await finalizeCoverageReport(run, audit, log);

  try {
    const manifest = loadMassaManifest();
    const matched = countMassaCredentialMatches(manifest.entries, creds.accesses);
    if (manifest.entries.length) {
      log(
        `credenciais: ${creds.accessCount} acesso(s); ${matched}/${manifest.entries.length} CAs de massa com perfil correspondente`,
      );
    } else if (creds.accessCount > 1) {
      log(`credenciais: ${creds.accessCount} acesso(s) configurados`);
    }
  } catch {
    if (creds.accessCount > 1) log(`credenciais: ${creds.accessCount} acesso(s) configurados`);
  }

  if (config.massaGenerateEnabled) {
    log("▸ fase: Massa — sincronizando dados de teste (dados.json / dados.md)");
    await prepareMassaForRun({
      creds,
      generateLimit: config.massaGenerateLimit,
      onLog: log,
    });
    await applyMassaBatch({ creds, limit: config.massaApplyLimit, onLog: log });
  }

  ensureAuthSessionFresh({
    baseUrl: creds.baseUrl,
    authKind: credPrimary(creds).authKind,
    login: credPrimary(creds).login,
    senha: credPrimary(creds).senha,
    accesses: creds.accesses,
    onLog: log,
  });

  const resumeLimit = config.testeResumeLimit;
  const maxLoops = 80;
  const stuck: StuckCase[] = [];
  const products: ProductFinding[] = run.productFindings ?? [];
  const storedQuarantine = loadQuarantine().cases;
  const retest = Boolean(run.retestQuarantine);
  if (retest && storedQuarantine.length) {
    const qg = quarantineGrep(storedQuarantine);
    if (qg) {
      run.grep = qg;
      log(`reteste de quarentena: ${storedQuarantine.length} caso(s) — grep=${qg}`);
    }
  } else if (storedQuarantine.length) {
    log(`quarentena ativa: ${storedQuarantine.length} caso(s) excluídos desta rodada (F7 retestar para incluir)`);
  }
  let sameKey = "";
  let sameAttempts = 0;

  const persistArtifacts = (pw?: import("./types.ts").PlaywrightOutcome) => {
    run.stuckCases = stuck;
    run.productFindings = products;
    const passedRows =
      pw?.rawJsonPath && existsSync(pw.rawJsonPath)
        ? parsePlaywrightJsonFile(pw.rawJsonPath).filter((r) => r.status === "passed")
        : [];
    const nextQ = settleQuarantine({
      previous: storedQuarantine,
      newStuck: stuck,
      passedRows,
      retest,
    });
    saveQuarantine(nextQ);
    saveProductFindings(mergeProductFindings(loadProductFindings(), products));
  };

  const endSuite = async (
    pw: import("./types.ts").PlaywrightOutcome | undefined,
    kind: "ok" | "empty",
  ) => {
    persistArtifacts(pw);
    if (products.length) {
      run.status = "complete_with_findings";
      log(`PRODUTO (${products.length}): suíte seguiu; veja F9 Matriz / PRODUTO.json`);
      for (const p of products) {
        const id = [p.us, p.ca].filter(Boolean).join(" ") || p.title.slice(0, 80);
        log(`PRODUTO ▸ ${id} — ${p.resumo}`);
      }
    } else {
      run.status = "passed";
    }
    if (kind === "empty") log("sem testes restantes no recorte — encerrando");
    if (stuck.length) {
      log(`NÃO FINALIZADO (${stuck.length}): casos que esgotaram ${resumeLimit} retomadas TESTE`);
      for (const c of stuck) {
        const id = [c.us, c.ca].filter(Boolean).join(" ") || c.title.slice(0, 80);
        log(`NÃO FINALIZADO ★ ${id} — ${c.reason}`);
      }
    }
    await finalizeCoverageReport(run, audit, log, pw);
    if (pw?.passed || products.length || stuck.length) {
      const k6ok = await tryRunK6Phase(run, log);
      if (!k6ok) run.status = "load_failed";
    }
    saveRun(run);
  };

  while (run.rounds < maxLoops) {
    if (cancelled.has(run.id)) {
      run.status = "cancelled";
      log("cancelado");
      saveRun(run);
      return;
    }

    run.rounds += 1;
    run.status = run.rounds === 1 ? "running_playwright" : "resuming";
    const invert = invertFromItems([
      ...(retest ? [] : storedQuarantine),
      ...stuck,
      ...products,
    ]);
    const grep = run.grep;
    log(
      `Playwright rodada ${run.rounds} url=${run.baseUrl} grep=${grep || "(todos)"} invert=${invert ?? "(nenhum)"} max-failures=1 k6=${run.k6Enabled ? "sim" : "nao"} seguirProduto=${run.continueOnProduto ? "sim" : "nao"}`,
    );
    saveRun(run);

    const pw = await runPlaywright({
      e2eDir: run.e2eDir,
      grep,
      grepInvert: invert,
      runId: run.id,
      env: mergePlaywrightEnvWithMassa(creds),
      onLog: log,
    });
    run.playwright = pw;
    saveRun(run);

    if (pw.passed) {
      const s = pw.stats;
      log(
        `Playwright concluido: ${s.expected} ok | ${s.unexpected} falha(s) | ${s.skipped} pulado(s) | rodada ${run.rounds}`,
      );
      await endSuite(pw, "ok");
      return;
    }

    const noTests =
      pw.failures[0]?.title === "Nenhum teste executado" ||
      (pw.stats.expected === 0 && pw.stats.unexpected === 0);
    if (noTests && (stuck.length || products.length || storedQuarantine.length)) {
      await endSuite(pw, "empty");
      return;
    }

    const failure = pw.failures[0];
    log(`suíte parada na falha: ${failure?.title ?? "desconhecida"}`);
    run.status = "paused_triage";
    saveRun(run);

    run.status = "running_agent";
    log("disparando agente (triagem; Playwright permanece o oraculo)");
    log("▸ fase: Triagem IA — classificando falha");
    saveRun(run);

    const triage = await runTriageAgent({
      projectPath: run.projectPath,
      e2eDir: run.e2eDir,
      grep: failure?.grepHint ?? run.grep,
      playwright: pw,
      onLog: log,
    });
    run.triage = triage;
    log(
      `triagem classe=${triage.classe} corrigiuTeste=${triage.corrigiuTeste} discord=${triage.discordEnviado}`,
    );
    saveRun(run);

    if (triage.classe === "TESTE" && triage.corrigiuTeste && run.autoResumeOnTeste) {
      const key = failureKey(failure);
      if (key === sameKey) sameAttempts += 1;
      else {
        sameKey = key;
        sameAttempts = 1;
      }

      if (sameAttempts >= resumeLimit) {
        const item = stuckFromFailure(failure, sameAttempts, resumeLimit);
        stuck.push(item);
        run.stuckCases = stuck;
        const id = [item.us, item.ca].filter(Boolean).join(" ") || item.title.slice(0, 80);
        log(`NÃO FINALIZADO ★ ${id} — ${item.reason}`);
        log(`seguindo para a próxima US (grep-invert atualizado)`);
        sameKey = "";
        sameAttempts = 0;
        continue;
      }

      log(
        `TESTE corrigido — retomando suíte (tentativa ${sameAttempts}/${resumeLimit} neste caso; Playwright continua sendo o runner)`,
      );
      continue;
    }

    if (triage.classe === "PRODUTO" && run.continueOnProduto) {
      const item = productFromFailure(failure, triage.resumo);
      products.push(item);
      run.productFindings = products;
      const id = [item.us, item.ca].filter(Boolean).join(" ") || item.title.slice(0, 80);
      log(`PRODUTO ▸ ${id} — gravado; suíte segue (F9 Matriz)`);
      sameKey = "";
      sameAttempts = 0;
      continue;
    }

    if (triage.classe === "PRODUTO") run.status = "paused_produto";
    else if (triage.classe === "MASSA") run.status = "paused_massa";
    else if (triage.classe === "AMBIENTE") run.status = "paused_ambiente";
    else if (triage.classe === "TESTE") run.status = "paused_triage";
    else run.status = "paused_inconclusivo";

    persistArtifacts(pw);
    log(`suíte permanece parada (status=${run.status})`);
    await finalizeCoverageReport(run, audit, log, pw);
    return;
  }

  persistArtifacts(run.playwright);
  recordFatal(run, log, `Limite interno de ${maxLoops} voltas da suíte`);
}

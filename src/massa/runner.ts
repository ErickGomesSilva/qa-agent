import { loadQaSkill } from "../llm/skill.ts";
import { runLlmAgent } from "../llm/run.ts";
import { buildMassaUnblockPrompt } from "../prompt-deepen.ts";
import { runPlaywright } from "../playwright-runner.ts";
import { findAccessForMassa } from "../credentials.ts";
import { grepForCase, playwrightEnvForAccess, playwrightEnvFromResolved } from "../playwright-env.ts";
import type { MassaManifestEntry } from "./types.ts";
import {
  loadMassaManifest,
  manifestPath,
  saveMassaManifest,
} from "./manifest.ts";
import type { ResolvedCredentials } from "../types.ts";
import { scriptsDir, workspaceDir } from "../workspace.ts";
import { loadMassaData } from "./data.ts";
import { massaEnvForEntry } from "./env.ts";
import { runMassaSetupScript } from "./setup-runner.ts";

export type UnblockResult = {
  us: string;
  ca: string;
  status: "desbloqueado" | "pendente" | "impossivel";
  playwrightPassed?: boolean;
  note: string;
};

function massaEntryForManifest(entry: MassaManifestEntry) {
  return loadMassaData().entries.find((e) => e.us === entry.us && e.ca === entry.ca);
}

async function runSetupScriptIfAny(
  entry: MassaManifestEntry,
  env: Record<string, string>,
  onLog: (line: string) => void,
): Promise<boolean> {
  const massa = massaEntryForManifest(entry);
  if (massa) {
    return runMassaSetupScript(massa, env, onLog);
  }
  const fallback = {
    us: entry.us,
    ca: entry.ca,
    status: "pronto" as const,
    dados: {},
    setup: entry.setup ?? `${entry.us}_${entry.ca}.setup.ts`,
  };
  return runMassaSetupScript(fallback, env, onLog);
}

async function runMassaUnblockAgent(opts: {
  baseUrl: string;
  entry: MassaManifestEntry;
  onLog: (line: string) => void;
}): Promise<void> {
  await runLlmAgent({
    system: loadQaSkill(),
    prompt: buildMassaUnblockPrompt({
      baseUrl: opts.baseUrl,
      us: opts.entry.us,
      ca: opts.entry.ca,
      specPath: opts.entry.specPath,
      precisa: opts.entry.precisa,
      perfil: opts.entry.perfil,
      motivo: opts.entry.motivo,
    }),
    cwd: workspaceDir(),
    onLog: opts.onLog,
  });
}

function updateManifestEntry(
  us: string,
  ca: string,
  patch: Partial<MassaManifestEntry>,
): void {
  const manifest = loadMassaManifest();
  const idx = manifest.entries.findIndex((e) => e.us === us && e.ca === ca);
  if (idx < 0) return;
  manifest.entries[idx] = { ...manifest.entries[idx]!, ...patch };
  manifest.updatedAt = new Date().toISOString();
  saveMassaManifest(manifest);
}

export async function unblockMassaEntry(opts: {
  entry: MassaManifestEntry;
  creds: ResolvedCredentials;
  runId: string;
  onLog: (line: string) => void;
}): Promise<UnblockResult> {
  const { entry, creds, runId, onLog } = opts;
  const matched = findAccessForMassa(
    creds.accesses,
    massaEntryForManifest(entry)?.accessLabel ?? entry.perfil,
    entry.motivo,
  );
  const baseEnv = matched
    ? playwrightEnvForAccess(creds, matched.index)
    : playwrightEnvFromResolved(creds);
  const massa = massaEntryForManifest(entry);
  const env = massa ? { ...baseEnv, ...massaEnvForEntry(massa) } : baseEnv;
  if (matched) {
    onLog(
      `unblock-massa: usando acesso ${matched.index + 1}${matched.access.label ? ` (${matched.access.label})` : ""}`,
    );
  }
  const grep = grepForCase(entry.us, entry.ca);

  onLog(`unblock-massa: ${entry.us} ${entry.ca}`);

  const setupOk = await runSetupScriptIfAny(entry, env, onLog);
  if (!setupOk) {
    updateManifestEntry(entry.us, entry.ca, {
      status: "pendente",
      motivo: `${entry.motivo} | setup falhou`,
    });
    return {
      us: entry.us,
      ca: entry.ca,
      status: "pendente",
      note: "setup script falhou",
    };
  }

  await runMassaUnblockAgent({ baseUrl: creds.baseUrl, entry, onLog });

  const pw = await runPlaywright({
    e2eDir: scriptsDir(),
    grep,
    runId: `${runId}-${entry.us}-${entry.ca}`,
    env,
    onLog,
  });

  if (pw.passed && pw.stats.unexpected === 0 && pw.stats.expected > 0) {
    updateManifestEntry(entry.us, entry.ca, { status: "desbloqueado" });
    return {
      us: entry.us,
      ca: entry.ca,
      status: "desbloqueado",
      playwrightPassed: true,
      note: "Playwright passou",
    };
  }

  if (pw.stats.skipped > 0 && pw.stats.expected === 0) {
    updateManifestEntry(entry.us, entry.ca, {
      status: "impossivel",
      motivo: `${entry.motivo} | ainda skip apos agente`,
    });
    return {
      us: entry.us,
      ca: entry.ca,
      status: "impossivel",
      playwrightPassed: false,
      note: "teste ainda skipped",
    };
  }

  updateManifestEntry(entry.us, entry.ca, { status: "pendente" });
  return {
    us: entry.us,
    ca: entry.ca,
    status: "pendente",
    playwrightPassed: false,
    note: pw.failures[0]?.error?.slice(0, 120) ?? "Playwright nao passou",
  };
}

export async function runMassaUnblockBatch(opts: {
  creds: ResolvedCredentials;
  runId: string;
  limit: number;
  onLog: (line: string) => void;
}): Promise<UnblockResult[]> {
  const manifest = loadMassaManifest();
  const pending = manifest.entries.filter((e) => e.status === "pendente").slice(0, opts.limit);
  if (pending.length === 0) {
    opts.onLog(`unblock-massa: nenhuma entrada pendente em ${manifestPath()}`);
    return [];
  }

  opts.onLog(`unblock-massa: ${pending.length} entrada(s) pendente(s)`);
  const results: UnblockResult[] = [];
  for (const entry of pending) {
    results.push(
      await unblockMassaEntry({
        entry,
        creds: opts.creds,
        runId: opts.runId,
        onLog: opts.onLog,
      }),
    );
  }
  const ok = results.filter((r) => r.status === "desbloqueado").length;
  opts.onLog(`unblock-massa: ${ok}/${results.length} desbloqueado(s)`);
  return results;
}

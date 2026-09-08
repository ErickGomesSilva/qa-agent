import { findAccessForMassa } from "../credentials.ts";
import { loadQaSkill } from "../llm/skill.ts";
import { runLlmAgent } from "../llm/run.ts";
import { buildMassaGeneratePrompt } from "../prompt-deepen.ts";
import { playwrightEnvForAccess, playwrightEnvFromResolved } from "../playwright-env.ts";
import type { ResolvedCredentials } from "../types.ts";
import type { MassaDataEntry } from "./data-types.ts";
import { massaEntryKey } from "./data-types.ts";
import {
  defaultMassaDataPath,
  entriesReadyToApply,
  loadMassaData,
  saveMassaData,
} from "./data.ts";
import { massaEnvForEntry, massaPlaywrightEnv } from "./env.ts";
import { runMassaSetupScript } from "./setup-runner.ts";

function updateEntryStatus(
  us: string,
  ca: string,
  patch: Partial<MassaDataEntry>,
): void {
  const data = loadMassaData();
  const idx = data.entries.findIndex((e) => e.us === us && e.ca === ca);
  if (idx < 0) return;
  data.entries[idx] = { ...data.entries[idx]!, ...patch };
  saveMassaData(data);
}

function envForEntry(
  entry: MassaDataEntry,
  creds: ResolvedCredentials,
): Record<string, string> {
  const label = entry.accessLabel ?? entry.perfil;
  const matched = findAccessForMassa(creds.accesses, label, entry.notas);
  const base = matched
    ? playwrightEnvForAccess(creds, matched.index)
    : playwrightEnvFromResolved(creds);
  return { ...base, ...massaEnvForEntry(entry) };
}

export async function applyMassaEntry(opts: {
  entry: MassaDataEntry;
  creds: ResolvedCredentials;
  onLog: (line: string) => void;
}): Promise<{ ok: boolean; note: string }> {
  const { entry, creds, onLog } = opts;
  if (entry.status !== "pronto" && entry.status !== "aplicado") {
    return { ok: false, note: "entrada nao esta pronta" };
  }

  const env = envForEntry(entry, creds);
  const setupOk = await runMassaSetupScript(entry, env, onLog);
  if (!setupOk) {
    updateEntryStatus(entry.us, entry.ca, { status: "pronto", notas: `${entry.notas ?? ""} | setup falhou`.trim() });
    return { ok: false, note: "setup falhou" };
  }

  updateEntryStatus(entry.us, entry.ca, { status: "aplicado" });
  return { ok: true, note: "massa aplicada" };
}

export async function applyMassaBatch(opts: {
  creds: ResolvedCredentials;
  limit: number;
  onLog: (line: string) => void;
  onlyKeys?: Set<string>;
}): Promise<{ total: number; ok: number; results: Array<{ key: string; ok: boolean; note: string }> }> {
  const data = loadMassaData();
  let candidates = entriesReadyToApply(data).filter((e) => e.status === "pronto");
  if (opts.onlyKeys?.size) {
    candidates = candidates.filter((e) => opts.onlyKeys!.has(massaEntryKey(e.us, e.ca)));
  }
  candidates = candidates.slice(0, opts.limit);

  if (candidates.length === 0) {
    opts.onLog("massa apply: nenhuma entrada com status pronto");
    return { total: 0, ok: 0, results: [] };
  }

  opts.onLog(`massa apply: ${candidates.length} entrada(s) pronta(s)`);
  const results: Array<{ key: string; ok: boolean; note: string }> = [];
  let ok = 0;

  for (const entry of candidates) {
    const r = await applyMassaEntry({ entry, creds: opts.creds, onLog: opts.onLog });
    results.push({ key: massaEntryKey(entry.us, entry.ca), ok: r.ok, note: r.note });
    if (r.ok) ok += 1;
  }

  opts.onLog(`massa apply: ${ok}/${candidates.length} aplicada(s)`);
  return { total: candidates.length, ok, results };
}

/** Env Playwright com massa aplicada/pronta para specs consumirem. */
export function buildMassaPlaywrightEnv(creds: ResolvedCredentials): Record<string, string> {
  const data = loadMassaData();
  const path = defaultMassaDataPath();
  return {
    ...massaPlaywrightEnv(data.entries, path),
  };
}

export function mergePlaywrightEnvWithMassa(
  creds: ResolvedCredentials,
): Record<string, string> {
  return {
    ...playwrightEnvFromResolved(creds),
    ...buildMassaPlaywrightEnv(creds),
  };
}

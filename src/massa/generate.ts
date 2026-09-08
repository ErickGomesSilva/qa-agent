import { loadQaSkill } from "../llm/skill.ts";
import { runLlmAgent } from "../llm/run.ts";
import { buildMassaGeneratePrompt } from "../prompt-deepen.ts";
import type { ResolvedCredentials } from "../types.ts";
import { workspaceDir } from "../workspace.ts";
import { loadMassaManifest } from "./manifest.ts";
import {
  defaultMassaDataPath,
  entriesNeedingGeneration,
  loadMassaData,
  saveMassaData,
  syncMassaDataFromManifest,
} from "./data.ts";

export async function runMassaGenerateAgent(opts: {
  baseUrl: string;
  limit: number;
  onLog: (line: string) => void;
}): Promise<number> {
  const manifest = loadMassaManifest();
  let data = syncMassaDataFromManifest(manifest, loadMassaData());
  saveMassaData(data);

  const pending = entriesNeedingGeneration(data).slice(0, opts.limit);
  if (pending.length === 0) {
    opts.onLog("massa generate: nenhuma entrada pendente sem dados");
    return 0;
  }

  opts.onLog(`massa generate: agente preenchendo ${pending.length} entrada(s) em massa/dados.json`);
  await runLlmAgent({
    system: loadQaSkill(),
    prompt: buildMassaGeneratePrompt({
      baseUrl: opts.baseUrl,
      massaPath: defaultMassaDataPath(),
      entries: pending,
      limit: opts.limit,
    }),
    cwd: workspaceDir(),
    onLog: opts.onLog,
  });

  data = loadMassaData();
  const filled = data.entries.filter(
    (e) => pending.some((p) => p.us === e.us && p.ca === e.ca) && Object.keys(e.dados).length > 0,
  ).length;
  opts.onLog(`massa generate: ${filled}/${pending.length} entrada(s) com dados preenchidos`);
  return filled;
}

export async function prepareMassaForRun(opts: {
  creds: ResolvedCredentials;
  generateLimit: number;
  onLog: (line: string) => void;
}): Promise<{ entries: number; generated: number }> {
  const manifest = loadMassaManifest();
  const data = syncMassaDataFromManifest(manifest, loadMassaData());
  saveMassaData(data);
  opts.onLog(`massa: ${data.entries.length} entrada(s) em scripts/massa/dados.json`);

  const needGen = entriesNeedingGeneration(data);
  let generated = 0;
  if (needGen.length > 0 && opts.generateLimit > 0) {
    generated = await runMassaGenerateAgent({
      baseUrl: opts.creds.baseUrl,
      limit: opts.generateLimit,
      onLog: opts.onLog,
    });
  }

  return { entries: data.entries.length, generated };
}

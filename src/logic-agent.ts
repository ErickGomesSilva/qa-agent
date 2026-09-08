import { loadQaSkill } from "./llm/skill.ts";
import { runLlmAgent } from "./llm/run.ts";
import { buildLogicPrompt } from "./prompt-logic.ts";
import { workspaceDir } from "./workspace.ts";
import type { ExploreResult } from "./logic-explore.ts";

export async function runLogicAgent(opts: {
  baseUrl: string;
  explore: ExploreResult;
  onLog: (line: string) => void;
}): Promise<void> {
  const cwd = workspaceDir();
  opts.onLog("Agente de logica: RNs da documentacao + achados do crawler");
  opts.onLog("▸ fase: Agente IA — regras de negocio e logica-rn.spec.ts");
  await runLlmAgent({
    system: loadQaSkill(),
    prompt: buildLogicPrompt({
      baseUrl: opts.baseUrl,
      pages: opts.explore.pages,
      issueCount: opts.explore.issues.length,
      reportPath: opts.explore.reportPath,
    }),
    cwd,
    onLog: opts.onLog,
  });
}

import { loadQaSkill } from "./llm/skill.ts";
import { runLlmAgent } from "./llm/run.ts";
import { buildDeepenPrompt } from "./prompt-deepen.ts";
import type { SpecAuditFinding } from "./coverage-types.ts";
import { workspaceDir } from "./workspace.ts";

export async function runDeepenAgent(opts: {
  baseUrl: string;
  cases: SpecAuditFinding[];
  limit: number;
  onLog: (line: string) => void;
}): Promise<{ runId: string; targeted: number }> {
  const rascunhos = opts.cases.filter((c) => c.nivel === "rascunho");
  const batch = rascunhos.slice(0, opts.limit);
  if (batch.length === 0) {
    opts.onLog("deepen: nenhum @rascunho para aprofundar");
    return { runId: "", targeted: 0 };
  }

  opts.onLog(`deepen: agente vai aprofundar ${batch.length} spec(s) @rascunho`);
  const result = await runLlmAgent({
    system: loadQaSkill(),
    prompt: buildDeepenPrompt({
      baseUrl: opts.baseUrl,
      cases: batch,
      limit: opts.limit,
    }),
    cwd: workspaceDir(),
    onLog: opts.onLog,
  });

  return { runId: result.id, targeted: batch.length };
}

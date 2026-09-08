import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadQaSkill } from "./llm/skill.ts";
import { runCoverageAudit } from "./coverage-audit.ts";
import { writeCoverageReport } from "./coverage-report.ts";
import { runLlmAgent } from "./llm/run.ts";
import { buildGeneratePrompt } from "./prompt-generate.ts";
import { listSpecFiles, workspaceDir } from "./workspace.ts";
import type { AuthKind } from "./types.ts";

export async function runGenerateAgent(opts: {
  requisitosPath: string;
  baseUrl: string;
  authKind: AuthKind;
  regenerate: boolean;
  onLog: (line: string) => void;
}): Promise<{ agentId: string; runId: string; specs: string[] }> {
  const cwd = workspaceDir();
  const system = loadQaSkill();
  const prompt = buildGeneratePrompt({
    requisitosPath: opts.requisitosPath,
    baseUrl: opts.baseUrl,
    authKind: opts.authKind,
    regenerate: opts.regenerate,
  });

  opts.onLog(`Gerando scripts a partir da documentacao cwd=${cwd}`);
  const result = await runLlmAgent({
    system,
    prompt,
    cwd,
    onLog: opts.onLog,
  });

  const specs = listSpecFiles();
  if (specs.length === 0) {
    throw new Error("O agente terminou sem criar nenhum *.spec.ts em data/workspace/scripts/tests");
  }
  const cob = join(cwd, "scripts", "cobertura.json");
  if (!existsSync(cob)) {
    opts.onLog("aviso: scripts/cobertura.json nao foi gravado — a skill pede cobertura de todos os CAs");
  }

  opts.onLog("auditoria pos-geracao: classificando specs");
  const audit = runCoverageAudit({ onLog: opts.onLog, autoDowngrade: true, strict: false });
  writeCoverageReport({ audit, requisitosPath: opts.requisitosPath });

  return { agentId: "llm", runId: result.id, specs };
}

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { webhookNotifyConfigured, loadMcpServers } from "./mcp.ts";
import { loadQaSkill } from "./llm/skill.ts";
import { runLlmAgent } from "./llm/run.ts";
import { buildTriagePrompt } from "./prompt.ts";
import type { PlaywrightOutcome, TriageClass, TriageResult } from "./types.ts";
import { config } from "./config.ts";

function parseClasse(raw: unknown): TriageClass {
  const v = String(raw ?? "").toUpperCase();
  if (v === "TESTE" || v === "PRODUTO" || v === "MASSA" || v === "AMBIENTE" || v === "INCONCLUSIVO") {
    return v;
  }
  return "INCONCLUSIVO";
}

function readTriagemJson(e2eDir: string): Partial<TriageResult> | undefined {
  const path = join(e2eDir, "falhas", "TRIAGEM.json");
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Partial<TriageResult>;
  } catch {
    return undefined;
  }
}

export async function runTriageAgent(opts: {
  projectPath: string;
  e2eDir: string;
  grep: string;
  playwright: PlaywrightOutcome;
  onLog: (line: string) => void;
}): Promise<TriageResult> {
  const mcpServers = loadMcpServers();
  const prompt = buildTriagePrompt({
    projectPath: opts.projectPath,
    e2eDir: opts.e2eDir,
    grep: opts.grep,
    playwright: opts.playwright,
    mcpServers,
  });

  opts.onLog(`Triagem model=${config.llmModel || config.cursorModel} cwd=${opts.projectPath}`);

  const result = await runLlmAgent({
    system: loadQaSkill(),
    prompt,
    cwd: opts.projectPath,
    onLog: opts.onLog,
    enableDiscordTool: webhookNotifyConfigured(mcpServers),
  });

  const file = readTriagemJson(opts.e2eDir);
  const fromText = /"classe"\s*:\s*"(TESTE|PRODUTO|MASSA|AMBIENTE|INCONCLUSIVO)"/i.exec(result.text);
  const classe = parseClasse(file?.classe ?? fromText?.[1]);
  const discordEnviado = Boolean(file?.discordEnviado);
  if (classe === "PRODUTO" && webhookNotifyConfigured(mcpServers) && !discordEnviado) {
    opts.onLog("PRODUTO com webhook configurado, mas TRIAGEM.json nao marcou discordEnviado=true");
  }

  return {
    classe,
    us: file?.us,
    ca: file?.ca,
    resumo: file?.resumo ?? result.text.slice(0, 500),
    corrigiuTeste: Boolean(file?.corrigiuTeste),
    pendentePath: file?.pendentePath,
    discordEnviado,
    agentId: "llm",
    runId: result.id,
  };
}

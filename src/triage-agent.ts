import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { webhookNotifyConfigured, loadMcpServers } from "./mcp.ts";
import { loadQaSkill } from "./llm/skill.ts";
import { runLlmAgent } from "./llm/run.ts";
import { stagePlaywrightEvidence } from "./playwright-evidence.ts";
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

export function isTriageInfraError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /caminho fora do workspace|ERRO_FERRAMENTA|ECONNRESET|ETIMEDOUT|API key|rate limit|429|401|unauthorized|sandbox|Agente Claude atingiu|Agente OpenAI atingiu|Run do agente falhou|CursorAgentError|ENOTFOUND/i.test(
    msg,
  );
}

/** Triagem sintética quando a ferramenta quebra (não é bug de produto). */
export function writeAmbienteTriage(
  e2eDir: string,
  opts: { us?: string; ca?: string; resumo: string },
): TriageResult {
  const falhas = join(e2eDir, "falhas");
  mkdirSync(falhas, { recursive: true });
  const result: TriageResult = {
    classe: "AMBIENTE",
    us: opts.us,
    ca: opts.ca,
    resumo: opts.resumo,
    corrigiuTeste: false,
    pendentePath: "",
    discordEnviado: false,
    agentId: "qa-agent",
    runId: "ambiente-local",
  };
  writeFileSync(join(falhas, "TRIAGEM.json"), JSON.stringify(result, null, 2) + "\n", "utf8");
  const aviso = [
    `# Aviso AMBIENTE — suíte parada`,
    "",
    "Isto **não** é bug de produto nem (necessariamente) erro de script Playwright.",
    "",
    opts.resumo,
    "",
    "A rodada foi **interrompida** de propósito para você corrigir a ferramenta/infra antes de seguir.",
    "",
    "- Revise F1/F2 (chave/modelo), rede/VPN, Chromium (`npx playwright install chromium`).",
    "- Evidência da falha Playwright (se houver): `scripts/falhas/ULTIMA-FALHA.log`.",
    "- Depois: Enter na F8 com regenerar=nao para retomar.",
    "",
  ].join("\n");
  writeFileSync(join(falhas, "AVISO-AMBIENTE.md"), aviso, "utf8");
  return result;
}

export async function runTriageAgent(opts: {
  projectPath: string;
  e2eDir: string;
  grep: string;
  playwright: PlaywrightOutcome;
  onLog: (line: string) => void;
}): Promise<TriageResult> {
  const mcpServers = loadMcpServers();
  const evidence = stagePlaywrightEvidence(opts.e2eDir, opts.playwright);
  opts.onLog(`evidência Playwright → ${evidence.logRel} / ${evidence.jsonRel}`);

  const prompt = buildTriagePrompt({
    projectPath: opts.projectPath,
    e2eDir: opts.e2eDir,
    grep: opts.grep,
    playwright: opts.playwright,
    mcpServers,
    evidenceLogRel: evidence.logRel,
    evidenceJsonRel: evidence.jsonRel,
  });

  opts.onLog(`Triagem model=${config.llmModel || config.cursorModel} cwd=${opts.projectPath}`);

  try {
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
  } catch (err) {
    if (!isTriageInfraError(err)) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    opts.onLog(`triagem interrompida por erro de ferramenta/infra: ${msg}`);
    const failure = opts.playwright.failures[0];
    const us = failure?.title.match(/US_[A-Z0-9_]+/)?.[0];
    const ca = failure?.title.match(/CA\d+/)?.[0];
    return writeAmbienteTriage(opts.e2eDir, {
      us,
      ca,
      resumo: `Ferramenta/infra impediu a triagem: ${msg.slice(0, 300)}. Não classificado como bug de produto.`,
    });
  }
}

import "../cursor-sdk-init.ts";
import { Agent, Cursor, CursorAgentError } from "@cursor/sdk";
import { loadMcpServers } from "../mcp.ts";
import type { LlmAgentOpts, LlmAgentResult, LlmModel } from "./types.ts";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAgentNetworkError(err: unknown): boolean {
  if (!err || typeof err !== "object") {
    return /ECONNRESET|ETIMEDOUT|EPIPE|socket hang up/i.test(String(err));
  }
  const e = err as { code?: string; message?: string; cause?: unknown };
  const code = e.code ?? "";
  const msg = `${e.message ?? ""} ${String(e.cause ?? "")}`;
  return (
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "EPIPE" ||
    /ECONNRESET|ETIMEDOUT|EPIPE|socket hang up|network/i.test(msg)
  );
}

function formatAgentNetErr(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function wrapCursorError(err: unknown): Error {
  if (err instanceof CursorAgentError) {
    return new Error(`Agente Cursor nao iniciou: ${err.message} retryable=${err.isRetryable}`);
  }
  if (isAgentNetworkError(err)) {
    return new Error(
      `Conexao com o agente Cursor caiu (${formatAgentNetErr(err)}). ` +
        "Verifique rede/VPN/firewall. CURSOR_USE_HTTP1=true no .env (padrao) ajuda no Windows.",
    );
  }
  if (err instanceof Error) return err;
  return new Error(String(err));
}

export async function listCursorModels(apiKey: string): Promise<LlmModel[]> {
  const list = await Cursor.models.list({ apiKey });
  return list.map((m) => ({
    id: m.id,
    displayName: m.displayName && m.displayName !== m.id ? `${m.id} — ${m.displayName}` : m.id,
  }));
}

async function consumeAgentStream(
  run: Awaited<ReturnType<Awaited<ReturnType<typeof Agent.create>>["send"]>>,
  opts: LlmAgentOpts,
): Promise<string> {
  let text = "";
  let lastBeat = Date.now();
  const started = Date.now();
  try {
    for await (const event of run.stream()) {
      const now = Date.now();
      if (now - lastBeat >= 12_000) {
        const sec = Math.round((now - started) / 1000);
        opts.onLog(`agente: processando… ${sec}s`);
        lastBeat = now;
      }
      if (event.type !== "assistant") continue;
      for (const block of event.message.content) {
        if (block.type === "text" && block.text) {
          text += block.text;
        }
      }
    }
  } catch (err) {
    if (isAgentNetworkError(err)) {
      opts.onLog(`agente: stream interrompido (${formatAgentNetErr(err)}) — aguardando conclusao…`);
      return text;
    }
    throw err;
  }
  return text;
}

async function runCursorAgentOnce(
  apiKey: string,
  model: string,
  opts: LlmAgentOpts,
  attempt: number,
): Promise<LlmAgentResult> {
  const mcpServers = opts.enableDiscordTool ? loadMcpServers() : {};
  const prompt = `${opts.system}\n\n---\n\n${opts.prompt}`;

  await using agent = await Agent.create({
    apiKey,
    model: { id: model },
    name: "qa-agent",
    local: { cwd: opts.cwd },
    ...(Object.keys(mcpServers).length ? { mcpServers } : {}),
  });

  if (attempt > 1) opts.onLog(`agente: nova tentativa (${attempt})`);
  opts.onLog(`agentId=${agent.agentId}`);

  const run = await agent.send(prompt);
  opts.onLog(`runId=${run.id}`);
  opts.onLog(`▸ fase: Agente IA — runId=${run.id} (aguarde)`);

  const text = await consumeAgentStream(run, opts);
  const result = await run.wait();
  if (result.status === "error") {
    throw new Error(`Run do agente falhou: ${run.id}`);
  }
  return { text, id: run.id };
}

export async function runCursorAgent(
  apiKey: string,
  model: string,
  opts: LlmAgentOpts,
): Promise<LlmAgentResult> {
  const maxAttempts = 2;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await runCursorAgentOnce(apiKey, model, opts, attempt);
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts && isAgentNetworkError(err)) {
        opts.onLog(
          `agente: conexao perdida (${formatAgentNetErr(err)}) — tentativa ${attempt + 1}/${maxAttempts} em 3s…`,
        );
        await sleep(3000);
        continue;
      }
      throw wrapCursorError(err);
    }
  }

  throw wrapCursorError(lastErr);
}

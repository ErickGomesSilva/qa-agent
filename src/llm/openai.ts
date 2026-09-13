import type { LlmAgentOpts, LlmAgentResult, LlmModel } from "./types.ts";
import { notifyTool, fileTools, runTool } from "./tools.ts";

export function openaiExtraHeaders(baseUrl: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (/openrouter\.ai/i.test(baseUrl)) {
    headers["HTTP-Referer"] = "https://github.com/ErickGomesSilva/qa-agent";
    headers["X-Title"] = "QA Agent";
  }
  return headers;
}

export function normalizeOpenAiBase(url: string): string {
  let u = url.trim().replace(/\/$/, "");
  if (!u) u = "https://api.openai.com/v1";
  if (!/\/v\d+$/i.test(u) && !/\/openai(\/|$)/i.test(u)) u += "/v1";
  return u;
}

export async function listOpenAiModels(apiKey: string, baseUrl: string): Promise<LlmModel[]> {
  const base = normalizeOpenAiBase(baseUrl);
  const extra = openaiExtraHeaders(base);
  const res = await fetch(`${base}/models`, {
    headers: { authorization: `Bearer ${apiKey}`, ...extra },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${base}/models HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as { data?: Array<{ id?: string; owned_by?: string }> };
  const ids = (json.data ?? [])
    .map((m) => m.id)
    .filter((id): id is string => Boolean(id))
    .sort();
  if (!ids.length) throw new Error("A API nao devolveu modelos. Confira a base URL e a chave.");
  return ids.map((id) => ({ id, displayName: id }));
}

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
};

export async function runOpenAiAgent(
  apiKey: string,
  baseUrl: string,
  model: string,
  opts: LlmAgentOpts,
): Promise<LlmAgentResult> {
  const base = normalizeOpenAiBase(baseUrl);
  const tools = [...fileTools, ...(opts.enableDiscordTool ? [notifyTool()] : [])];
  const messages: ChatMessage[] = [
    { role: "system", content: opts.system },
    { role: "user", content: opts.prompt },
  ];

  let lastText = "";
  const maxRounds = 48;
  for (let i = 0; i < maxRounds; i++) {
    opts.onLog(`LLM openai round=${i + 1} model=${model}`);
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        ...openaiExtraHeaders(base),
      },
      body: JSON.stringify({
        model,
        messages,
        tools,
        temperature: 0.2,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`chat/completions HTTP ${res.status}: ${text.slice(0, 400)}`);
    }
    const json = (await res.json()) as {
      id?: string;
      choices?: Array<{
        finish_reason?: string;
        message?: ChatMessage;
      }>;
    };
    const msg = json.choices?.[0]?.message;
    if (!msg) throw new Error("Resposta sem message");
    messages.push(msg);
    if (msg.content) {
      lastText += msg.content;
      const snippet = msg.content.slice(0, 400).replace(/\s+/g, " ");
      if (snippet) opts.onLog(`agente▸ ${snippet}`);
    }
    const calls = msg.tool_calls ?? [];
    if (!calls.length) {
      return { text: lastText, id: json.id ?? `openai-${Date.now()}` };
    }
    for (const call of calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
      } catch {
        args = {};
      }
      const path = String(args.path ?? "");
      const detail = path || JSON.stringify(args).slice(0, 100);
      opts.onLog(`tool ${call.function.name} ${detail}`);
      const result = await runTool(opts.cwd, call.function.name, args);
      opts.onLog(`tool ${call.function.name} → ${result.slice(0, 160).replace(/\s+/g, " ")}`);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: result.slice(0, 60_000),
      });
    }
  }
  throw new Error("Agente OpenAI atingiu o limite de voltas de ferramenta");
}

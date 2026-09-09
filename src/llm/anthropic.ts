import type { LlmAgentOpts, LlmAgentResult, LlmModel } from "./types.ts";
import { notifyTool, fileTools, runTool } from "./tools.ts";

const ANTHROPIC_VERSION = "2023-06-01";

function anthropicHeaders(apiKey: string): Record<string, string> {
  return {
    "x-api-key": apiKey,
    "anthropic-version": ANTHROPIC_VERSION,
    "content-type": "application/json",
  };
}

export function normalizeAnthropicBase(url: string): string {
  let u = url.trim().replace(/\/$/, "");
  if (!u) u = "https://api.anthropic.com/v1";
  if (!/\/v\d+$/i.test(u)) u += "/v1";
  return u;
}

export async function listAnthropicModels(apiKey: string, baseUrl: string): Promise<LlmModel[]> {
  const base = normalizeAnthropicBase(baseUrl);
  const res = await fetch(`${base}/models`, { headers: anthropicHeaders(apiKey) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${base}/models HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as { data?: Array<{ id?: string; display_name?: string }> };
  const models = (json.data ?? [])
    .map((m) => ({ id: m.id ?? "", displayName: m.display_name || m.id || "" }))
    .filter((m) => m.id);
  if (!models.length) throw new Error("A API Anthropic nao devolveu modelos. Confira a chave.");
  return models;
}

function toAnthropicTools(enableNotify: boolean) {
  const src = [...fileTools, ...(enableNotify ? [notifyTool()] : [])];
  return src.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));
}

type AnthContent =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

export async function runAnthropicAgent(
  apiKey: string,
  baseUrl: string,
  model: string,
  opts: LlmAgentOpts,
): Promise<LlmAgentResult> {
  const base = normalizeAnthropicBase(baseUrl);
  const tools = toAnthropicTools(Boolean(opts.enableDiscordTool));
  const messages: Array<{ role: "user" | "assistant"; content: AnthContent[] | string }> = [
    { role: "user", content: opts.prompt },
  ];

  let lastText = "";
  const maxRounds = 48;
  for (let i = 0; i < maxRounds; i++) {
    opts.onLog(`LLM claude round=${i + 1} model=${model}`);
    const res = await fetch(`${base}/messages`, {
      method: "POST",
      headers: anthropicHeaders(apiKey),
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        system: opts.system,
        messages,
        tools,
        temperature: 0.2,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`messages HTTP ${res.status}: ${text.slice(0, 400)}`);
    }
    const json = (await res.json()) as {
      id?: string;
      stop_reason?: string;
      content?: AnthContent[];
    };
    const blocks = json.content ?? [];
    messages.push({ role: "assistant", content: blocks });

    const toolUses = blocks.filter((b): b is Extract<AnthContent, { type: "tool_use" }> => b.type === "tool_use");
    for (const b of blocks) {
      if (b.type === "text" && b.text) {
        lastText += b.text;
        const snippet = b.text.slice(0, 400).replace(/\s+/g, " ");
        if (snippet) opts.onLog(snippet);
      }
    }

    if (!toolUses.length) {
      return { text: lastText, id: json.id ?? `anthropic-${Date.now()}` };
    }

    const results: AnthContent[] = [];
    for (const call of toolUses) {
      opts.onLog(`tool ${call.name} ${String(call.input.path ?? "")}`);
      const result = await runTool(opts.cwd, call.name, call.input ?? {});
      results.push({
        type: "tool_result",
        tool_use_id: call.id,
        content: result.slice(0, 60_000),
      });
    }
    messages.push({ role: "user", content: results });
  }
  throw new Error("Agente Claude atingiu o limite de voltas de ferramenta");
}

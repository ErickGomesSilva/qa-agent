import { config } from "../config.ts";
import { runCursorAgent, listCursorModels } from "./cursor.ts";
import { listAnthropicModels, runAnthropicAgent } from "./anthropic.ts";
import { listOpenAiModels, runOpenAiAgent } from "./openai.ts";
import { defaultBaseUrl, isOpenAiCompatible } from "./presets.ts";
import type { LlmAgentOpts, LlmAgentResult, LlmModel, LlmProvider } from "./types.ts";

export function llmApiKey(): string {
  return (config.llmApiKey || config.cursorApiKey).trim();
}

export function llmModel(): string {
  return (config.llmModel || config.cursorModel).trim();
}

function resolvedBase(explicit?: string): string {
  const url = (explicit || config.llmBaseUrl || defaultBaseUrl(config.llmProvider)).trim();
  return url || defaultBaseUrl(config.llmProvider);
}

export async function listLlmModels(): Promise<LlmModel[]> {
  const key = llmApiKey();
  if (!key) throw new Error("Configure a API key na aba F1");
  if (config.llmProvider === "cursor") return listCursorModels(key);
  if (config.llmProvider === "anthropic") return listAnthropicModels(key, resolvedBase());
  return listOpenAiModels(key, resolvedBase());
}

export async function runLlmAgent(opts: LlmAgentOpts): Promise<LlmAgentResult> {
  const key = llmApiKey();
  const model = llmModel();
  if (!key) throw new Error("API key ausente (F1)");
  if (!model) throw new Error("Modelo ausente (F2)");
  opts.onLog(`provedor=${config.llmProvider} model=${model}`);
  if (config.llmProvider === "cursor") return runCursorAgent(key, model, opts);
  if (config.llmProvider === "anthropic") {
    return runAnthropicAgent(key, resolvedBase(), model, opts);
  }
  if (isOpenAiCompatible(config.llmProvider)) {
    return runOpenAiAgent(key, resolvedBase(), model, opts);
  }
  return runCursorAgent(key, model, opts);
}

export async function validateLlmAuth(opts: {
  provider: LlmProvider;
  apiKey: string;
  baseUrl: string;
}): Promise<LlmModel[]> {
  if (!opts.apiKey.trim()) throw new Error("Cole a API key");
  const key = opts.apiKey.trim();
  const base = opts.baseUrl.trim() || defaultBaseUrl(opts.provider);
  if (opts.provider === "cursor") return listCursorModels(key);
  if (opts.provider === "anthropic") return listAnthropicModels(key, base);
  return listOpenAiModels(key, base);
}

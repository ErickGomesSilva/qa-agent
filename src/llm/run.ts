import { config } from "../config.ts";
import { runCursorAgent, listCursorModels } from "./cursor.ts";
import { listOpenAiModels, runOpenAiAgent } from "./openai.ts";
import type { LlmAgentOpts, LlmAgentResult, LlmModel, LlmProvider } from "./types.ts";

export function llmApiKey(): string {
  return (config.llmApiKey || config.cursorApiKey).trim();
}

export function llmModel(): string {
  return (config.llmModel || config.cursorModel).trim();
}

export async function listLlmModels(): Promise<LlmModel[]> {
  const key = llmApiKey();
  if (!key) throw new Error("Configure a API key na aba F1");
  if (config.llmProvider === "openai") {
    return listOpenAiModels(key, config.llmBaseUrl);
  }
  return listCursorModels(key);
}

export async function runLlmAgent(opts: LlmAgentOpts): Promise<LlmAgentResult> {
  const key = llmApiKey();
  const model = llmModel();
  if (!key) throw new Error("API key ausente (F1)");
  if (!model) throw new Error("Modelo ausente (F2)");
  opts.onLog(`provedor=${config.llmProvider} model=${model}`);
  if (config.llmProvider === "openai") {
    return runOpenAiAgent(key, config.llmBaseUrl, model, opts);
  }
  return runCursorAgent(key, model, opts);
}

export async function validateLlmAuth(opts: {
  provider: LlmProvider;
  apiKey: string;
  baseUrl: string;
}): Promise<LlmModel[]> {
  if (!opts.apiKey.trim()) throw new Error("Cole a API key");
  if (opts.provider === "openai") {
    return listOpenAiModels(opts.apiKey.trim(), opts.baseUrl);
  }
  return listCursorModels(opts.apiKey.trim());
}

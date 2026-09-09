import type { LlmProvider } from "./types.ts";

export type LlmPreset = {
  id: LlmProvider;
  label: string;
  baseUrl: string;
  needsUrl: boolean;
  openaiCompatible: boolean;
};

export const LLM_PRESETS: LlmPreset[] = [
  { id: "cursor", label: "Cursor", baseUrl: "", needsUrl: false, openaiCompatible: false },
  { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", needsUrl: false, openaiCompatible: true },
  {
    id: "anthropic",
    label: "Claude",
    baseUrl: "https://api.anthropic.com/v1",
    needsUrl: false,
    openaiCompatible: false,
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    needsUrl: false,
    openaiCompatible: true,
  },
  {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    needsUrl: false,
    openaiCompatible: true,
  },
  {
    id: "custom",
    label: "Custom",
    baseUrl: "https://api.openai.com/v1",
    needsUrl: true,
    openaiCompatible: true,
  },
];

export function parseLlmProvider(raw: unknown): LlmProvider {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (v === "openai" || v === "openai-compatible") return "openai";
  if (v === "anthropic" || v === "claude") return "anthropic";
  if (v === "openrouter") return "openrouter";
  if (v === "groq") return "groq";
  if (v === "custom" || v === "compatible") return "custom";
  return "cursor";
}

export function llmPreset(id: LlmProvider): LlmPreset {
  return LLM_PRESETS.find((p) => p.id === id) ?? LLM_PRESETS[0]!;
}

export function providerNeedsUrl(id: LlmProvider): boolean {
  return llmPreset(id).needsUrl;
}

export function defaultBaseUrl(id: LlmProvider): string {
  return llmPreset(id).baseUrl;
}

export function isOpenAiCompatible(id: LlmProvider): boolean {
  return llmPreset(id).openaiCompatible;
}

export function cycleLlmProvider(current: LlmProvider, dir: 1 | -1): LlmProvider {
  const i = LLM_PRESETS.findIndex((p) => p.id === current);
  const idx = i < 0 ? 0 : (i + dir + LLM_PRESETS.length) % LLM_PRESETS.length;
  return LLM_PRESETS[idx]!.id;
}

export function llmProviderFromDigit(ch: string): LlmProvider | undefined {
  const n = Number(ch);
  if (!Number.isInteger(n) || n < 1 || n > LLM_PRESETS.length) return undefined;
  return LLM_PRESETS[n - 1]?.id;
}

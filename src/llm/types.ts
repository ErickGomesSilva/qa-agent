export type LlmProvider = "cursor" | "openai" | "anthropic" | "openrouter" | "groq" | "custom";

export type LlmModel = {
  id: string;
  displayName: string;
};

export type LlmAgentResult = {
  text: string;
  id: string;
};

export type LlmAgentOpts = {
  system: string;
  prompt: string;
  cwd: string;
  onLog: (line: string) => void;
  enableDiscordTool?: boolean;
};

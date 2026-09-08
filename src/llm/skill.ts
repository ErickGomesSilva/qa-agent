import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { workspaceDir } from "../workspace.ts";

const templates = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "templates");

function readIfExists(path: string): string {
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8").trim();
}

/** Skill da aplicacao: sempre o prompt de sistema, independente do provedor LLM. */
export function loadQaSkill(): string {
  const skill =
    readIfExists(join(templates, "qa-e2e-requisitos", "SKILL.md")) ||
    readIfExists(join(workspaceDir(), ".cursor", "skills", "qa-e2e-requisitos", "SKILL.md"));
  const walls =
    readIfExists(join(templates, "workspace-AGENTS.md")) ||
    readIfExists(join(workspaceDir(), "AGENTS.md"));
  const parts = [
    skill || "Voce e o agente de QA da aplicacao QA Agent.",
    walls ? `## Paredes\n\n${walls}` : "",
  ].filter(Boolean);
  return parts.join("\n\n");
}

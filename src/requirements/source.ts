import "./local-adapter.ts";
import "./git-adapter.ts";
import { looksLikeGitReqs } from "../req-source.ts";
import { getRequirementSourceAdapter } from "./registry.ts";
import { resolveMcpRequirementSource } from "./mcp-adapter.ts";
import type { McpRequirementSourceConfig, RequirementSourceKind } from "./types.ts";

export type RequirementsSourceSpec =
  | { kind: "local" | "git"; raw: string; update?: boolean }
  | { kind: "mcp"; mcp: McpRequirementSourceConfig };

export type RequirementsResolveResult = {
  dir: string;
  manifestPath?: string;
  ambiguousUsIds?: string[];
};

/** Deriva "local"/"git" automaticamente a partir de requisitosPath — igual ao comportamento atual. */
export function inferRequirementSourceKind(requisitosPath?: string): RequirementSourceKind {
  if (requisitosPath && looksLikeGitReqs(requisitosPath)) return "git";
  return "local";
}

/**
 * Ponto único para resolver a origem dos requisitos. Para local/git é byte-idêntico ao
 * comportamento atual (delega para req-source.ts). Para mcp, busca do gestor de projetos e
 * materializa Markdown compatível com o pipeline existente.
 */
export async function resolveRequirementsSource(spec: RequirementsSourceSpec): Promise<RequirementsResolveResult> {
  if (spec.kind === "mcp") {
    const result = await resolveMcpRequirementSource(spec.mcp);
    return {
      dir: result.dir,
      manifestPath: `${result.dir}/SOURCE-MANIFEST.json`,
      ambiguousUsIds: result.ambiguousUsIds,
    };
  }
  const adapter = getRequirementSourceAdapter(spec.kind);
  if (!adapter) throw new Error(`Fonte de requisitos '${spec.kind}' não registrada`);
  const resolved = await adapter.resolve({ raw: spec.raw, update: spec.update });
  return { dir: resolved.dir };
}

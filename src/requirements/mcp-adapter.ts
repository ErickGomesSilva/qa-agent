import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createProjectManagerAdapter } from "../project-managers/registry.ts";
import { materializeContractsToMarkdown } from "./materialize.ts";
import type { ResolvedRequirementSource } from "./registry.ts";
import type { McpRequirementSourceConfig } from "./types.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function mcpCacheDir(cfg: McpRequirementSourceConfig): string {
  const id = createHash("sha1")
    .update(`${cfg.provider}|${cfg.workspaceId ?? ""}|${cfg.projectId}|${cfg.cycleId ?? ""}`)
    .digest("hex")
    .slice(0, 12);
  return join(ROOT, "data", "cache", "mcp", `${cfg.provider}-${id}`, "requisitos");
}

export type ResolveMcpRequirementSourceResult = ResolvedRequirementSource & { ambiguousUsIds: string[] };

/**
 * Fonte "mcp": busca work items via o adapter do provider (Plane, etc.), resolve o contrato
 * efetivo por US e materializa Markdown canônico — o resto do pipeline (roteiro, specs, auditoria)
 * não muda, pois continua lendo arquivos .md locais.
 *
 * Diferente de local/git, a config MCP varia por rodada (server/provider/projeto/ciclo), então
 * não é um singleton registrado — é chamada diretamente pelo orquestrador de fontes (source.ts).
 */
export async function resolveMcpRequirementSource(cfg: McpRequirementSourceConfig): Promise<ResolveMcpRequirementSourceResult> {
  const adapter = createProjectManagerAdapter(cfg.provider, { server: cfg.server });
  const caps = await adapter.capabilities();
  if (!caps.readWorkItems) {
    throw new Error(`Provider '${cfg.provider}' não permite leitura de work items`);
  }
  const result = await adapter.listWorkItems({
    workspaceId: cfg.workspaceId,
    projectId: cfg.projectId,
    cycleId: cfg.cycleId,
    search: cfg.search,
  });
  const withRelations = caps.readRelations
    ? await Promise.all(
        result.items.map(async (item) => {
          const full = await adapter.getWorkItem(cfg.projectId, item.externalId);
          return full ?? item;
        }),
      )
    : result.items;

  const destDir = mcpCacheDir(cfg);
  const { manifest, ambiguousUsIds } = materializeContractsToMarkdown(withRelations, destDir, {
    scope: { mode: "all" },
  });
  return { dir: destDir, manifest, ambiguousUsIds };
}

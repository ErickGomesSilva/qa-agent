import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createProjectManagerAdapter } from "../project-managers/registry.ts";
import type { ProjectManagerAdapter, ProjectManagerCapabilities } from "../project-managers/types.ts";
import { materializeContractsToMarkdown, usIdFromContract } from "./materialize.ts";
import type { ResolvedRequirementSource } from "./registry.ts";
import type { McpRequirementSourceConfig, RequirementContract } from "./types.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function mcpCacheDir(cfg: McpRequirementSourceConfig): string {
  const id = createHash("sha1")
    .update(`${cfg.provider}|${cfg.workspaceId ?? ""}|${cfg.projectId}|${cfg.cycleId ?? ""}`)
    .digest("hex")
    .slice(0, 12);
  return join(ROOT, "data", "cache", "mcp", `${cfg.provider}-${id}`, "requisitos");
}

/** Extrai a chave de deduplicação: US_XXX no título se houver, senão a key externa do item. */
function dedupeKey(c: RequirementContract): string {
  const m = c.title.match(/\bUS_[A-Z0-9_]+\b/);
  return m ? m[0]! : c.key;
}

function itemTimestamp(c: RequirementContract): number {
  const t = c.updatedAt ? Date.parse(c.updatedAt) : NaN;
  return Number.isFinite(t) ? t : 0;
}

/**
 * Quando o mesmo requisito existe mais de uma vez (reimportações, catálogos paralelos), fica só
 * a versão mais recente (updatedAt). Não há tentativa de mesclar conteúdo — a mais antiga é
 * descartada e registrada em `dropped` para o relatório/telemetria.
 */
export function dedupeByRecency(contracts: RequirementContract[]): {
  kept: RequirementContract[];
  dropped: Array<{ key: string; discardedTitle: string; keptTitle: string }>;
} {
  const byKey = new Map<string, RequirementContract>();
  const dropped: Array<{ key: string; discardedTitle: string; keptTitle: string }> = [];
  for (const c of contracts) {
    if (c.type !== "user-story") {
      byKey.set(`${c.type}:${c.externalId}`, c);
      continue;
    }
    const key = dedupeKey(c);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, c);
      continue;
    }
    const winner = itemTimestamp(c) >= itemTimestamp(existing) ? c : existing;
    const loser = winner === c ? existing : c;
    dropped.push({ key, discardedTitle: loser.title, keptTitle: winner.title });
    byKey.set(key, winner);
  }
  return { kept: [...byKey.values()], dropped };
}

/** Filtra por label (nome, case-insensitive) — item entra se tiver QUALQUER uma das labels exigidas. */
export function filterByRequiredLabels(contracts: RequirementContract[], requiredLabels?: string[]): RequirementContract[] {
  if (!requiredLabels?.length) return contracts;
  const wanted = new Set(requiredLabels.map((l) => l.trim().toLowerCase()));
  return contracts.filter((c) => c.labels.some((l) => wanted.has(l.trim().toLowerCase())));
}

async function fetchAllWorkItems(
  adapter: ProjectManagerAdapter,
  caps: ProjectManagerCapabilities,
  cfg: McpRequirementSourceConfig,
): Promise<RequirementContract[]> {
  const all: RequirementContract[] = [];
  let cursor: string | undefined;
  // Guarda contra paginação infinita em resposta malformada.
  for (let page = 0; page < 200; page++) {
    const result = await adapter.listWorkItems({
      workspaceId: cfg.workspaceId,
      projectId: cfg.projectId,
      cycleId: cfg.cycleId,
      search: cfg.search,
      cursor,
    });
    all.push(...result.items);
    if (!result.nextCursor || result.nextCursor === cursor) break;
    cursor = result.nextCursor;
  }
  if (!caps.readRelations) return all;
  return Promise.all(
    all.map(async (item) => {
      const full = await adapter.getWorkItem(cfg.projectId, item.externalId);
      return full ?? item;
    }),
  );
}

export type ResolveMcpRequirementSourceResult = ResolvedRequirementSource & {
  ambiguousUsIds: string[];
  dropped: Array<{ key: string; discardedTitle: string; keptTitle: string }>;
  totalFetched: number;
  totalConsidered: number;
};

/**
 * Fonte "mcp": busca work items via o adapter do provider (Plane, etc.), filtra por label
 * obrigatória (ex.: "Requisitos"), resolve duplicidade por recência, resolve o contrato efetivo
 * por US e materializa Markdown canônico — o resto do pipeline (roteiro, specs, auditoria) não
 * muda, pois continua lendo arquivos .md locais.
 */
export async function resolveMcpRequirementSource(cfg: McpRequirementSourceConfig): Promise<ResolveMcpRequirementSourceResult> {
  const adapter = createProjectManagerAdapter(cfg.provider, { server: cfg.server });
  const caps = await adapter.capabilities();
  if (!caps.readWorkItems) {
    throw new Error(`Provider '${cfg.provider}' não permite leitura de work items`);
  }

  const fetched = await fetchAllWorkItems(adapter, caps, cfg);
  const withLabel = filterByRequiredLabels(fetched, cfg.requiredLabels);
  const { kept, dropped } = dedupeByRecency(withLabel);

  const destDir = mcpCacheDir(cfg);
  const { manifest, ambiguousUsIds } = materializeContractsToMarkdown(kept, destDir, {
    scope: { mode: "all" },
  });
  return {
    dir: destDir,
    manifest,
    ambiguousUsIds,
    dropped,
    totalFetched: fetched.length,
    totalConsidered: kept.length,
  };
}

export type EpicPreview = {
  key: string;
  title: string;
  featureCount: number;
  usCount: number;
};

export type PreviewResult = {
  epics: EpicPreview[];
  totalFetched: number;
  totalConsidered: number;
  droppedCount: number;
};

/**
 * Só para validação na TUI/CLI antes de salvar a config: busca, filtra e agrupa em Épicos (sem
 * materializar nada em disco). Usa a mesma lógica de fetch/filtro/dedupe da resolução real.
 */
export async function previewMcpProject(cfg: McpRequirementSourceConfig): Promise<PreviewResult> {
  const adapter = createProjectManagerAdapter(cfg.provider, { server: cfg.server });
  const caps = await adapter.capabilities();
  if (!caps.readWorkItems) {
    throw new Error(`Provider '${cfg.provider}' não permite leitura de work items`);
  }
  const fetched = await fetchAllWorkItems(adapter, caps, cfg);
  const withLabel = filterByRequiredLabels(fetched, cfg.requiredLabels);
  const { kept, dropped } = dedupeByRecency(withLabel);

  const epics = kept.filter((c) => c.type === "epic");
  const features = kept.filter((c) => c.type === "feature");
  const userStories = kept.filter((c) => c.type === "user-story");

  const epicPreviews: EpicPreview[] = epics.map((epic) => {
    const childFeatureIds = new Set(features.filter((f) => f.parentId === epic.externalId).map((f) => f.externalId));
    const usCount = userStories.filter(
      (u) => u.parentId === epic.externalId || (u.parentId && childFeatureIds.has(u.parentId)),
    ).length;
    return { key: epic.key, title: epic.title, featureCount: childFeatureIds.size, usCount };
  });

  return {
    epics: epicPreviews,
    totalFetched: fetched.length,
    totalConsidered: kept.length,
    droppedCount: dropped.length,
  };
}

/** Usado pela TUI para pré-preencher o `key` de um contrato materializado, sem duplicar regex. */
export { usIdFromContract };

import { loadSettings } from "./settings.ts";
import { createProjectManagerAdapter } from "./project-managers/registry.ts";
import { createSinkFromAdapter, syncProductFinding, type ProductFindingSink } from "./project-managers/bug-sync.ts";
import type { ProductBugInput } from "./project-managers/types.ts";
import type { PlaywrightFailure, ProductFinding } from "./types.ts";
import "./project-managers/plane-adapter.ts";

/**
 * Só existe sink quando o usuário configurou explicitamente uma fonte MCP com escrita.
 * Instalações sem MCP (a imensa maioria) recebem sempre `undefined` aqui — zero mudança de
 * comportamento. Nunca lança: qualquer problema de configuração/conexão vira `undefined`.
 */
export async function getConfiguredBugSink(onLog?: (line: string) => void): Promise<ProductFindingSink | undefined> {
  const s = loadSettings();
  if (s.requirementSourceKind !== "mcp" || !s.mcpRequirementSource) return undefined;
  try {
    const adapter = createProjectManagerAdapter(s.mcpRequirementSource.provider, { server: s.mcpRequirementSource.server });
    const caps = await adapter.capabilities();
    const sink = createSinkFromAdapter(adapter, caps);
    if (!sink) {
      onLog?.(
        `gestor de projetos '${s.mcpRequirementSource.provider}' é somente leitura — achados PRODUTO ficam locais (PRODUTO.json)`,
      );
    }
    return sink;
  } catch (err) {
    onLog?.(
      `aviso: não foi possível conectar ao gestor de projetos configurado — achado permanece local (${err instanceof Error ? err.message : String(err)})`,
    );
    return undefined;
  }
}

/** Constrói o payload de Bug a partir do achado local (ProductFinding) + contexto da rodada. */
export function buildProductBugInput(opts: {
  finding: ProductFinding;
  failure: PlaywrightFailure | undefined;
  baseUrl: string;
  runId: string;
  reportRef?: string;
  profileLabel?: string;
}): ProductBugInput {
  const s = loadSettings();
  const mcp = s.mcpRequirementSource;
  return {
    provider: mcp?.provider ?? "unknown",
    projectId: mcp?.projectId ?? "",
    workspaceId: mcp?.workspaceId,
    requirementKey: opts.finding.us,
    ruleOrCriterionId: opts.finding.ca,
    testTitle: opts.finding.title,
    expected: "Ver Critério de Aceite referenciado (o teste falhou na verificação esperada).",
    observed: opts.finding.resumo,
    environmentBaseUrl: opts.baseUrl,
    profileLabel: opts.profileLabel,
    steps: [opts.failure?.error?.slice(0, 800) ?? "Ver evidência Playwright anexada."],
    evidence: [],
    severity: "medium",
    runId: opts.runId,
    occurredAt: new Date().toISOString(),
    reportRef: opts.reportRef,
    assigneeExternalId: mcp?.defaultAssigneeExternalId,
    labels: mcp?.defaultLabels,
  };
}

export { syncProductFinding };

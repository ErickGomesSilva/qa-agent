import type { RunEscopo } from "../escopo.ts";
import { usIdFromContract } from "./materialize.ts";
import type { RequirementContract, RequirementRunScope } from "./types.ts";

export type ScopeInclusion = { usId: string; reason: string };
export type ScopeExclusion = { usId: string; reason: string };

export type ScopeResolution = {
  scope: RequirementRunScope;
  escopo: RunEscopo;
  usIds: string[] | undefined;
  included: ScopeInclusion[];
  excluded: ScopeExclusion[];
  bugId?: string;
  grep?: string;
  ambiguousScenarios?: Array<{ usId: string; description: string }>;
};

function escapeGrep(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findByUsId(contracts: RequirementContract[], usId: string): RequirementContract | undefined {
  return contracts.find((c) => c.type === "user-story" && usIdFromContract(c) === usId);
}

function relatedUsFromDeclaredJourney(contracts: RequirementContract[], us: RequirementContract): ScopeInclusion[] {
  // Só dependências/jornadas EXPLICITAMENTE declaradas via relations (blocked_by / relates_to
  // apontando para outra US) — nunca inferidas por Feature/Épico ou semântica.
  const out: ScopeInclusion[] = [];
  for (const rel of us.relations) {
    if (rel.kind !== "blocked_by" && rel.kind !== "relates_to") continue;
    const target = contracts.find((c) => c.type === "user-story" && c.externalId === rel.targetExternalId);
    if (!target) continue;
    const reason = rel.kind === "blocked_by" ? "dependência explícita (blocked_by)" : "jornada relacionada explícita (relates_to)";
    out.push({ usId: usIdFromContract(target), reason });
  }
  return out;
}

/**
 * Resolve o escopo de execução (suíte completa / US / cenário / Bug) num RunEscopo + relatório
 * de inclusão/exclusão. O grep derivado é uma proteção ADICIONAL — a filtragem "de verdade" deve
 * usar `usIds` nas camadas de roteiro/geração/auditoria (ver limitações no README).
 */
export function resolveRunScope(scope: RequirementRunScope, contracts: RequirementContract[], base: RunEscopo): ScopeResolution {
  if (scope.mode === "all") {
    return { scope, escopo: base, usIds: undefined, included: [], excluded: [] };
  }

  if (scope.mode === "us") {
    const us = findByUsId(contracts, scope.usId);
    if (!us) {
      throw new Error(`US '${scope.usId}' não encontrada no gestor de projetos`);
    }
    const usId = usIdFromContract(us);
    const included: ScopeInclusion[] = [{ usId, reason: "US selecionada" }];
    const excluded: ScopeExclusion[] = contracts
      .filter((c) => c.type === "user-story" && usIdFromContract(c) !== usId)
      .map((c) => ({ usId: usIdFromContract(c), reason: "fora do escopo (modo=us)" }));
    const grep = escapeGrep(usId);
    return {
      scope,
      escopo: { ...base, modo: "focado", usIds: [usId] },
      usIds: [usId],
      included,
      excluded,
      grep,
    };
  }

  if (scope.mode === "scenario") {
    const us = findByUsId(contracts, scope.usId);
    if (!us) {
      throw new Error(`US '${scope.usId}' não encontrada no gestor de projetos`);
    }
    const usId = usIdFromContract(us);
    const included: ScopeInclusion[] = [{ usId, reason: "US selecionada" }, ...relatedUsFromDeclaredJourney(contracts, us)];
    const includedIds = new Set(included.map((i) => i.usId));
    const excluded: ScopeExclusion[] = contracts
      .filter((c) => c.type === "user-story" && !includedIds.has(usIdFromContract(c)))
      .map((c) => ({
        usId: usIdFromContract(c),
        reason: "sem relação explícita declarada com o cenário (não incluído por Feature/Épico/semântica)",
      }));
    const grep = [...includedIds].map(escapeGrep).join("|");
    return {
      scope,
      escopo: { ...base, modo: "focado", usIds: [...includedIds] },
      usIds: [...includedIds],
      included,
      excluded,
      grep,
    };
  }

  // scope.mode === "bug"
  const bug = contracts.find((c) => c.type === "bug" && (c.externalId === scope.bugId || c.key === scope.bugId));
  if (!bug) {
    throw new Error(`Bug '${scope.bugId}' não encontrado no gestor de projetos`);
  }
  const originRel = bug.relations.find((r) => r.kind === "fixes" || r.kind === "blocks" || r.kind === "relates_to");
  const originUs = originRel
    ? contracts.find((c) => c.type === "user-story" && c.externalId === originRel.targetExternalId)
    : undefined;
  if (!originUs) {
    throw new Error(`Bug '${scope.bugId}' não tem relação explícita com nenhuma US — não é possível resolver o menor recorte`);
  }
  const usId = usIdFromContract(originUs);
  const included: ScopeInclusion[] = [{ usId, reason: `US de origem do Bug ${bug.key}` }];
  const excluded: ScopeExclusion[] = contracts
    .filter((c) => c.type === "user-story" && usIdFromContract(c) !== usId)
    .map((c) => ({ usId: usIdFromContract(c), reason: "fora do menor recorte para reteste do Bug" }));
  return {
    scope,
    escopo: { ...base, modo: "focado", usIds: [usId] },
    usIds: [usId],
    included,
    excluded,
    bugId: bug.key ?? bug.externalId,
    grep: escapeGrep(usId),
  };
}

/** Texto pronto para o relatório/telemetria descrever o escopo executado. */
export function formatScopeReport(resolution: ScopeResolution): string[] {
  const lines: string[] = [];
  lines.push(`Escopo: modo=${resolution.scope.mode}`);
  if (resolution.bugId) lines.push(`Bug selecionado: ${resolution.bugId}`);
  for (const inc of resolution.included) lines.push(`  incluído: ${inc.usId} — ${inc.reason}`);
  for (const exc of resolution.excluded.slice(0, 20)) lines.push(`  excluído: ${exc.usId} — ${exc.reason}`);
  if (resolution.excluded.length > 20) lines.push(`  ... e mais ${resolution.excluded.length - 20} excluído(s)`);
  return lines;
}

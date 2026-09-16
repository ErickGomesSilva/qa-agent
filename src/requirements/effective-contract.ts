import type { NormalizedAcceptanceCriterion, NormalizedBusinessRule, RequirementContract } from "./types.ts";

export type EffectiveContractResult = {
  contract: RequirementContract;
  ambiguous: boolean;
  ambiguityReason?: string;
  supersededRuleIds: string[];
  supersededCriterionIds: string[];
};

function changeWinsOver(a: RequirementContract, b: RequirementContract): boolean {
  return a.relations.some((r) => r.kind === "supersedes" && r.targetExternalId === b.externalId);
}

/**
 * Uma US aprovada é o contrato oficial. Mudanças de Requisito só alteram RN/CA quando:
 *  - a Mudança está aprovada;
 *  - originRequirementId aponta para a US;
 *  - cada RN/CA da mudança declara explicitamente qual RN/CA da US ela substitui (`supersedes`).
 * Conflitos entre mudanças aprovadas sem relação explícita de substituição entre si tornam o
 * contrato ambíguo — nunca inventamos qual regra prevalece.
 */
export function resolveEffectiveContract(
  us: RequirementContract,
  changes: RequirementContract[],
): EffectiveContractResult {
  const approved = changes.filter((c) => c.approved && c.type === "requirement-change" && c.originRequirementId === us.externalId);
  if (!approved.length) {
    return { contract: us, ambiguous: false, supersededRuleIds: [], supersededCriterionIds: [] };
  }

  // target rule/criterion id -> list of changes that claim to supersede it
  const ruleClaims = new Map<string, RequirementContract[]>();
  const criterionClaims = new Map<string, RequirementContract[]>();

  for (const change of approved) {
    for (const rule of change.businessRules) {
      if (!rule.supersedes) continue;
      const list = ruleClaims.get(rule.supersedes) ?? [];
      list.push(change);
      ruleClaims.set(rule.supersedes, list);
    }
    for (const ca of change.acceptanceCriteria) {
      if (!ca.supersedes) continue;
      const list = criterionClaims.get(ca.supersedes) ?? [];
      list.push(change);
      criterionClaims.set(ca.supersedes, list);
    }
  }

  let ambiguous = false;
  const ambiguityReasons: string[] = [];

  function resolveWinner(targetId: string, claimants: RequirementContract[]): RequirementContract | undefined {
    const unique = [...new Set(claimants)];
    if (unique.length === 1) return unique[0];
    // Precisa de uma cadeia total: cada par deve ter uma relação explícita de ordem.
    const sorted = [...unique];
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i]!;
        const b = sorted[j]!;
        if (!changeWinsOver(a, b) && !changeWinsOver(b, a)) {
          ambiguous = true;
          ambiguityReasons.push(
            `${targetId}: Mudanças ${a.key} e ${b.key} aprovadas sem relação explícita de substituição entre si`,
          );
          return undefined;
        }
      }
    }
    return sorted.reduce((winner, candidate) => (changeWinsOver(candidate, winner) ? candidate : winner));
  }

  const supersededRuleIds: string[] = [];
  const supersededCriterionIds: string[] = [];
  const finalRules: NormalizedBusinessRule[] = [...us.businessRules];
  const finalCriteria: NormalizedAcceptanceCriterion[] = [...us.acceptanceCriteria];
  const appliedNewRules: NormalizedBusinessRule[] = [];
  const appliedNewCriteria: NormalizedAcceptanceCriterion[] = [];

  // RN/CA de mudanças aprovadas sem `supersedes` são puramente aditivas (não há alvo a resolver).
  for (const change of approved) {
    for (const rule of change.businessRules) {
      if (!rule.supersedes) appliedNewRules.push({ id: rule.id, text: rule.text });
    }
    for (const ca of change.acceptanceCriteria) {
      if (!ca.supersedes) appliedNewCriteria.push({ id: ca.id, given: ca.given, when: ca.when, then: ca.then });
    }
  }

  for (const [targetId, claimants] of ruleClaims) {
    const winner = resolveWinner(targetId, claimants);
    if (!winner) continue;
    const idx = finalRules.findIndex((r) => r.id === targetId);
    const replacement = winner.businessRules.find((r) => r.supersedes === targetId)!;
    if (idx >= 0) {
      finalRules[idx] = { id: replacement.id, text: replacement.text };
      supersededRuleIds.push(targetId);
    } else {
      appliedNewRules.push({ id: replacement.id, text: replacement.text });
    }
  }

  for (const [targetId, claimants] of criterionClaims) {
    const winner = resolveWinner(targetId, claimants);
    if (!winner) continue;
    const idx = finalCriteria.findIndex((c) => c.id === targetId);
    const replacement = winner.acceptanceCriteria.find((c) => c.supersedes === targetId)!;
    if (idx >= 0) {
      finalCriteria[idx] = { id: replacement.id, given: replacement.given, when: replacement.when, then: replacement.then };
      supersededCriterionIds.push(targetId);
    } else {
      appliedNewCriteria.push({ id: replacement.id, given: replacement.given, when: replacement.when, then: replacement.then });
    }
  }

  const contract: RequirementContract = {
    ...us,
    businessRules: [...finalRules, ...appliedNewRules],
    acceptanceCriteria: [...finalCriteria, ...appliedNewCriteria],
  };

  return {
    contract,
    ambiguous,
    ambiguityReason: ambiguous ? ambiguityReasons.join("; ") : undefined,
    supersededRuleIds,
    supersededCriterionIds,
  };
}

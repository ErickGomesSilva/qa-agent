import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveEffectiveContract } from "./effective-contract.ts";
import type { RequirementContract } from "./types.ts";

function baseUs(overrides: Partial<RequirementContract> = {}): RequirementContract {
  return {
    provider: "plane",
    projectId: "proj-1",
    externalId: "us-1",
    key: "PROJ-100",
    type: "user-story",
    title: "US de teste",
    description: "Descrição",
    approved: true,
    assigneeIds: [],
    labels: [],
    businessRules: [{ id: "RN_1", text: "regra original" }],
    acceptanceCriteria: [{ id: "CA1", then: "resultado original" }],
    relations: [],
    ...overrides,
  };
}

function change(overrides: Partial<RequirementContract>): RequirementContract {
  return {
    provider: "plane",
    projectId: "proj-1",
    externalId: "chg-1",
    key: "PROJ-200",
    type: "requirement-change",
    title: "Mudança",
    description: "",
    approved: true,
    originRequirementId: "us-1",
    assigneeIds: [],
    labels: [],
    businessRules: [],
    acceptanceCriteria: [],
    relations: [],
    ...overrides,
  };
}

describe("resolveEffectiveContract", () => {
  it("sem mudanças, contrato = US original", () => {
    const us = baseUs();
    const result = resolveEffectiveContract(us, []);
    assert.equal(result.ambiguous, false);
    assert.deepEqual(result.contract, us);
  });

  it("mudança em rascunho (não aprovada) não altera o contrato vigente", () => {
    const us = baseUs();
    const draft = change({
      approved: false,
      acceptanceCriteria: [{ id: "CA1-v2", then: "novo resultado", supersedes: "CA1" }],
    });
    const result = resolveEffectiveContract(us, [draft]);
    assert.equal(result.ambiguous, false);
    assert.equal(result.contract.acceptanceCriteria[0]!.then, "resultado original");
  });

  it("mudança aprovada com supersedes explícito substitui o CA", () => {
    const us = baseUs();
    const approved = change({
      acceptanceCriteria: [{ id: "CA1-v2", then: "novo resultado", supersedes: "CA1" }],
    });
    const result = resolveEffectiveContract(us, [approved]);
    assert.equal(result.ambiguous, false);
    assert.equal(result.contract.acceptanceCriteria.length, 1);
    assert.equal(result.contract.acceptanceCriteria[0]!.id, "CA1-v2");
    assert.equal(result.contract.acceptanceCriteria[0]!.then, "novo resultado");
    assert.deepEqual(result.supersededCriterionIds, ["CA1"]);
  });

  it("duas mudanças aprovadas conflitando sem relação explícita entre si => ambíguo", () => {
    const us = baseUs();
    const a = change({
      externalId: "chg-a",
      key: "PROJ-201",
      acceptanceCriteria: [{ id: "CA1-a", then: "versão A", supersedes: "CA1" }],
    });
    const b = change({
      externalId: "chg-b",
      key: "PROJ-202",
      acceptanceCriteria: [{ id: "CA1-b", then: "versão B", supersedes: "CA1" }],
    });
    const result = resolveEffectiveContract(us, [a, b]);
    assert.equal(result.ambiguous, true);
    assert.match(result.ambiguityReason ?? "", /PROJ-201/);
    // Não inventa qual prevalece: mantém o CA original.
    assert.equal(result.contract.acceptanceCriteria[0]!.then, "resultado original");
  });

  it("duas mudanças com relação explícita de substituição => resolve sem ambiguidade", () => {
    const us = baseUs();
    const a = change({
      externalId: "chg-a",
      key: "PROJ-201",
      acceptanceCriteria: [{ id: "CA1-a", then: "versão A", supersedes: "CA1" }],
    });
    const b = change({
      externalId: "chg-b",
      key: "PROJ-202",
      acceptanceCriteria: [{ id: "CA1-b", then: "versão B (vence)", supersedes: "CA1" }],
      relations: [{ kind: "supersedes", targetExternalId: "chg-a" }],
    });
    const result = resolveEffectiveContract(us, [a, b]);
    assert.equal(result.ambiguous, false);
    assert.equal(result.contract.acceptanceCriteria[0]!.then, "versão B (vence)");
  });

  it("RN nova sem supersedes é adicionada, não substitui nada", () => {
    const us = baseUs();
    const approved = change({
      businessRules: [{ id: "RN_2", text: "regra adicional" }],
    });
    const result = resolveEffectiveContract(us, [approved]);
    assert.equal(result.contract.businessRules.length, 2);
    assert.equal(result.supersededRuleIds.length, 0);
  });
});

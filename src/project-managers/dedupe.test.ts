import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildBugSignature } from "./dedupe.ts";
import type { ProductBugInput } from "./types.ts";

function input(overrides: Partial<ProductBugInput> = {}): ProductBugInput {
  return {
    provider: "plane",
    projectId: "proj-1",
    requirementKey: "PROJ-142",
    ruleOrCriterionId: "CA1",
    testTitle: "US_PROJ_142 — consulta some se so heading",
    expected: "tabela",
    observed: "so aparece heading, sem linha",
    environmentBaseUrl: "https://exemplo.com",
    steps: ["abrir", "consultar"],
    evidence: [],
    runId: "run-1",
    occurredAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("buildBugSignature", () => {
  it("é estável para o mesmo achado", () => {
    const a = buildBugSignature(input());
    const b = buildBugSignature(input());
    assert.equal(a, b);
  });

  it("ignora diferenças de rodada/horário (runId/occurredAt)", () => {
    const a = buildBugSignature(input({ runId: "run-1", occurredAt: "2026-01-01T00:00:00Z" }));
    const b = buildBugSignature(input({ runId: "run-2", occurredAt: "2026-02-02T00:00:00Z" }));
    assert.equal(a, b);
  });

  it("muda quando a US/CA muda", () => {
    const a = buildBugSignature(input());
    const b = buildBugSignature(input({ ruleOrCriterionId: "CA2" }));
    assert.notEqual(a, b);
  });

  it("muda quando o comportamento observado é bem diferente", () => {
    const a = buildBugSignature(input());
    const b = buildBugSignature(input({ observed: "erro 500 ao salvar" }));
    assert.notEqual(a, b);
  });
});

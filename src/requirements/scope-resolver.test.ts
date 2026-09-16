import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RunEscopo } from "../escopo.ts";
import { resolveRunScope } from "./scope-resolver.ts";
import type { RequirementContract } from "./types.ts";

const baseEscopo: RunEscopo = { modo: "geral", labels: [], paths: [] };

function us(id: string, key: string, relations: RequirementContract["relations"] = []): RequirementContract {
  return {
    provider: "plane",
    projectId: "proj-1",
    externalId: id,
    key,
    type: "user-story",
    title: `US ${key}`,
    description: "",
    approved: true,
    assigneeIds: [],
    labels: [],
    businessRules: [],
    acceptanceCriteria: [],
    relations,
  };
}

function bug(id: string, key: string, relations: RequirementContract["relations"] = []): RequirementContract {
  return { ...us(id, key, relations), type: "bug" };
}

describe("resolveRunScope", () => {
  it("mode=all não filtra nada", () => {
    const contracts = [us("u1", "PROJ-1"), us("u2", "PROJ-2")];
    const result = resolveRunScope({ mode: "all" }, contracts, baseEscopo);
    assert.equal(result.usIds, undefined);
    assert.equal(result.included.length, 0);
    assert.equal(result.excluded.length, 0);
  });

  it("mode=us executa somente a US selecionada e exclui as demais", () => {
    const contracts = [us("u1", "PROJ-1"), us("u2", "PROJ-2")];
    const result = resolveRunScope({ mode: "us", usId: "US_PROJ_1" }, contracts, baseEscopo);
    assert.deepEqual(result.usIds, ["US_PROJ_1"]);
    assert.equal(result.included.length, 1);
    assert.equal(result.excluded.length, 1);
    assert.equal(result.excluded[0]!.usId, "US_PROJ_2");
  });

  it("mode=scenario inclui só dependências explícitas (blocked_by/relates_to), não a Feature inteira", () => {
    const contracts = [
      us("u1", "PROJ-1", [{ kind: "blocked_by", targetExternalId: "u0" }]),
      us("u0", "PROJ-0"),
      us("u2", "PROJ-2"), // não relacionada — deve ficar excluída
    ];
    const result = resolveRunScope({ mode: "scenario", usId: "US_PROJ_1" }, contracts, baseEscopo);
    assert.ok(result.usIds!.includes("US_PROJ_1"));
    assert.ok(result.usIds!.includes("US_PROJ_0"));
    assert.ok(!result.usIds!.includes("US_PROJ_2"));
    const excludedIds = result.excluded.map((e) => e.usId);
    assert.ok(excludedIds.includes("US_PROJ_2"));
  });

  it("mode=bug resolve a US de origem e exclui as demais (menor recorte)", () => {
    const contracts = [
      us("u1", "PROJ-1"),
      us("u2", "PROJ-2"),
      bug("b1", "BUG-9", [{ kind: "fixes", targetExternalId: "u1" }]),
    ];
    const result = resolveRunScope({ mode: "bug", bugId: "BUG-9" }, contracts, baseEscopo);
    assert.deepEqual(result.usIds, ["US_PROJ_1"]);
    assert.equal(result.bugId, "BUG-9");
  });

  it("mode=bug sem relação explícita com nenhuma US lança erro (não adivinha)", () => {
    const contracts = [us("u1", "PROJ-1"), bug("b1", "BUG-9")];
    assert.throws(() => resolveRunScope({ mode: "bug", bugId: "BUG-9" }, contracts, baseEscopo));
  });

  it("mode=us com US inexistente lança erro", () => {
    const contracts = [us("u1", "PROJ-1")];
    assert.throws(() => resolveRunScope({ mode: "us", usId: "US_NAO_EXISTE" }, contracts, baseEscopo));
  });
});

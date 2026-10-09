import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { stageUses, type StageToggle } from "./setup.ts";

const ALL: StageToggle[] = [
  "regenerate",
  "autoResume",
  "k6",
  "massa",
  "tour",
  "headed",
  "continueOnProduto",
  "retest",
  "grep",
];

describe("stageUses", () => {
  it("completa usa todas as opções", () => {
    for (const toggle of ALL) assert.equal(stageUses("full", toggle), true, toggle);
  });

  it("mapa e scripts só usam navegador visível e refazer", () => {
    for (const stage of ["map-roteiro", "scripts"] as const) {
      assert.equal(stageUses(stage, "headed"), true);
      assert.equal(stageUses(stage, "regenerate"), true);
      assert.equal(stageUses(stage, "k6"), false);
      assert.equal(stageUses(stage, "massa"), false);
      assert.equal(stageUses(stage, "tour"), false);
      assert.equal(stageUses(stage, "grep"), false);
      assert.equal(stageUses(stage, "retest"), false);
      assert.equal(stageUses(stage, "continueOnProduto"), false);
      assert.equal(stageUses(stage, "autoResume"), false);
    }
  });

  it("só testes ignora jornada e refazer", () => {
    assert.equal(stageUses("tests-only", "tour"), false);
    assert.equal(stageUses("tests-only", "regenerate"), false);
    assert.equal(stageUses("tests-only", "k6"), true);
    assert.equal(stageUses("tests-only", "massa"), true);
    assert.equal(stageUses("tests-only", "grep"), true);
    assert.equal(stageUses("tests-only", "headed"), true);
  });
});

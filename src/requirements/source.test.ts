import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { inferRequirementSourceKind, resolveRequirementsSource } from "./source.ts";

describe("inferRequirementSourceKind", () => {
  it("URL http(s) => git", () => {
    assert.equal(inferRequirementSourceKind("https://github.com/org/repo/tree/main/reqs"), "git");
  });
  it("pasta local => local", () => {
    assert.equal(inferRequirementSourceKind("C:/algum/caminho"), "local");
  });
  it("undefined => local (default seguro)", () => {
    assert.equal(inferRequirementSourceKind(undefined), "local");
  });
});

describe("resolveRequirementsSource — regressão local (comportamento atual preservado)", () => {
  it("kind=local retorna a mesma pasta existente, sem transformação", async () => {
    const dir = mkdtempSync(join(tmpdir(), "qa-agent-reqsrc-"));
    try {
      mkdirSync(join(dir, "requisitos"), { recursive: true });
      writeFileSync(join(dir, "requisitos", "US_1.md"), "# US_1\n### CA1\n**Então** ok\n", "utf8");
      const result = await resolveRequirementsSource({ kind: "local", raw: dir });
      assert.equal(result.dir, dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

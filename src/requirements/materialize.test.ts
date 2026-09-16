import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { listRequirementCases, listRequirementRns } from "../req-sync.ts";
import { materializeContractsToMarkdown, usIdFromContract } from "./materialize.ts";
import type { RequirementContract } from "./types.ts";

function usContract(overrides: Partial<RequirementContract> = {}): RequirementContract {
  return {
    provider: "plane",
    workspaceId: "ws-1",
    projectId: "proj-1",
    cycleId: "cycle-1",
    externalId: "us-1",
    key: "PROJ-142",
    type: "user-story",
    title: "Consulta de documento",
    description: "Como usuário quero consultar um documento",
    status: "Concluído",
    approved: true,
    assigneeIds: [],
    labels: [],
    businessRules: [{ id: "RN_1", text: "Só perfis autorizados consultam" }],
    acceptanceCriteria: [
      { id: "CA1", given: "documento 2xx", when: "consulto", then: "vejo tabela, nao so heading" },
    ],
    relations: [],
    revision: "3",
    sourceUrl: "https://plane.example/proj/us-1",
    ...overrides,
  };
}

describe("materializeContractsToMarkdown", () => {
  it("gera US_ a partir da key externa e compatível com listRequirementCases/listRequirementRns", () => {
    const dir = mkdtempSync(join(tmpdir(), "qa-agent-materialize-"));
    try {
      const us = usContract();
      const { files, manifest } = materializeContractsToMarkdown([us], dir, { scope: { mode: "all" } });

      assert.equal(files.length, 1);
      const usId = usIdFromContract(us);
      assert.equal(usId, "US_PROJ_142");
      assert.ok(existsSync(join(dir, `${usId}.md`)));
      assert.ok(existsSync(join(dir, "SOURCE-MANIFEST.json")));

      const md = readFileSync(join(dir, `${usId}.md`), "utf8");
      assert.match(md, /provider: plane/);
      assert.match(md, /external_key: PROJ-142/);
      assert.doesNotMatch(md, /token|secret|senha:/i);

      const cases = listRequirementCases(dir);
      assert.equal(cases.length, 1);
      assert.equal(cases[0]!.us, usId);
      assert.equal(cases[0]!.ca, "CA1");
      assert.match(cases[0]!.entao, /tabela/);

      const rns = listRequirementRns(dir);
      assert.equal(rns.length, 1);
      assert.equal(rns[0]!.rn, "RN_1");

      assert.equal(manifest.entries.length, 1);
      assert.equal(manifest.entries[0]!.externalKey, "PROJ-142");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("marca contrato ambíguo no Markdown quando há conflito sem relação explícita", () => {
    const dir = mkdtempSync(join(tmpdir(), "qa-agent-materialize-amb-"));
    try {
      const us = usContract();
      const changeA: RequirementContract = {
        ...usContract({ externalId: "chg-a", key: "PROJ-143" }),
        type: "requirement-change",
        originRequirementId: "us-1",
        acceptanceCriteria: [{ id: "CA1-a", then: "versão A", supersedes: "CA1" }],
      };
      const changeB: RequirementContract = {
        ...usContract({ externalId: "chg-b", key: "PROJ-144" }),
        type: "requirement-change",
        originRequirementId: "us-1",
        acceptanceCriteria: [{ id: "CA1-b", then: "versão B", supersedes: "CA1" }],
      };
      const { ambiguousUsIds } = materializeContractsToMarkdown([us, changeA, changeB], dir, {
        scope: { mode: "all" },
      });
      assert.deepEqual(ambiguousUsIds, [usIdFromContract(us)]);
      const md = readFileSync(join(dir, `${usIdFromContract(us)}.md`), "utf8");
      assert.match(md, /contrato ambíguo/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

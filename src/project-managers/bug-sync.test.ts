import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { syncProductFinding, type ProductFindingSink } from "./bug-sync.ts";
import type { ExternalIssue, ProductBugInput } from "./types.ts";

function input(overrides: Partial<ProductBugInput> = {}): ProductBugInput {
  return {
    provider: "plane",
    projectId: "proj-1",
    requirementKey: "PROJ-142",
    ruleOrCriterionId: "CA1",
    testTitle: "consulta falha",
    expected: "tabela",
    observed: "so heading",
    environmentBaseUrl: "https://exemplo.com",
    steps: ["abrir"],
    evidence: [],
    runId: "run-1",
    occurredAt: new Date().toISOString(),
    ...overrides,
  };
}

function withTmpDir(fn: (dir: string) => Promise<void> | void) {
  const dir = mkdtempSync(join(tmpdir(), "qa-agent-bugsync-"));
  return Promise.resolve(fn(dir)).finally(() => rmSync(dir, { recursive: true, force: true }));
}

describe("syncProductFinding", () => {
  it("sem sink configurado: status=skipped, não escreve pendência, não lança", async () => {
    await withTmpDir(async (dir) => {
      const logs: string[] = [];
      const outcome = await syncProductFinding({ sink: undefined, input: input(), e2eDir: dir, onLog: (l) => logs.push(l) });
      assert.equal(outcome.status, "skipped");
      assert.ok(logs.some((l) => /local/i.test(l)));
    });
  });

  it("cria Bug quando não há duplicata", async () => {
    await withTmpDir(async (dir) => {
      const created: ExternalIssue = { id: "issue-1", key: "BUG-1", url: "https://plane/issue-1" };
      const calls: string[] = [];
      const sink: ProductFindingSink = {
        provider: "plane",
        findDuplicate: async () => undefined,
        createBug: async () => {
          calls.push("createBug");
          return created;
        },
        updateBug: async () => created,
        linkToRequirement: async () => {
          calls.push("linkToRequirement");
        },
        assign: async () => {
          calls.push("assign");
        },
        addEvidence: async () => {
          calls.push("addEvidence");
        },
      };
      const outcome = await syncProductFinding({ sink, input: input({ requirementExternalId: "us-1" }), e2eDir: dir, onLog: () => {} });
      assert.equal(outcome.status, "created");
      assert.equal(outcome.issue.key, "BUG-1");
      assert.ok(calls.includes("createBug"));
      assert.ok(calls.includes("linkToRequirement"));
    });
  });

  it("atualiza Bug existente em vez de criar duplicata", async () => {
    await withTmpDir(async (dir) => {
      const existing: ExternalIssue = { id: "issue-9", key: "BUG-9" };
      let createCalled = false;
      const sink: ProductFindingSink = {
        provider: "plane",
        findDuplicate: async () => existing,
        createBug: async () => {
          createCalled = true;
          return existing;
        },
        updateBug: async () => existing,
        linkToRequirement: async () => {},
        assign: async () => {},
        addEvidence: async () => {},
      };
      const outcome = await syncProductFinding({ sink, input: input(), e2eDir: dir, onLog: () => {} });
      assert.equal(outcome.status, "updated");
      assert.equal(createCalled, false);
    });
  });

  it("falha na criação: grava BUG-SYNC-PENDENTE.json/.md e não afirma que o Bug foi criado", async () => {
    await withTmpDir(async (dir) => {
      const sink: ProductFindingSink = {
        provider: "plane",
        findDuplicate: async () => undefined,
        createBug: async () => {
          throw new Error("Authorization: Bearer sk-super-secret-token falhou 401");
        },
        updateBug: async () => {
          throw new Error("n/a");
        },
        linkToRequirement: async () => {},
        assign: async () => {},
        addEvidence: async () => {},
      };
      const outcome = await syncProductFinding({ sink, input: input(), e2eDir: dir, onLog: () => {} });
      assert.equal(outcome.status, "pending");
      const jsonPath = join(dir, "falhas", "BUG-SYNC-PENDENTE.json");
      const mdPath = join(dir, "falhas", "BUG-SYNC-PENDENTE.md");
      assert.ok(existsSync(jsonPath));
      assert.ok(existsSync(mdPath));
      const raw = readFileSync(jsonPath, "utf8");
      assert.doesNotMatch(raw, /sk-super-secret-token/);
      assert.doesNotMatch(raw, /Bearer \S+/);
      const md = readFileSync(mdPath, "utf8");
      assert.doesNotMatch(md, /\bBug criado\b/i);
      assert.match(md, /Nenhum item foi criado/i);
    });
  });
});

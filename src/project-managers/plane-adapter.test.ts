import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createPlaneAdapterForTests } from "./plane-adapter.ts";
import type { McpToolCaller } from "./mcp-client.ts";

/** Fake determinístico do MCP do Plane — sem rede, sem servidor real. */
function fakeCaller(handlers: Record<string, (args: Record<string, unknown>) => unknown>): McpToolCaller {
  return {
    async callTool(name, args) {
      const handler = handlers[name];
      if (!handler) throw new Error(`tool não mapeada no fake: ${name}`);
      return handler(args);
    },
  };
}

describe("PlaneAdapter", () => {
  it("lista work items e normaliza para RequirementContract", async () => {
    const caller = fakeCaller({
      workitem: (args) => {
        assert.equal(args.action, "list");
        return {
          items: [
            {
              id: "wi-1",
              identifier: "PROJ-142",
              project_id: "proj-1",
              name: "Consulta de documento",
              description: "## RN\n- RN_1: só autorizados\n\n### CA1\n**Dado** doc 2xx\n**Quando** consulto\n**Então** vejo tabela",
              type: { name: "User Story" },
              state: { name: "Backlog" },
              approved: true,
              updated_at: "2026-01-01T00:00:00Z",
            },
          ],
        };
      },
    });
    const adapter = createPlaneAdapterForTests(caller);
    const result = await adapter.listWorkItems({ projectId: "proj-1" });
    assert.equal(result.items.length, 1);
    const item = result.items[0]!;
    assert.equal(item.type, "user-story");
    assert.equal(item.key, "PROJ-142");
    assert.equal(item.businessRules[0]!.id, "RN_1");
    assert.equal(item.acceptanceCriteria[0]!.then, "vejo tabela");
  });

  it("mapeia tipos Bug e Mudança de Requisito corretamente", async () => {
    const caller = fakeCaller({
      workitem: () => ({
        items: [
          { id: "b1", identifier: "BUG-9", project_id: "proj-1", name: "Bug X", type: { name: "Bug" } },
          { id: "c1", identifier: "PROJ-999", project_id: "proj-1", name: "Mudança Y", type: { name: "Requirement Change" } },
        ],
      }),
    });
    const adapter = createPlaneAdapterForTests(caller);
    const result = await adapter.listWorkItems({ projectId: "proj-1" });
    assert.equal(result.items.find((i) => i.key === "BUG-9")!.type, "bug");
    assert.equal(result.items.find((i) => i.key === "PROJ-999")!.type, "requirement-change");
  });

  it("getWorkItem inclui relações vindas de workitem_relation", async () => {
    const caller = fakeCaller({
      workitem: () => ({ id: "wi-1", identifier: "PROJ-142", name: "US", type: { name: "User Story" } }),
      workitem_relation: () => ({ relations: [{ kind: "blocked_by", target_id: "wi-0", target_identifier: "PROJ-100" }] }),
    });
    const adapter = createPlaneAdapterForTests(caller);
    const item = await adapter.getWorkItem("proj-1", "wi-1");
    assert.ok(item);
    assert.equal(item!.relations.length, 1);
    assert.equal(item!.relations[0]!.kind, "blocked_by");
  });

  it("createBug envia descrição estruturada sem vazar segredos e retorna ExternalIssue", async () => {
    const caller = fakeCaller({
      workitem: (args) => {
        if (args.action === "create") {
          assert.equal(args.type_name, "Bug");
          const description = String(args.description);
          assert.doesNotMatch(description, /senha|password/i);
          return { id: "issue-1", identifier: "BUG-1", url: "https://plane/issue-1" };
        }
        throw new Error("unexpected action");
      },
    });
    const adapter = createPlaneAdapterForTests(caller);
    const issue = await adapter.createBug({
      provider: "plane",
      projectId: "proj-1",
      testTitle: "Consulta falha",
      expected: "tabela",
      observed: "so heading",
      environmentBaseUrl: "https://exemplo.com",
      steps: ["abrir"],
      evidence: [],
      runId: "run-1",
      occurredAt: new Date().toISOString(),
    });
    assert.equal(issue.key, "BUG-1");
    assert.equal(issue.url, "https://plane/issue-1");
  });

  it("resposta inválida vira McpError invalid_response, não quebra silenciosamente", async () => {
    const caller = fakeCaller({ workitem: () => ({ nonsense: true }) });
    const adapter = createPlaneAdapterForTests(caller);
    await assert.rejects(() => adapter.listWorkItems({ projectId: "proj-1" }), /invalid_response|resposta inválida/i);
  });
});

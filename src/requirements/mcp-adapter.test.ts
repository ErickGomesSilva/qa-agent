import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import { describe, it, after } from "node:test";
import { dedupeByRecency, filterByRequiredLabels, mcpCacheDir, previewMcpProject, resolveMcpRequirementSource } from "./mcp-adapter.ts";
import { registerProjectManagerAdapter, __resetRegistryForTests } from "../project-managers/registry.ts";
import type { ListWorkItemsParams, ListWorkItemsResult, ProjectManagerAdapter, ProjectManagerCapabilities } from "../project-managers/types.ts";
import { readOnlyCapabilities } from "../project-managers/types.ts";
import type { RequirementContract } from "./types.ts";

function us(overrides: Partial<RequirementContract>): RequirementContract {
  return {
    provider: "fake",
    projectId: "proj-1",
    externalId: overrides.externalId ?? "x",
    key: overrides.key ?? "PROJ-1",
    type: "user-story",
    title: overrides.title ?? "US_X",
    description: "",
    approved: true,
    assigneeIds: [],
    labels: overrides.labels ?? [],
    businessRules: [],
    acceptanceCriteria: [],
    relations: [],
    ...overrides,
  };
}

describe("filterByRequiredLabels", () => {
  it("sem requiredLabels não filtra", () => {
    const items = [us({ labels: ["QA / E2E"] })];
    assert.equal(filterByRequiredLabels(items, undefined).length, 1);
  });

  it("mantém só itens com a label exigida (case-insensitive)", () => {
    const items = [us({ externalId: "a", labels: ["Requisitos"] }), us({ externalId: "b", labels: ["QA / E2E"] })];
    const out = filterByRequiredLabels(items, ["requisitos"]);
    assert.equal(out.length, 1);
    assert.equal(out[0]!.externalId, "a");
  });
});

describe("dedupeByRecency", () => {
  it("mantém a versão com updatedAt mais recente entre US duplicadas", () => {
    const older = us({ externalId: "old", title: "[V1] US_LIV_001 — versão antiga", updatedAt: "2026-08-27T00:00:00Z" });
    const newer = us({ externalId: "new", title: "[QA] US_LIV_001 — versão nova", updatedAt: "2026-09-01T00:00:00Z" });
    const { kept, dropped } = dedupeByRecency([older, newer]);
    assert.equal(kept.length, 1);
    assert.equal(kept[0]!.externalId, "new");
    assert.equal(dropped.length, 1);
    assert.match(dropped[0]!.discardedTitle, /versão antiga/);
  });

  it("não deduplica tipos diferentes de US (épico/feature ficam por externalId)", () => {
    const epic1 = us({ externalId: "e1", type: "epic", title: "Épico: A" });
    const epic2 = us({ externalId: "e2", type: "epic", title: "Épico: B" });
    const { kept } = dedupeByRecency([epic1, epic2]);
    assert.equal(kept.length, 2);
  });
});

class FakeAdapter implements ProjectManagerAdapter {
  readonly provider = "fake";
  constructor(private readonly items: RequirementContract[]) {}
  async capabilities(): Promise<ProjectManagerCapabilities> {
    return readOnlyCapabilities({ createBug: true, updateBug: true, linkItems: true, assignItem: true, addComment: true });
  }
  async listWorkspaces() {
    return [];
  }
  async listProjects() {
    return [{ id: "proj-1", name: "Cernova" }];
  }
  async listCycles() {
    return [];
  }
  async listWorkItems(_params: ListWorkItemsParams): Promise<ListWorkItemsResult> {
    return { items: this.items };
  }
  async getWorkItem(_projectId: string, externalId: string) {
    return this.items.find((i) => i.externalId === externalId);
  }
  async findDuplicate() {
    return undefined;
  }
  async createBug(): Promise<never> {
    throw new Error("not used");
  }
  async updateBug(): Promise<never> {
    throw new Error("not used");
  }
  async linkToRequirement() {}
  async assign() {}
  async addComment() {}
  async addEvidence() {}
}

describe("previewMcpProject / resolveMcpRequirementSource (fixture MCP, sem rede)", () => {
  const epic = us({ externalId: "epic-1", type: "epic", title: "Épico: Testes E2E", labels: ["Requisitos"] });
  const feature = us({
    externalId: "feat-1",
    type: "feature",
    title: "Feature: LivroCaixa",
    parentId: "epic-1",
    labels: ["Requisitos"],
  });
  const usOld = us({
    externalId: "us-old",
    title: "[V1] US_LIV_001 — versão antiga",
    parentId: "feat-1",
    labels: ["Requisitos"],
    updatedAt: "2026-08-27T00:00:00Z",
  });
  const usNew = us({
    externalId: "us-new",
    title: "[QA] US_LIV_001 — versão nova",
    parentId: "feat-1",
    labels: ["Requisitos"],
    updatedAt: "2026-09-01T00:00:00Z",
  });
  const notRequisito = us({ externalId: "qa-exec", title: "[QA] Execução 2026-09-09", labels: ["QA / E2E"] });

  const cfg = { server: "fake-server", provider: "fake", projectId: "proj-1", requiredLabels: ["Requisitos"] };

  __resetRegistryForTests();
  registerProjectManagerAdapter("fake", () => new FakeAdapter([epic, feature, usOld, usNew, notRequisito]));

  it("previewMcpProject agrupa em Épicos só com itens com a label exigida e sem duplicata", async () => {
    const preview = await previewMcpProject(cfg);
    assert.equal(preview.totalFetched, 5);
    assert.equal(preview.totalConsidered, 3); // epic + feature + 1 US (deduplicada)
    assert.equal(preview.droppedCount, 1);
    assert.equal(preview.epics.length, 1);
    assert.equal(preview.epics[0]!.usCount, 1);
    assert.equal(preview.epics[0]!.featureCount, 1);
  });

  it("resolveMcpRequirementSource materializa só a US mais recente", async () => {
    const dir = mcpCacheDir(cfg);
    try {
      const result = await resolveMcpRequirementSource(cfg);
      assert.equal(result.totalConsidered, 3);
      assert.equal(result.dropped.length, 1);
      assert.ok(existsSync(`${dir}/SOURCE-MANIFEST.json`));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  after(() => __resetRegistryForTests());
});

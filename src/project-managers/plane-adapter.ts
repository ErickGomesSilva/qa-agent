import { z } from "zod";
import type { RequirementContract, RequirementItemType, NormalizedAcceptanceCriterion, NormalizedBusinessRule, RequirementRelation } from "../requirements/types.ts";
import { McpError, type EvidenceReference, type ExternalIssue, type ListWorkItemsParams, type ListWorkItemsResult, type ProductBugInput, type ProductBugUpdate, type ProjectManagerAdapter, type ProjectManagerCapabilities, type ProjectRef, type CycleRef, type WorkspaceRef } from "./types.ts";
import type { McpToolCaller } from "./mcp-client.ts";
import { registerProjectManagerAdapter } from "./registry.ts";
import { createMcpToolCaller } from "./mcp-client.ts";

const PROVIDER = "plane";

/** Estrutura mínima e determinística que o MCP do Plane deve devolver para um work item.
 *  Nunca interpretamos texto livre gerado por LLM aqui — apenas o schema estruturado da tool. */
const planeWorkItemSchema = z.object({
  id: z.string(),
  identifier: z.string().optional(),
  sequence_id: z.union([z.string(), z.number()]).optional(),
  project: z.string().optional(),
  project_id: z.string().optional(),
  cycle: z.string().optional(),
  cycle_id: z.string().optional(),
  workspace: z.string().optional(),
  workspace_id: z.string().optional(),
  name: z.string().optional(),
  title: z.string().optional(),
  description_stripped: z.string().optional(),
  description: z.string().optional(),
  state: z.object({ name: z.string().optional() }).partial().optional(),
  state_name: z.string().optional(),
  parent: z.string().optional(),
  type: z.object({ name: z.string().optional() }).partial().optional(),
  type_name: z.string().optional(),
  assignees: z.array(z.string()).optional(),
  labels: z.array(z.string()).optional(),
  updated_at: z.string().optional(),
  updatedAt: z.string().optional(),
  revision: z.union([z.string(), z.number()]).optional(),
  url: z.string().optional(),
  approved: z.boolean().optional(),
  is_approved: z.boolean().optional(),
});
type PlaneWorkItem = z.infer<typeof planeWorkItemSchema>;

const planeListSchema = z.object({
  items: z.array(planeWorkItemSchema),
  next_cursor: z.string().optional(),
  nextCursor: z.string().optional(),
});

const planeRelationSchema = z.object({
  kind: z.string(),
  target_id: z.string(),
  target_identifier: z.string().optional(),
});
const planeRelationsSchema = z.object({ relations: z.array(planeRelationSchema).default([]) });

const planeIssueRefSchema = z.object({
  id: z.string(),
  identifier: z.string().optional(),
  key: z.string().optional(),
  url: z.string().optional(),
  state_name: z.string().optional(),
  status: z.string().optional(),
});

const planeRefListSchema = z.object({
  items: z.array(z.object({ id: z.string(), name: z.string() })).default([]),
});

const planeLabelListSchema = z.object({
  results: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
  items: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
});

function unwrapToolResult(raw: unknown): unknown {
  // MCP tool results normalmente vêm como { content: [{ type: "text"|"json", text/json }] } ou já o objeto puro.
  if (isRecord(raw) && Array.isArray((raw as { content?: unknown[] }).content)) {
    const content = (raw as { content: unknown[] }).content;
    const jsonBlock = content.find((c) => isRecord(c) && "json" in c) as { json?: unknown } | undefined;
    if (jsonBlock?.json !== undefined) return jsonBlock.json;
    const textBlock = content.find((c) => isRecord(c) && typeof (c as { text?: unknown }).text === "string") as
      | { text: string }
      | undefined;
    if (textBlock) {
      try {
        return JSON.parse(textBlock.text);
      } catch {
        throw new McpError("invalid_response", "Resposta MCP não é JSON estruturado válido", PROVIDER);
      }
    }
  }
  return raw;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function mapItemType(raw: string | undefined, title: string): RequirementItemType {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "epic") return "epic";
  if (v === "feature") return "feature";
  if (v === "bug") return "bug";
  if (/mudan[cç]a|requirement.change|change.request/.test(v)) return "requirement-change";
  if (v) return "user-story";
  // Sem tipo nativo do Plane (workitem_type desabilitado no workspace): cai para convenção de
  // título — igual ao que já usamos para US_/CA/RN em requisitos Markdown locais.
  return mapItemTypeFromTitle(title);
}

/** Convenção de título quando o Plane não tem Work Item Types habilitado (type/type_id nulos). */
export function mapItemTypeFromTitle(title: string): RequirementItemType {
  if (/[eé]pico\s*[:\-]/i.test(title) || /^\[?[^\]]*\]?\s*[EÉ]pico/i.test(title)) return "epic";
  if (/feature\s*[:\-]/i.test(title)) return "feature";
  if (/\bbug\b/i.test(title)) return "bug";
  if (/mudan[cç]a de requisito/i.test(title)) return "requirement-change";
  if (/\bUS_[A-Z0-9_]+\b/.test(title)) return "user-story";
  return "user-story";
}

/** Extrai RN/CA de blocos estruturados da descrição (convenção `## RN` / `### CA<n>`),
 *  o mesmo tipo de parsing determinístico já usado em req-sync.ts para Markdown local. */
function extractStructuredSections(description: string): {
  rules: NormalizedBusinessRule[];
  criteria: NormalizedAcceptanceCriterion[];
} {
  const rules: NormalizedBusinessRule[] = [];
  const criteria: NormalizedAcceptanceCriterion[] = [];

  const rnBlockMatch = description.match(/##\s*RN[\s\S]*?(?=\n##\s|\n###\s|$)/i);
  if (rnBlockMatch) {
    const lines = rnBlockMatch[0].split("\n").slice(1);
    for (const line of lines) {
      const m = line.match(/^[-*]\s*(RN[_-]?[A-Z0-9]+)\s*[:\-]?\s*(.+)$/i);
      if (m) rules.push({ id: m[1]!.toUpperCase(), text: m[2]!.trim() });
    }
  }

  const caBlocks = description.split(/\n(?=###\s*CA\d+)/i);
  for (const block of caBlocks) {
    const idMatch = block.match(/^###\s*(CA\d+)/i);
    if (!idMatch) continue;
    const id = idMatch[1]!.toUpperCase();
    const given = block.match(/\*\*Dado\*\*[:\s]*([\s\S]*?)(?=\n\*\*|\n###|$)/i)?.[1]?.trim();
    const when = block.match(/\*\*Quando\*\*[:\s]*([\s\S]*?)(?=\n\*\*|\n###|$)/i)?.[1]?.trim();
    const then = block.match(/\*\*Ent[aã]o\*\*[:\s]*([\s\S]*?)(?=\n\*\*|\n###|$)/i)?.[1]?.trim() ?? "";
    criteria.push({ id, given, when, then });
  }

  return { rules, criteria };
}

function mapWorkItemToContract(
  item: PlaneWorkItem,
  projectId: string,
  workspaceId?: string,
  cycleId?: string,
  labelNamesById?: Map<string, string>,
): RequirementContract {
  const description = item.description ?? item.description_stripped ?? "";
  const { rules, criteria } = extractStructuredSections(description);
  const title = item.name ?? item.title ?? "(sem título)";
  const labels = (item.labels ?? []).map((id) => labelNamesById?.get(id) ?? id);
  return {
    provider: PROVIDER,
    workspaceId: item.workspace_id ?? item.workspace ?? workspaceId,
    projectId: item.project_id ?? item.project ?? projectId,
    cycleId: item.cycle_id ?? item.cycle ?? cycleId,
    externalId: item.id,
    key: item.identifier ?? (item.sequence_id !== undefined ? String(item.sequence_id) : item.id),
    type: mapItemType(item.type?.name ?? item.type_name, title),
    title,
    description,
    status: item.state?.name ?? item.state_name,
    approved: Boolean(item.approved ?? item.is_approved ?? false),
    parentId: item.parent,
    assigneeIds: item.assignees ?? [],
    labels,
    businessRules: rules,
    acceptanceCriteria: criteria,
    relations: [],
    updatedAt: item.updated_at ?? item.updatedAt,
    revision: item.revision !== undefined ? String(item.revision) : undefined,
    sourceUrl: item.url,
  };
}

function mapRelationKind(raw: string): RequirementRelation["kind"] {
  const v = raw.trim().toLowerCase();
  const known = [
    "blocks",
    "blocked_by",
    "relates_to",
    "duplicates",
    "parent_of",
    "child_of",
    "supersedes",
    "superseded_by",
    "fixes",
    "fixed_by",
  ] as const;
  return (known as readonly string[]).includes(v) ? (v as RequirementRelation["kind"]) : "relates_to";
}

class PlaneAdapter implements ProjectManagerAdapter {
  readonly provider = PROVIDER;
  private labelCache = new Map<string, Map<string, string>>();
  constructor(private readonly caller: McpToolCaller) {}

  /** Resolve id->nome das labels do projeto (cacheado por projectId) — usado para filtrar por nome. */
  private async labelNamesFor(projectId: string): Promise<Map<string, string>> {
    const cached = this.labelCache.get(projectId);
    if (cached) return cached;
    try {
      const raw = unwrapToolResult(await this.caller.callTool("label", { action: "list", project_id: projectId }));
      const parsed = planeLabelListSchema.safeParse(raw);
      const map = new Map<string, string>();
      const list = parsed.success ? (parsed.data.results ?? parsed.data.items ?? []) : [];
      for (const l of list) map.set(l.id, l.name);
      this.labelCache.set(projectId, map);
      return map;
    } catch {
      const empty = new Map<string, string>();
      this.labelCache.set(projectId, empty);
      return empty;
    }
  }

  async capabilities(): Promise<ProjectManagerCapabilities> {
    // Plane via MCP do usuário: leitura completa; escrita de work items existe (workitem create/update),
    // mas fica condicionada a permissão do token — assumimos leitura+escrita disponíveis por padrão
    // e deixamos o caller degradar para readOnly explicitamente via opts se necessário.
    return {
      readProjects: true,
      readCycles: true,
      readWorkItems: true,
      readRelations: true,
      createBug: true,
      updateBug: true,
      linkItems: true,
      assignItem: true,
      addComment: true,
    };
  }

  async listWorkspaces(): Promise<WorkspaceRef[]> {
    const raw = unwrapToolResult(await this.caller.callTool("workspace", { action: "list" }));
    const parsed = planeRefListSchema.safeParse(raw);
    if (!parsed.success) throw new McpError("invalid_response", "workspace.list: resposta inválida", PROVIDER);
    return parsed.data.items.map((i) => ({ id: i.id, name: i.name }));
  }

  async listProjects(workspaceId?: string): Promise<ProjectRef[]> {
    const raw = unwrapToolResult(await this.caller.callTool("project", { action: "list", workspace_id: workspaceId }));
    const parsed = planeRefListSchema.safeParse(raw);
    if (!parsed.success) throw new McpError("invalid_response", "project.list: resposta inválida", PROVIDER);
    return parsed.data.items.map((i) => ({ id: i.id, name: i.name, workspaceId }));
  }

  async listCycles(projectId: string): Promise<CycleRef[]> {
    const raw = unwrapToolResult(await this.caller.callTool("cycle", { action: "list", project_id: projectId }));
    const parsed = planeRefListSchema.safeParse(raw);
    if (!parsed.success) throw new McpError("invalid_response", "cycle.list: resposta inválida", PROVIDER);
    return parsed.data.items.map((i) => ({ id: i.id, name: i.name, projectId }));
  }

  async listWorkItems(params: ListWorkItemsParams): Promise<ListWorkItemsResult> {
    const raw = unwrapToolResult(
      await this.caller.callTool("workitem", {
        action: "list",
        project_id: params.projectId,
        cycle_id: params.cycleId,
        search: params.search,
        cursor: params.cursor,
        limit: params.limit,
      }),
    );
    const parsed = planeListSchema.safeParse(raw);
    if (!parsed.success) throw new McpError("invalid_response", "workitem.list: resposta inválida", PROVIDER);
    const labelNames = await this.labelNamesFor(params.projectId);
    const items = parsed.data.items.map((i) =>
      mapWorkItemToContract(i, params.projectId, params.workspaceId, params.cycleId, labelNames),
    );
    const filtered = params.types?.length ? items.filter((i) => params.types!.includes(i.type)) : items;
    return { items: filtered, nextCursor: parsed.data.next_cursor ?? parsed.data.nextCursor };
  }

  async getWorkItem(projectId: string, externalId: string): Promise<RequirementContract | undefined> {
    const raw = unwrapToolResult(await this.caller.callTool("workitem", { action: "retrieve", id: externalId }));
    const parsed = planeWorkItemSchema.safeParse(raw);
    if (!parsed.success) return undefined;
    const labelNames = await this.labelNamesFor(projectId);
    const contract = mapWorkItemToContract(parsed.data, projectId, undefined, undefined, labelNames);

    try {
      const relRaw = unwrapToolResult(await this.caller.callTool("workitem_relation", { action: "list", id: externalId }));
      const relParsed = planeRelationsSchema.safeParse(relRaw);
      if (relParsed.success) {
        contract.relations = relParsed.data.relations.map((r) => ({
          kind: mapRelationKind(r.kind),
          targetExternalId: r.target_id,
          targetKey: r.target_identifier,
        }));
      }
    } catch {
      // relações são best-effort; ausência não deve quebrar o contrato base
    }
    return contract;
  }

  async findDuplicate(signature: string, projectId: string): Promise<ExternalIssue | undefined> {
    const raw = unwrapToolResult(
      await this.caller.callTool("workitem", {
        action: "list",
        project_id: projectId,
        search: signature,
      }),
    );
    const parsed = planeListSchema.safeParse(raw);
    if (!parsed.success || !parsed.data.items.length) return undefined;
    const first = parsed.data.items[0]!;
    return { id: first.id, key: first.identifier, status: first.state?.name ?? first.state_name };
  }

  async createBug(input: ProductBugInput): Promise<ExternalIssue> {
    const description = buildBugDescription(input);
    const raw = unwrapToolResult(
      await this.caller.callTool("workitem", {
        action: "create",
        project_id: input.projectId,
        type_name: "Bug",
        name: input.testTitle,
        description,
        labels: input.labels ?? [],
      }),
    );
    const parsed = planeIssueRefSchema.safeParse(raw);
    if (!parsed.success) throw new McpError("invalid_response", "workitem.create: resposta inválida", PROVIDER);
    return { id: parsed.data.id, key: parsed.data.identifier ?? parsed.data.key, url: parsed.data.url, status: parsed.data.state_name ?? parsed.data.status };
  }

  async updateBug(issueId: string, input: ProductBugUpdate): Promise<ExternalIssue> {
    const raw = unwrapToolResult(
      await this.caller.callTool("workitem", {
        action: "update",
        id: issueId,
        status: input.status,
      }),
    );
    const parsed = planeIssueRefSchema.safeParse(raw);
    if (!parsed.success) throw new McpError("invalid_response", "workitem.update: resposta inválida", PROVIDER);
    if (input.comment) await this.addComment(issueId, input.comment);
    return { id: parsed.data.id, key: parsed.data.identifier ?? parsed.data.key, url: parsed.data.url, status: parsed.data.state_name ?? parsed.data.status };
  }

  async linkToRequirement(issueId: string, requirementExternalId: string): Promise<void> {
    await this.caller.callTool("workitem_relation", {
      action: "create",
      id: issueId,
      target_id: requirementExternalId,
      kind: "fixes",
    });
  }

  async assign(issueId: string, assigneeExternalId: string): Promise<void> {
    await this.caller.callTool("workitem", { action: "update", id: issueId, assignee_ids: [assigneeExternalId] });
  }

  async addComment(issueId: string, text: string): Promise<void> {
    await this.caller.callTool("workitem_comment", { action: "create", id: issueId, text: text.slice(0, 4000) });
  }

  async addEvidence(issueId: string, evidence: EvidenceReference[]): Promise<void> {
    for (const e of evidence.slice(0, 10)) {
      await this.caller.callTool("workitem_attachment", { action: "create", id: issueId, path: e.path, label: e.label });
    }
  }
}

function buildBugDescription(input: ProductBugInput): string {
  const lines = [
    `**Provider/Projeto:** ${input.provider} / ${input.projectId}`,
    input.requirementKey ? `**US de origem:** ${input.requirementKey}` : "",
    input.featureTitle ? `**Feature:** ${input.featureTitle}` : "",
    input.epicTitle ? `**Épico:** ${input.epicTitle}` : "",
    input.ruleOrCriterionId ? `**RN/CA afetado:** ${input.ruleOrCriterionId}` : "",
    "",
    `**Resultado esperado:** ${input.expected}`,
    `**Resultado observado:** ${input.observed}`,
    "",
    `**Ambiente:** ${input.environmentBaseUrl}`,
    input.buildOrVersion ? `**Versão/build:** ${input.buildOrVersion}` : "",
    input.profileLabel ? `**Perfil:** ${input.profileLabel}` : "",
    input.preconditions ? `**Pré-condições:** ${input.preconditions}` : "",
    "",
    "**Passos:**",
    ...input.steps.map((s, i) => `${i + 1}. ${s}`),
    "",
    input.severity ? `**Severidade sugerida:** ${input.severity}` : "",
    `**Rodada QA-Agent:** ${input.runId}`,
    `**Data:** ${input.occurredAt}`,
    input.reportRef ? `**Relatório:** ${input.reportRef}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

registerProjectManagerAdapter(PROVIDER, ({ server }) => new PlaneAdapter(createMcpToolCaller(server)));

/** Exportado para testes — permite injetar um McpToolCaller fake sem tocar no registry global. */
export function createPlaneAdapterForTests(caller: McpToolCaller): ProjectManagerAdapter {
  return new PlaneAdapter(caller);
}

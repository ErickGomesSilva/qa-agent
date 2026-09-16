import type { RequirementContract } from "../requirements/types.ts";

/** Capacidades que um gestor de projetos conectado por MCP pode (ou não) suportar. */
export type ProjectManagerCapabilities = {
  readProjects: boolean;
  readCycles: boolean;
  readWorkItems: boolean;
  readRelations: boolean;
  createBug: boolean;
  updateBug: boolean;
  linkItems: boolean;
  assignItem: boolean;
  addComment: boolean;
};

export function readOnlyCapabilities(overrides?: Partial<ProjectManagerCapabilities>): ProjectManagerCapabilities {
  return {
    readProjects: true,
    readCycles: true,
    readWorkItems: true,
    readRelations: true,
    createBug: false,
    updateBug: false,
    linkItems: false,
    assignItem: false,
    addComment: false,
    ...overrides,
  };
}

export type ProjectRef = { id: string; name: string; workspaceId?: string };
export type CycleRef = { id: string; name: string; projectId: string };
export type WorkspaceRef = { id: string; name: string };

export type ExternalIssue = {
  id: string;
  key?: string;
  url?: string;
  status?: string;
};

export type EvidenceReference = {
  kind: "screenshot" | "trace" | "log" | "video" | "json";
  path: string;
  label?: string;
};

/** Payload para criação de Bug — nunca contém segredos (URLs, tokens, senhas). */
export type ProductBugInput = {
  provider: string;
  projectId: string;
  workspaceId?: string;
  requirementExternalId?: string;
  requirementKey?: string;
  featureTitle?: string;
  epicTitle?: string;
  ruleOrCriterionId?: string;
  testTitle: string;
  expected: string;
  observed: string;
  environmentBaseUrl: string;
  buildOrVersion?: string;
  profileLabel?: string;
  preconditions?: string;
  steps: string[];
  evidence: EvidenceReference[];
  severity?: "low" | "medium" | "high" | "critical";
  runId: string;
  occurredAt: string;
  reportRef?: string;
  assigneeExternalId?: string;
  labels?: string[];
};

export type ProductBugUpdate = {
  comment?: string;
  status?: string;
  severity?: ProductBugInput["severity"];
};

export type McpErrorCode =
  | "auth"
  | "provider_not_found"
  | "tool_missing"
  | "capability_unsupported"
  | "timeout"
  | "network"
  | "invalid_response";

export class McpError extends Error {
  readonly code: McpErrorCode;
  readonly provider?: string;
  constructor(code: McpErrorCode, message: string, provider?: string) {
    super(message);
    this.name = "McpError";
    this.code = code;
    this.provider = provider;
  }
}

export type ListWorkItemsParams = {
  workspaceId?: string;
  projectId: string;
  cycleId?: string;
  types?: RequirementContract["type"][];
  search?: string;
  cursor?: string;
  limit?: number;
};

export type ListWorkItemsResult = {
  items: RequirementContract[];
  nextCursor?: string;
};

/** Contrato de adapter — implementado por cada gestor de projetos (Plane, Jira, Linear, ADO...). */
export interface ProjectManagerAdapter {
  readonly provider: string;
  capabilities(): Promise<ProjectManagerCapabilities>;
  listWorkspaces(): Promise<WorkspaceRef[]>;
  listProjects(workspaceId?: string): Promise<ProjectRef[]>;
  listCycles(projectId: string): Promise<CycleRef[]>;
  listWorkItems(params: ListWorkItemsParams): Promise<ListWorkItemsResult>;
  getWorkItem(projectId: string, externalId: string): Promise<RequirementContract | undefined>;
  findDuplicate(signature: string, projectId: string): Promise<ExternalIssue | undefined>;
  createBug(input: ProductBugInput): Promise<ExternalIssue>;
  updateBug(issueId: string, input: ProductBugUpdate): Promise<ExternalIssue>;
  linkToRequirement(issueId: string, requirementExternalId: string): Promise<void>;
  assign(issueId: string, assigneeExternalId: string): Promise<void>;
  addComment(issueId: string, text: string): Promise<void>;
  addEvidence(issueId: string, evidence: EvidenceReference[]): Promise<void>;
}

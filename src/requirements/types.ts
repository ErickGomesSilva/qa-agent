/** Contrato normalizado de requisitos vindos de um gestor de projetos (MCP) ou equivalentes. */

export type RequirementItemType =
  | "epic"
  | "feature"
  | "user-story"
  | "bug"
  | "requirement-change";

export type NormalizedBusinessRule = {
  id: string;
  text: string;
  /** ID (dentro da mesma US) de uma RN que esta substitui — só relevante em requirement-change aprovada. */
  supersedes?: string;
};

export type NormalizedAcceptanceCriterion = {
  id: string;
  given?: string;
  when?: string;
  then: string;
  /** ID de um CA que este substitui — só relevante em requirement-change aprovada. */
  supersedes?: string;
};

export type RequirementRelationKind =
  | "blocks"
  | "blocked_by"
  | "relates_to"
  | "duplicates"
  | "parent_of"
  | "child_of"
  | "supersedes"
  | "superseded_by"
  | "fixes"
  | "fixed_by";

export type RequirementRelation = {
  kind: RequirementRelationKind;
  targetExternalId: string;
  targetKey?: string;
};

export type RequirementContract = {
  provider: string;
  workspaceId?: string;
  projectId: string;
  cycleId?: string;
  externalId: string;
  key: string;
  type: RequirementItemType;
  title: string;
  description: string;
  status?: string;
  approved: boolean;
  parentId?: string;
  /** Para requirement-change: US que ela altera. */
  originRequirementId?: string;
  assigneeIds: string[];
  labels: string[];
  businessRules: NormalizedBusinessRule[];
  acceptanceCriteria: NormalizedAcceptanceCriterion[];
  relations: RequirementRelation[];
  updatedAt?: string;
  revision?: string;
  sourceUrl?: string;
};

export type RequirementSourceKind = "local" | "git" | "mcp";

/** Configuração de uma fonte MCP de requisitos — todos os campos opcionais além de server/provider. */
export type McpRequirementSourceConfig = {
  server: string;
  provider: string;
  workspaceId?: string;
  projectId: string;
  cycleId?: string;
  search?: string;
  defaultAssigneeExternalId?: string;
  defaultLabels?: string[];
  /** Relação usada para vincular um Bug à US de origem. */
  bugLinkRelation?: RequirementRelationKind;
  /** Relação usada para identificar que uma requirement-change substitui RN/CA. */
  changeSupersedesRelation?: RequirementRelationKind;
  /**
   * Só considera work items que tenham QUALQUER uma destas labels (por nome, ex.: "Requisitos").
   * Ausente = todos os work items do projeto/ciclo entram (sem filtro por label).
   */
  requiredLabels?: string[];
};

export type RequirementRunScope =
  | { mode: "all" }
  | { mode: "us"; usId: string }
  | { mode: "scenario"; usId: string }
  | { mode: "bug"; bugId: string };

export type SourceManifestEntry = {
  provider: string;
  workspaceId?: string;
  projectId: string;
  cycleId?: string;
  externalId: string;
  externalKey: string;
  revision?: string;
  sourceUrl?: string;
  relations: RequirementRelation[];
  contentHash: string;
  syncedAt: string;
};

export type SourceManifest = {
  provider: string;
  workspaceId?: string;
  projectId: string;
  cycleId?: string;
  syncedAt: string;
  scope: RequirementRunScope;
  entries: SourceManifestEntry[];
};

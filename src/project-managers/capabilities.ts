import { McpError, type ProjectManagerCapabilities } from "./types.ts";

const CAP_LABEL: Record<keyof ProjectManagerCapabilities, string> = {
  readProjects: "leitura de projetos",
  readCycles: "leitura de ciclos/releases",
  readWorkItems: "leitura de work items",
  readRelations: "leitura de relações",
  createBug: "criação de Bug",
  updateBug: "atualização de Bug",
  linkItems: "vínculo entre itens",
  assignItem: "atribuição de responsável",
  addComment: "comentário",
};

export function requireCapability(
  caps: ProjectManagerCapabilities,
  key: keyof ProjectManagerCapabilities,
  provider: string,
): void {
  if (!caps[key]) {
    throw new McpError(
      "capability_unsupported",
      `Provider '${provider}' não suporta: ${CAP_LABEL[key]}`,
      provider,
    );
  }
}

export function canWriteBugs(caps: ProjectManagerCapabilities): boolean {
  return caps.createBug && caps.updateBug;
}

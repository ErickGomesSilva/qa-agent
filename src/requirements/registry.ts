import type { RequirementSourceKind, SourceManifest } from "./types.ts";

export type ResolvedRequirementSource = {
  /** Pasta local (já materializada) com os .md de requisitos, pronta para syncRequisitos(). */
  dir: string;
  manifest?: SourceManifest;
};

export type RequirementSourceInput = {
  /** Para local/git: caminho ou URL, igual ao comportamento atual (requisitosPath). */
  raw?: string;
  update?: boolean;
};

export interface RequirementSourceAdapter {
  readonly kind: RequirementSourceKind;
  resolve(input: RequirementSourceInput): Promise<ResolvedRequirementSource>;
}

const adapters = new Map<RequirementSourceKind, RequirementSourceAdapter>();

export function registerRequirementSourceAdapter(adapter: RequirementSourceAdapter): void {
  adapters.set(adapter.kind, adapter);
}

export function getRequirementSourceAdapter(kind: RequirementSourceKind): RequirementSourceAdapter | undefined {
  return adapters.get(kind);
}

export function __resetRequirementRegistryForTests(): void {
  adapters.clear();
}

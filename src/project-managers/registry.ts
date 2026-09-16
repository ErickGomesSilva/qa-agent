import { McpError, type ProjectManagerAdapter } from "./types.ts";

export type AdapterFactory = (opts: { server: string }) => ProjectManagerAdapter;

const factories = new Map<string, AdapterFactory>();

/** Registra um adapter de gestor de projetos (ex.: "plane", "jira", "linear", "azure-devops"). */
export function registerProjectManagerAdapter(provider: string, factory: AdapterFactory): void {
  factories.set(provider.toLowerCase(), factory);
}

export function listRegisteredProviders(): string[] {
  return [...factories.keys()];
}

export function createProjectManagerAdapter(provider: string, opts: { server: string }): ProjectManagerAdapter {
  const factory = factories.get(provider.toLowerCase());
  if (!factory) {
    throw new McpError(
      "provider_not_found",
      `Provider '${provider}' não está registrado. Disponíveis: ${listRegisteredProviders().join(", ") || "(nenhum)"}`,
      provider,
    );
  }
  return factory(opts);
}

/** Só para testes: limpa o registro. */
export function __resetRegistryForTests(): void {
  factories.clear();
}

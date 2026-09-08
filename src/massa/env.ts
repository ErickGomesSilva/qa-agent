import type { MassaDataEntry } from "./data-types.ts";

function slugPart(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/** Prefixo de env para um CA: E2E_MASSA_US_ACL_001_CA02 */
export function massaEnvPrefix(us: string, ca: string): string {
  return `E2E_MASSA_${slugPart(us)}_${slugPart(ca)}`;
}

/** Achata dados de uma entrada para variáveis E2E_MASSA_* (consumidas por setups e specs). */
export function massaEnvForEntry(entry: MassaDataEntry): Record<string, string> {
  const env: Record<string, string> = {};
  const prefix = massaEnvPrefix(entry.us, entry.ca);
  env[`${prefix}_US`] = entry.us;
  env[`${prefix}_CA`] = entry.ca;
  env[`${prefix}_STATUS`] = entry.status;
  if (entry.perfil) env[`${prefix}_PERFIL`] = entry.perfil;
  if (entry.accessLabel) env[`${prefix}_ACCESS_LABEL`] = entry.accessLabel;

  for (const [key, value] of Object.entries(entry.dados)) {
    env[`${prefix}_${slugPart(key)}`] = String(value);
  }
  for (const [key, value] of Object.entries(entry.refs ?? {})) {
    env[`${prefix}_REF_${slugPart(key)}`] = value;
  }
  return env;
}

/** Env agregado de todas as entradas prontas/aplicadas + caminho do arquivo. */
export function massaPlaywrightEnv(
  entries: MassaDataEntry[],
  massaFilePath: string,
): Record<string, string> {
  const env: Record<string, string> = {
    E2E_MASSA_FILE: massaFilePath.replace(/\\/g, "/"),
  };

  const keys: string[] = [];
  for (const entry of entries) {
    if (entry.status !== "pronto" && entry.status !== "aplicado") continue;
    keys.push(`${entry.us}:${entry.ca}`);
    Object.assign(env, massaEnvForEntry(entry));
  }
  env.E2E_MASSA_KEYS = keys.join(",");
  return env;
}

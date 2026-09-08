export type MassaEntryStatus = "pendente" | "pronto" | "aplicado" | "impossivel";

export type MassaDataEntry = {
  us: string;
  ca: string;
  perfil?: string;
  /** Rótulo do acesso em credenciais (ex.: validador, revisor). */
  accessLabel?: string;
  precisa?: string[];
  status: MassaEntryStatus;
  /** Valores de negócio consumidos pelos specs/setups (periodo, documento, etc.). */
  dados: Record<string, string | number | boolean>;
  /** Caminhos ou IDs externos (ex.: arquivo XML de fixture). */
  refs?: Record<string, string>;
  setup?: string;
  notas?: string;
};

export type MassaData = {
  version: 1;
  updatedAt: string;
  source?: string;
  entries: MassaDataEntry[];
};

export function massaEntryKey(us: string, ca: string): string {
  return `${us}:${ca}`;
}

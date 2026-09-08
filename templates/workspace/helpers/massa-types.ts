export type MassaEntryStatus = "pendente" | "pronto" | "aplicado" | "impossivel";

export type MassaDataEntry = {
  us: string;
  ca: string;
  perfil?: string;
  accessLabel?: string;
  precisa?: string[];
  status: MassaEntryStatus;
  dados: Record<string, string | number | boolean>;
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

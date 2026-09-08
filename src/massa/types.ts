export type MassaManifestEntry = {
  us: string;
  ca: string;
  precisa: string[];
  setup?: string;
  perfil?: string;
  motivo: string;
  specPath?: string;
  status: "pendente" | "desbloqueado" | "impossivel";
};

export type MassaManifest = {
  version: 1;
  updatedAt: string;
  entries: MassaManifestEntry[];
};

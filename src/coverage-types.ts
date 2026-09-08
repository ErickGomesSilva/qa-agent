/** Nível de cobertura de um CA (cobertura.json v2). */
export type CoverageNivel = "real" | "rascunho" | "skip-massa" | "sem-ui" | "api";

export type CoverageCase = {
  us: string;
  ca: string;
  arquivo: string;
  titulo: string;
  /** Derivado: nivel === "real" || nivel === "api". Mantido por compatibilidade v1. */
  coberto: boolean;
  motivo: string;
  /** v2 */
  nivel?: CoverageNivel;
  massaNecessaria?: string;
  assertEntao?: boolean;
  specPath?: string;
  reqHash?: string;
  apiCandidate?: boolean;
};

export type CoverageFile = {
  version: 1 | 2;
  casos: CoverageCase[];
};

export type SpecAuditFinding = {
  us: string;
  ca: string;
  specPath: string;
  nivel: CoverageNivel;
  motivo: string;
  massaNecessaria?: string;
  assertEntao: boolean;
  /** Spec tinha @executavel mas foi rebaixado para @rascunho. */
  downgraded?: boolean;
};

export type CoverageAuditResult = {
  findings: SpecAuditFinding[];
  downgraded: number;
  warnings: string[];
  coberturaPath: string;
  auditPath: string;
};

export type CoverageSummary = {
  total: number;
  real: number;
  rascunho: number;
  skipMassa: number;
  semUi: number;
  api: number;
  downgradedThisRun: number;
  /** CAs marcados coberto:true no v1 que o auditor reclassificou. */
  falsosPositivos: number;
};

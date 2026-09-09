import type { CoverageSummary } from "./coverage-types.ts";
import type { K6Outcome } from "./k6-types.ts";

export type TriageClass =
  | "TESTE"
  | "PRODUTO"
  | "MASSA"
  | "AMBIENTE"
  | "INCONCLUSIVO";

export type RunMode =
  | "full"
  | "audit-only"
  | "deepen-stubs"
  | "unblock-massa"
  | "generate-massa"
  | "user-tour"
  | "load-only";

export type RunStatus =
  | "queued"
  | "generating_scripts"
  | "exploring_logic"
  | "touring"
  | "tour_complete"
  | "auditing_coverage"
  | "audit_complete"
  | "deepening_stubs"
  | "deepen_complete"
  | "unblocking_massa"
  | "generating_massa"
  | "massa_complete"
  | "unblock_complete"
  | "running_playwright"
  | "running_k6"
  | "paused_triage"
  | "running_agent"
  | "resuming"
  | "passed"
  | "load_complete"
  | "load_failed"
  | "paused_produto"
  | "paused_massa"
  | "paused_ambiente"
  | "paused_inconclusivo"
  | "complete_with_findings"
  | "error"
  | "cancelled";

export type StuckCase = {
  us?: string;
  ca?: string;
  title: string;
  grepHint?: string;
  attempts: number;
  reason: string;
};

export type ProductFinding = {
  us?: string;
  ca?: string;
  title: string;
  grepHint?: string;
  resumo: string;
  classe: TriageClass;
};

export type PlaywrightFailure = {
  title: string;
  file?: string;
  error: string;
  grepHint?: string;
};

export type PlaywrightOutcome = {
  passed: boolean;
  exitCode: number;
  stats: {
    expected: number;
    unexpected: number;
    skipped: number;
    flaky?: number;
  };
  failures: PlaywrightFailure[];
  rawJsonPath: string;
  logPath: string;
};

export type TriageResult = {
  classe: TriageClass;
  us?: string;
  ca?: string;
  resumo: string;
  corrigiuTeste: boolean;
  pendentePath?: string;
  discordEnviado: boolean;
  agentId?: string;
  runId?: string;
};

export type AuthKind = "email" | "cpf";

export type AppCredentials = {
  authKind: AuthKind;
  login: string;
  senha: string;
  baseUrl?: string;
};

/** Um login/senha na aba F5 (acesso 1 = principal / globalSetup). */
export type AccessCredential = {
  label?: string;
  authKind: AuthKind;
  login: string;
  senha: string;
};

export type ResolvedCredentials = {
  baseUrl: string;
  accessCount: number;
  accesses: AccessCredential[];
};

export type OrchestratorRun = {
  id: string;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  requisitosPath: string;
  baseUrl: string;
  projectPath: string;
  e2eDir: string;
  grep: string;
  regenerate: boolean;
  autoResumeOnTeste: boolean;
  k6Enabled: boolean;
  mode: RunMode;
  playwright?: PlaywrightOutcome;
  k6?: K6Outcome;
  triage?: TriageResult;
  coverage?: CoverageSummary;
  coverageMdPath?: string;
  stuckCases?: StuckCase[];
  productFindings?: ProductFinding[];
  matrixMdPath?: string;
  continueOnProduto?: boolean;
  retestQuarantine?: boolean;
  rounds: number;
  error?: string;
  log: string[];
};

export type CreateRunBody = {
  requisitosPath?: string;
  baseUrl?: string;
  authKind?: AuthKind;
  login?: string;
  email?: string;
  senha?: string;
  credentialsMd?: string;
  grep?: string;
  regenerate?: boolean;
  autoResumeOnTeste?: boolean;
  k6Enabled?: boolean;
  continueOnProduto?: boolean;
  retestQuarantine?: boolean;
  mode?: RunMode;
};

export type StartRunOptions = {
  wait?: boolean;
  onLog?: (line: string) => void;
};

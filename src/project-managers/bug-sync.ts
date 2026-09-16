import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildBugSignature } from "./dedupe.ts";
import { sanitizeErrorMessage } from "./mcp-client.ts";
import {
  McpError,
  type EvidenceReference,
  type ExternalIssue,
  type ProductBugInput,
  type ProductBugUpdate,
  type ProjectManagerAdapter,
  type ProjectManagerCapabilities,
} from "./types.ts";
import { canWriteBugs } from "./capabilities.ts";

/** Camada de escrita usada pelo orquestrador — desacoplada do adapter concreto. */
export type ProductFindingSink = {
  provider: string;
  findDuplicate(input: ProductBugInput): Promise<ExternalIssue | undefined>;
  createBug(input: ProductBugInput): Promise<ExternalIssue>;
  updateBug(issueId: string, input: ProductBugUpdate): Promise<ExternalIssue>;
  linkToRequirement(issueId: string, requirementId: string): Promise<void>;
  assign(issueId: string, assigneeId: string): Promise<void>;
  addEvidence(issueId: string, evidence: EvidenceReference[]): Promise<void>;
};

/** Constrói um sink a partir de um adapter — retorna undefined se o provider não sabe escrever Bugs. */
export function createSinkFromAdapter(
  adapter: ProjectManagerAdapter,
  caps: ProjectManagerCapabilities,
): ProductFindingSink | undefined {
  if (!canWriteBugs(caps)) return undefined;
  return {
    provider: adapter.provider,
    findDuplicate: (input) => adapter.findDuplicate(buildBugSignature(input), input.projectId),
    createBug: (input) => adapter.createBug(input),
    updateBug: (issueId, input) => adapter.updateBug(issueId, input),
    linkToRequirement: (issueId, reqId) => adapter.linkToRequirement(issueId, reqId),
    assign: (issueId, assigneeId) => adapter.assign(issueId, assigneeId),
    addEvidence: (issueId, evidence) => adapter.addEvidence(issueId, evidence),
  };
}

export type BugSyncOutcome =
  | { status: "created"; issue: ExternalIssue; signature: string }
  | { status: "updated"; issue: ExternalIssue; signature: string }
  | { status: "pending"; signature: string; pendingPath: string; reason: string }
  | { status: "skipped"; reason: string };

function pendingPaths(e2eDir: string): { json: string; md: string } {
  const dir = join(e2eDir, "falhas");
  return { json: join(dir, "BUG-SYNC-PENDENTE.json"), md: join(dir, "BUG-SYNC-PENDENTE.md") };
}

function redactedPayload(input: ProductBugInput): Record<string, unknown> {
  // O payload já não deve conter segredos (environmentBaseUrl não deve trazer credenciais),
  // mas removemos qualquer campo que pareça sensível por segurança adicional.
  const { environmentBaseUrl, ...rest } = input;
  return { ...rest, environmentBaseUrl: environmentBaseUrl.replace(/\/\/[^/\s:@]+:[^@\s]+@/g, "//***:***@") };
}

function writePending(opts: {
  e2eDir: string;
  input: ProductBugInput;
  signature: string;
  operation: "findDuplicate" | "createBug" | "updateBug" | "linkToRequirement" | "addEvidence" | "assign";
  error: unknown;
}): string {
  const { json, md } = pendingPaths(opts.e2eDir);
  mkdirSync(join(opts.e2eDir, "falhas"), { recursive: true });
  const message = opts.error instanceof Error ? opts.error.message : String(opts.error);
  const code = opts.error instanceof McpError ? opts.error.code : "invalid_response";
  const sanitized = sanitizeErrorMessage(message);
  const payload = {
    at: new Date().toISOString(),
    provider: opts.input.provider,
    operation: opts.operation,
    errorCode: code,
    error: sanitized,
    signature: opts.signature,
    payload: redactedPayload(opts.input),
  };
  writeFileSync(json, JSON.stringify(payload, null, 2) + "\n", "utf8");
  const lines = [
    "# Bug PRODUTO — sincronização externa pendente",
    "",
    "A triagem confirmou **PRODUTO**, mas a criação/atualização do item no gestor de projetos falhou.",
    "O achado local (PRODUTO.json) foi preservado. Nenhum item foi criado no gestor até esta confirmação.",
    "",
    `- Provider: ${opts.input.provider}`,
    `- Operação: ${opts.operation}`,
    `- Código de erro: ${code}`,
    `- Erro: ${sanitized}`,
    `- Assinatura (dedupe): ${opts.signature}`,
    "",
    "Retomada: rode a rodada novamente (ou \`qaagent --plain\`) — a sincronização é idempotente e não cria duplicidade.",
  ];
  writeFileSync(md, lines.join("\n") + "\n", "utf8");
  return json;
}

/**
 * Ponto único de sincronização de Bug — chamado SOMENTE depois da triagem classificar PRODUTO.
 * Nunca lança: falhas viram "pending" preservando evidências, para retomada idempotente.
 */
export async function syncProductFinding(opts: {
  sink: ProductFindingSink | undefined;
  input: ProductBugInput;
  e2eDir: string;
  onLog: (line: string) => void;
}): Promise<BugSyncOutcome> {
  const signature = buildBugSignature(opts.input);
  if (!opts.sink) {
    opts.onLog("sincronização de Bug: nenhum gestor de projetos com escrita configurado — achado permanece local (PRODUTO.json)");
    return { status: "skipped", reason: "sem sink configurado (fonte local/git ou MCP somente leitura)" };
  }

  try {
    const existing = await opts.sink.findDuplicate(opts.input);
    if (existing) {
      const updated = await opts.sink.updateBug(existing.id, {
        comment: `Reincidência na rodada ${opts.input.runId} (${opts.input.occurredAt}).`,
      });
      await opts.sink.addEvidence(existing.id, opts.input.evidence);
      opts.onLog(`Bug existente atualizado: ${updated.key ?? updated.id}${updated.url ? ` (${updated.url})` : ""}`);
      return { status: "updated", issue: updated, signature };
    }
  } catch (err) {
    const path = writePending({ e2eDir: opts.e2eDir, input: opts.input, signature, operation: "findDuplicate", error: err });
    opts.onLog(`aviso: não foi possível verificar duplicidade no gestor — pendência gravada em ${path}`);
    return { status: "pending", signature, pendingPath: path, reason: "findDuplicate falhou" };
  }

  try {
    const issue = await opts.sink.createBug(opts.input);
    try {
      if (opts.input.requirementExternalId) await opts.sink.linkToRequirement(issue.id, opts.input.requirementExternalId);
      if (opts.input.assigneeExternalId) await opts.sink.assign(issue.id, opts.input.assigneeExternalId);
      await opts.sink.addEvidence(issue.id, opts.input.evidence);
    } catch (err) {
      // Bug já foi criado — não reclassifica nem finge falha total; só avisa.
      opts.onLog(`aviso: Bug ${issue.key ?? issue.id} criado, mas vínculo/evidência falhou parcialmente: ${err instanceof Error ? err.message : String(err)}`);
    }
    opts.onLog(`Bug criado: ${issue.key ?? issue.id}${issue.url ? ` (${issue.url})` : ""}`);
    return { status: "created", issue, signature };
  } catch (err) {
    const path = writePending({ e2eDir: opts.e2eDir, input: opts.input, signature, operation: "createBug", error: err });
    opts.onLog(`aviso: falha ao criar Bug no gestor — pendência gravada em ${path} (PRODUTO.json preservado)`);
    return { status: "pending", signature, pendingPath: path, reason: "createBug falhou" };
  }
}

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveEffectiveContract } from "./effective-contract.ts";
import type { RequirementContract, RequirementRunScope, SourceManifest, SourceManifestEntry } from "./types.ts";

/** Converte a key externa (ex.: "PROJ-142") num ID no formato US_XXX que o pipeline local já reconhece. */
export function usIdFromContract(contract: RequirementContract): string {
  const base = contract.key || contract.externalId;
  const slug = base
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug.startsWith("US_") ? slug : `US_${slug}`;
}

function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function findRelated(all: RequirementContract[], us: RequirementContract, kind: "requirement-change" | "bug"): RequirementContract[] {
  if (kind === "requirement-change") {
    return all.filter((c) => c.type === "requirement-change" && c.originRequirementId === us.externalId);
  }
  return all.filter(
    (c) =>
      c.type === "bug" &&
      c.relations.some((r) => (r.kind === "fixes" || r.kind === "blocks") && r.targetExternalId === us.externalId),
  );
}

function renderMarkdown(us: RequirementContract, usId: string, opts: { ambiguous: boolean; ambiguityReason?: string; bugs: RequirementContract[] }): string {
  const front = [
    "---",
    `provider: ${us.provider}`,
    us.workspaceId ? `workspace_id: ${us.workspaceId}` : undefined,
    `project_id: ${us.projectId}`,
    us.cycleId ? `cycle_id: ${us.cycleId}` : undefined,
    `external_id: ${us.externalId}`,
    `external_key: ${us.key}`,
    us.revision ? `revision: ${us.revision}` : undefined,
    us.sourceUrl ? `source_url: ${us.sourceUrl}` : undefined,
    `synced_at: ${new Date().toISOString()}`,
    "---",
  ].filter((l): l is string => Boolean(l));

  const lines: string[] = [...front, "", `# ${usId} — ${us.title}`, ""];

  if (opts.ambiguous) {
    lines.push(
      "> **ATENÇÃO — contrato ambíguo:** existem Mudanças de Requisito aprovadas em conflito, sem relação explícita de substituição entre elas.",
      `> ${opts.ambiguityReason ?? ""}`,
      "",
    );
  }

  if (us.status) lines.push(`**Status:** ${us.status}`, "");
  lines.push(`**Aprovado:** ${us.approved ? "sim" : "não"}`, "");
  if (us.description) lines.push(us.description.trim(), "");

  if (us.businessRules.length) {
    lines.push("## RN", "");
    for (const rn of us.businessRules) lines.push(`- ${rn.id}: ${rn.text}`);
    lines.push("");
  }

  for (const ca of us.acceptanceCriteria) {
    // Comentário invisível repetindo o US_ID dentro do bloco do CA: req-sync.ts extrai CA por
    // bloco (split em "### CA") e exige que US_/CA apareçam no MESMO bloco — igual à convenção
    // já usada nos requisitos Markdown locais.
    lines.push(`### ${ca.id}`, "", `<!-- ${usId} -->`, "");
    if (ca.given) lines.push(`**Dado** ${ca.given}`, "");
    if (ca.when) lines.push(`**Quando** ${ca.when}`, "");
    lines.push(`**Então** ${ca.then}`, "");
  }

  if (opts.bugs.length) {
    lines.push("## Bugs vinculados", "");
    for (const bug of opts.bugs) lines.push(`- ${bug.key} (${bug.status ?? "status desconhecido"}): ${bug.title}`);
    lines.push("");
  }

  return lines.join("\n");
}

export type MaterializeResult = {
  files: string[];
  manifest: SourceManifest;
  ambiguousUsIds: string[];
};

/**
 * Materializa contratos normalizados em Markdown canônico (compatível com listRequirementCases/
 * listRequirementRns/runReqSync) + SOURCE-MANIFEST.json. Não altera semântica de requisitos local/git.
 */
export function materializeContractsToMarkdown(
  contracts: RequirementContract[],
  destDir: string,
  opts: { scope: RequirementRunScope },
): MaterializeResult {
  mkdirSync(destDir, { recursive: true });
  const userStories = contracts.filter((c) => c.type === "user-story");
  const files: string[] = [];
  const entries: SourceManifestEntry[] = [];
  const ambiguousUsIds: string[] = [];

  for (const us of userStories) {
    const usId = usIdFromContract(us);
    const changes = findRelated(contracts, us, "requirement-change");
    const bugs = findRelated(contracts, us, "bug");
    const effective = resolveEffectiveContract(us, changes);
    if (effective.ambiguous) ambiguousUsIds.push(usId);

    const md = renderMarkdown(effective.contract, usId, {
      ambiguous: effective.ambiguous,
      ambiguityReason: effective.ambiguityReason,
      bugs,
    });
    const fileName = `${usId}.md`;
    const filePath = join(destDir, fileName);
    writeFileSync(filePath, md, "utf8");
    files.push(filePath);

    entries.push({
      provider: us.provider,
      workspaceId: us.workspaceId,
      projectId: us.projectId,
      cycleId: us.cycleId,
      externalId: us.externalId,
      externalKey: us.key,
      revision: us.revision,
      sourceUrl: us.sourceUrl,
      relations: us.relations,
      contentHash: contentHash(md),
      syncedAt: new Date().toISOString(),
    });
  }

  const manifest: SourceManifest = {
    provider: userStories[0]?.provider ?? contracts[0]?.provider ?? "unknown",
    workspaceId: userStories[0]?.workspaceId,
    projectId: userStories[0]?.projectId ?? contracts[0]?.projectId ?? "",
    cycleId: userStories[0]?.cycleId,
    syncedAt: new Date().toISOString(),
    scope: opts.scope,
    entries,
  };
  writeFileSync(join(destDir, "SOURCE-MANIFEST.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");

  return { files, manifest, ambiguousUsIds };
}

import { createHash } from "node:crypto";
import type { ProductBugInput } from "./types.ts";

function normalize(s: string | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Assinatura estável para dedupe de Bugs — mesma US/CA/comportamento não deve criar itens repetidos. */
export function buildBugSignature(input: ProductBugInput): string {
  const parts = [
    input.provider,
    input.projectId,
    input.requirementKey ?? input.requirementExternalId ?? "",
    input.ruleOrCriterionId ?? "",
    normalize(input.testTitle),
    normalize(input.observed).slice(0, 300),
    input.buildOrVersion ?? "",
  ];
  const raw = parts.join("|");
  return createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

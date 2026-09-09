import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ProductFinding } from "./types.ts";
import { scriptsDir } from "./workspace.ts";

export type { ProductFinding } from "./types.ts";

export function productFindingsPath(): string {
  return join(scriptsDir(), "falhas", "PRODUTO.json");
}

export function loadProductFindings(): ProductFinding[] {
  const path = productFindingsPath();
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as { findings?: ProductFinding[] };
    return Array.isArray(raw.findings) ? raw.findings : [];
  } catch {
    return [];
  }
}

export function saveProductFindings(findings: ProductFinding[]): void {
  mkdirSync(dirname(productFindingsPath()), { recursive: true });
  writeFileSync(
    productFindingsPath(),
    JSON.stringify({ at: new Date().toISOString(), findings }, null, 2) + "\n",
    "utf8",
  );
}

export function mergeProductFindings(existing: ProductFinding[], extra: ProductFinding[]): ProductFinding[] {
  const map = new Map<string, ProductFinding>();
  for (const f of [...existing, ...extra]) {
    const key = (f.grepHint || [f.us, f.ca].filter(Boolean).join(":") || f.title).trim();
    map.set(key, f);
  }
  return [...map.values()];
}

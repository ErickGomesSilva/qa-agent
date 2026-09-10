import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { scriptsDir, requisitosDestDir } from "./workspace.ts";

export type CaRecord = {
  us: string;
  ca: string;
  arquivo: string;
  hash: string;
  entao: string;
  bloco: string;
};

export type SyncDiffEntry = {
  us: string;
  ca: string;
  status: "novo" | "alterado" | "ok" | "orfao";
  arquivo?: string;
  specPath?: string;
};

const US_RE = /\b(US_[A-Z0-9_]+)\b/g;
const CA_RE = /\b(CA\d+)\b/g;
const RN_RE = /\b(RN[_-]?[A-Z0-9]+)\b/g;

export type RnRecord = {
  us?: string;
  rn: string;
  arquivo: string;
  texto: string;
};

export function listRequirementCases(reqDir = requisitosDestDir()): CaRecord[] {
  const casos: CaRecord[] = [];
  for (const file of walkMd(reqDir)) casos.push(...extractCasFromMarkdown(file));
  const byKey = new Map<string, CaRecord>();
  for (const c of casos) byKey.set(`${c.us}:${c.ca}`, c);
  return [...byKey.values()];
}

export function listRequirementRns(reqDir = requisitosDestDir()): RnRecord[] {
  const out: RnRecord[] = [];
  const seen = new Set<string>();
  for (const file of walkMd(reqDir)) {
    const text = readFileSync(file, "utf8");
    const arquivo = basename(file);
    const us = text.match(/\bUS_[A-Z0-9_]+\b/)?.[0];
    for (const m of text.matchAll(RN_RE)) {
      const rn = m[1];
      if (!rn || /^RN$/i.test(rn)) continue;
      const key = `${us ?? ""}:${rn}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const idx = m.index ?? 0;
      out.push({ us, rn, arquivo, texto: text.slice(idx, idx + 180).replace(/\s+/g, " ").trim() });
    }
  }
  return out;
}

function walkMd(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const go = (d: string) => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) go(full);
      else if (/\.(md|txt)$/i.test(name)) out.push(full);
    }
  };
  go(dir);
  return out;
}

function extractCasFromMarkdown(filePath: string): CaRecord[] {
  const text = readFileSync(filePath, "utf8");
  const arquivo = basename(filePath);
  const out: CaRecord[] = [];
  const blocks = text.split(/\n(?=###\s*CA|\*\*CA)/i);
  for (const block of blocks) {
    const us = block.match(/\bUS_[A-Z0-9_]+\b/)?.[0];
    const ca = block.match(/\bCA\d+\b/)?.[0];
    if (!us || !ca) continue;
    const entao = block.match(/\*\*Ent[aã]o\*\*[:\s]*([\s\S]*?)(?=\n\*\*|\n###|$)/i)?.[1]?.trim() ?? "";
    const hash = createHash("sha256").update(`${us}|${ca}|${entao}`).digest("hex").slice(0, 16);
    out.push({ us, ca, arquivo, hash, entao, bloco: block.slice(0, 1200) });
  }
  if (out.length === 0) {
    const usMatches = [...text.matchAll(US_RE)].map((m) => m[1]);
    const caMatches = [...text.matchAll(CA_RE)].map((m) => m[1]);
    if (usMatches.length === 1 && caMatches.length) {
      for (const ca of caMatches) {
        const hash = createHash("sha256").update(`${usMatches[0]}|${ca}|${text.slice(0, 500)}`).digest("hex").slice(0, 16);
        out.push({ us: usMatches[0]!, ca: ca!, arquivo, hash, entao: "", bloco: text.slice(0, 1200) });
      }
    }
  }
  return out;
}

function specForCase(us: string, ca: string): string | undefined {
  const spec = join(scriptsDir(), "tests", `${us}.spec.ts`);
  if (!existsSync(spec)) return undefined;
  const text = readFileSync(spec, "utf8");
  if (text.includes(us) && text.includes(ca)) {
    return `tests/${us}.spec.ts`;
  }
  return undefined;
}

/** Compara requisitos copiados com specs e grava scripts/falhas/SYNC-DIFF.json */
export function runReqSync(onLog?: (line: string) => void): SyncDiffEntry[] {
  const log = onLog ?? (() => undefined);
  const reqDir = requisitosDestDir();
  const casos: CaRecord[] = [];
  for (const file of walkMd(reqDir)) {
    casos.push(...extractCasFromMarkdown(file));
  }

  const byKey = new Map<string, CaRecord>();
  for (const c of casos) byKey.set(`${c.us}:${c.ca}`, c);

  const diff: SyncDiffEntry[] = [];
  for (const c of byKey.values()) {
    const specPath = specForCase(c.us, c.ca);
    if (!specPath) {
      diff.push({ us: c.us, ca: c.ca, status: "novo", arquivo: c.arquivo });
      continue;
    }
    diff.push({ us: c.us, ca: c.ca, status: "ok", arquivo: c.arquivo, specPath });
  }

  const specFiles = readdirSync(join(scriptsDir(), "tests"))
    .filter((f) => f.endsWith(".spec.ts"))
    .map((f) => join(scriptsDir(), "tests", f));
  for (const sf of specFiles) {
    const us = basename(sf, ".spec.ts");
    if (!us.startsWith("US_")) continue;
    const text = readFileSync(sf, "utf8");
    const cas = [...text.matchAll(CA_RE)].map((m) => m[0]);
    for (const ca of new Set(cas)) {
      if (!byKey.has(`${us}:${ca}`)) {
        diff.push({ us, ca, status: "orfao", specPath: `tests/${basename(sf)}` });
      }
    }
  }

  const path = join(scriptsDir(), "falhas", "SYNC-DIFF.json");
  writeFileSync(path, JSON.stringify({ at: new Date().toISOString(), entries: diff }, null, 2), "utf8");
  const novo = diff.filter((d) => d.status === "novo").length;
  const orfao = diff.filter((d) => d.status === "orfao").length;
  log(`req-sync: ${diff.length} entradas (novo=${novo} orfao=${orfao}) -> ${path.replace(/\\/g, "/")}`);
  return diff;
}

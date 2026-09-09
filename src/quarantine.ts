import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { PlaywrightTestRow } from "./playwright-parse.ts";
import type { StuckCase } from "./types.ts";
import { scriptsDir } from "./workspace.ts";

export type QuarantineFile = {
  version: 1;
  updatedAt: string;
  cases: StuckCase[];
};

export function quarantinePath(): string {
  return join(scriptsDir(), "falhas", "QUARENTENA.json");
}

export function quarantineMdPath(): string {
  return join(scriptsDir(), "falhas", "QUARENTENA.md");
}

export function loadQuarantine(): QuarantineFile {
  const path = quarantinePath();
  if (!existsSync(path)) return { version: 1, updatedAt: new Date().toISOString(), cases: [] };
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as QuarantineFile;
    const cases = Array.isArray(raw.cases) ? raw.cases.filter((c) => c?.title) : [];
    return { version: 1, updatedAt: raw.updatedAt ?? new Date().toISOString(), cases };
  } catch {
    return { version: 1, updatedAt: new Date().toISOString(), cases: [] };
  }
}

export function caseKey(c: Pick<StuckCase, "us" | "ca" | "grepHint" | "title">): string {
  return (c.grepHint || [c.us, c.ca].filter(Boolean).join(":") || c.title).trim();
}

export function mergeQuarantine(existing: StuckCase[], extra: StuckCase[]): StuckCase[] {
  const map = new Map<string, StuckCase>();
  for (const c of existing) map.set(caseKey(c), c);
  for (const c of extra) map.set(caseKey(c), c);
  return [...map.values()];
}

function writeMd(file: QuarantineFile): void {
  const lines = [
    "# Quarentena",
    "",
    `Atualizado: ${file.updatedAt}`,
    "",
    "Casos que esgotaram retomadas TESTE. Na rodada normal a suíte **não** os executa.",
    "F7 **Retestar quarentena** = SIM para rodá-los de novo na próxima missão (F8).",
    "",
  ];
  if (!file.cases.length) {
    lines.push("Nenhum caso em quarentena.");
  } else {
    for (const c of file.cases) {
      const id = [c.us, c.ca].filter(Boolean).join(" ") || c.title;
      lines.push(`- **${id}**`);
      lines.push(`  - ${c.title}`);
      lines.push(`  - ${c.reason}`);
    }
  }
  writeFileSync(quarantineMdPath(), lines.join("\n") + "\n", "utf8");
}

export function saveQuarantine(cases: StuckCase[]): QuarantineFile {
  const file: QuarantineFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    cases,
  };
  mkdirSync(dirname(quarantinePath()), { recursive: true });
  writeFileSync(quarantinePath(), JSON.stringify(file, null, 2) + "\n", "utf8");
  writeMd(file);
  return file;
}

function rowMatchesCase(row: PlaywrightTestRow, c: StuckCase): boolean {
  if (c.us && row.us === c.us && (!c.ca || row.ca === c.ca)) return true;
  if (c.grepHint && row.title.includes(c.grepHint.replace(/\\/g, ""))) return true;
  return row.title.includes(c.title.slice(0, 48));
}

export function settleQuarantine(opts: {
  previous: StuckCase[];
  newStuck: StuckCase[];
  passedRows?: PlaywrightTestRow[];
  retest: boolean;
}): StuckCase[] {
  let kept = opts.previous;
  if (opts.retest && opts.passedRows?.length) {
    kept = opts.previous.filter((c) => !opts.passedRows!.some((row) => rowMatchesCase(row, c)));
  }
  return mergeQuarantine(kept, opts.newStuck);
}

export function quarantineGrep(cases: StuckCase[]): string | undefined {
  const parts = [...new Set(cases.map((c) => c.grepHint || c.us).filter((s): s is string => Boolean(s?.trim())))];
  return parts.length ? parts.join("|") : undefined;
}

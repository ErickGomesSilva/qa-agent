import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PlaywrightOutcome } from "./types.ts";

export type StagedPlaywrightEvidence = {
  /** Relativo ao workspace do projeto, ex. scripts/falhas/ULTIMA-FALHA.log */
  logRel: string;
  jsonRel: string;
  absoluteLog: string;
  absoluteJson: string;
};

/** Copia log/JSON da rodada para dentro do workspace (acessível às tools do LLM). */
export function stagePlaywrightEvidence(
  e2eDir: string,
  playwright: PlaywrightOutcome,
): StagedPlaywrightEvidence {
  const falhas = join(e2eDir, "falhas");
  mkdirSync(falhas, { recursive: true });
  const absoluteLog = join(falhas, "ULTIMA-FALHA.log");
  const absoluteJson = join(falhas, "ULTIMA-FALHA.json");

  if (existsSync(playwright.logPath)) {
    copyFileSync(playwright.logPath, absoluteLog);
  } else {
    writeFileSync(absoluteLog, "(log Playwright ausente)\n", "utf8");
  }

  const payload = {
    stats: playwright.stats,
    exitCode: playwright.exitCode,
    passed: playwright.passed,
    failures: playwright.failures,
    rawJsonPath: playwright.rawJsonPath,
    logPath: playwright.logPath,
    stagedAt: new Date().toISOString(),
  };
  try {
    if (existsSync(playwright.rawJsonPath)) {
      copyFileSync(playwright.rawJsonPath, absoluteJson);
    } else {
      writeFileSync(absoluteJson, JSON.stringify(payload, null, 2) + "\n", "utf8");
    }
  } catch {
    writeFileSync(absoluteJson, JSON.stringify(payload, null, 2) + "\n", "utf8");
  }

  return {
    logRel: "scripts/falhas/ULTIMA-FALHA.log",
    jsonRel: "scripts/falhas/ULTIMA-FALHA.json",
    absoluteLog,
    absoluteJson,
  };
}

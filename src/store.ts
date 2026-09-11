import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.ts";
import type { OrchestratorRun } from "./types.ts";

const runs = new Map<string, OrchestratorRun>();

export function appendLog(run: OrchestratorRun, line: string): void {
  const stamp = new Date().toISOString();
  run.log.push(`${stamp} ${line}`);
  run.updatedAt = stamp;
  persist(run);
}

export function saveRun(run: OrchestratorRun): void {
  runs.set(run.id, run);
  persist(run);
}

export function getRun(id: string): OrchestratorRun | undefined {
  return runs.get(id);
}

export function listRuns(): OrchestratorRun[] {
  return [...runs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function activeRun(): OrchestratorRun | undefined {
  return [...runs.values()].find((r) =>
    [
      "queued",
      "generating_scripts",
      "exploring_logic",
      "touring",
      "auditing_coverage",
      "deepening_stubs",
      "unblocking_massa",
      "generating_massa",
      "running_k6",
      "running_playwright",
      "running_agent",
      "resuming",
    ].includes(r.status),
  );
}

function persist(run: OrchestratorRun): void {
  mkdirSync(config.dataDir, { recursive: true });
  const dir = join(config.dataDir, "runs", run.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "run.json"), JSON.stringify(run, null, 2), "utf8");
}

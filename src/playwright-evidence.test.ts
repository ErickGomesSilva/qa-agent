import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { stagePlaywrightEvidence } from "./playwright-evidence.ts";
import { isTriageInfraError } from "./triage-agent.ts";
import { runTool } from "./llm/tools.ts";

describe("stagePlaywrightEvidence", () => {
  it("copia log para scripts/falhas dentro do e2eDir", () => {
    const root = mkdtempSync(join(tmpdir(), "qa-ev-"));
    const e2e = join(root, "scripts");
    const runs = join(root, "runs");
    mkdirSync(runs, { recursive: true });
    mkdirSync(e2e, { recursive: true });
    writeFileSync(join(runs, "pw.log"), "hello log\n");
    writeFileSync(join(runs, "pw.json"), '{"stats":{}}\n');
    const staged = stagePlaywrightEvidence(e2e, {
      passed: false,
      exitCode: 1,
      stats: { expected: 0, unexpected: 1, skipped: 0 },
      failures: [{ title: "US_X CA01", error: "boom" }],
      rawJsonPath: join(runs, "pw.json"),
      logPath: join(runs, "pw.log"),
    });
    assert.equal(staged.logRel, "scripts/falhas/ULTIMA-FALHA.log");
    assert.ok(existsSync(staged.absoluteLog));
    assert.match(readFileSync(staged.absoluteLog, "utf8"), /hello log/);
  });
});

describe("isTriageInfraError", () => {
  it("reconhece path fora do workspace", () => {
    assert.equal(isTriageInfraError(new Error("caminho fora do workspace: ../runs/x")), true);
    assert.equal(isTriageInfraError(new Error("locator timeout")), false);
  });
});

describe("runTool path guard", () => {
  it("devolve ERRO_FERRAMENTA em vez de throw", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "qa-tool-"));
    const out = await runTool(cwd, "read_file", { path: "../outside.txt" });
    assert.match(out, /ERRO_FERRAMENTA/);
    assert.match(out, /AMBIENTE/);
  });
});

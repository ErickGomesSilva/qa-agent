import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildFatalSummary, formatFatalSummaryTerminal } from "./fatal-summary.ts";

describe("buildFatalSummary", () => {
  it("resume agente Cursor longo sem Playwright", () => {
    const summary = buildFatalSummary({
      id: "edf40b80-aefd-4c3b-8cab-7d3095d82119",
      status: "error",
      createdAt: "2026-09-10T17:07:18.403Z",
      updatedAt: "2026-09-10T21:57:09.836Z",
      requisitosPath: "C:/tmp/Portal-Rural/requisitos",
      projectPath: "C:/tmp/data/projects/cernova-centralXML",
      error: "Run do agente falhou: run-39477bd8-ebfa-4861-8cfa-298cb936d7f1",
      rounds: 0,
      log: [
        "2026-09-10T17:07:18.404Z ▸ fase: Preparacao — sincronizando requisitos",
        "2026-09-10T17:07:18.619Z ▸ fase: Mapa por perfil — Playwright (menu, controles, HTTP 4xx) antes de gerar specs",
        "2026-09-10T17:19:30.005Z mapa por perfil gravado → scripts/falhas/MAPA-PERFIL.json",
        "2026-09-10T17:19:30.182Z roteiro: 29 linha(s) → scripts/falhas/ROTEIRO.json",
        "2026-09-10T17:19:30.188Z Script de testes encontrados: 104 arquivo(s) em scripts/tests",
        "2026-09-10T17:19:30.189Z ▸ fase: Agente IA — regras de negocio e logica-rn.spec.ts",
        "2026-09-10T17:19:30.321Z runId=run-39477bd8-ebfa-4861-8cfa-298cb936d7f1",
        "2026-09-10T21:57:09.818Z agente: processando… 16659s",
        "2026-09-10T21:57:09.836Z erro fatal: Run do agente falhou: run-39477bd8-ebfa-4861-8cfa-298cb936d7f1",
      ],
    });

    assert.equal(summary.cursorRunId, "run-39477bd8-ebfa-4861-8cfa-298cb936d7f1");
    assert.equal(summary.agentSeconds, 16659);
    assert.equal(summary.playwrightRounds, 0);
    assert.match(summary.durationLabel, /4h/);
    assert.match(summary.whereStopped, /agente de IA/i);
    assert.match(summary.whereStopped, /Playwright não chegou/i);
    assert.ok(summary.completed.some((c) => /Mapa/i.test(c)));
    assert.ok(summary.completed.some((c) => /Roteiro/i.test(c)));
    assert.ok(summary.lines.some((l) => l.includes("Onde parou")));

    const term = formatFatalSummaryTerminal(summary);
    assert.ok(term.some((l) => /Falha fatal/i.test(l)));
    assert.ok(term.some((l) => /FALHA-FATAL/i.test(l)));
  });

  it("resume erro de credencial", () => {
    const summary = buildFatalSummary({
      id: "abc",
      status: "error",
      createdAt: "2026-09-10T10:00:00.000Z",
      updatedAt: "2026-09-10T10:00:05.000Z",
      requisitosPath: "/x/requisitos",
      projectPath: "/x/projects/demo",
      error: "Login e senha ausentes — informe no terminal ou em credenciais.md",
      rounds: 0,
      log: ["2026-09-10T10:00:00.000Z ▸ fase: Preparacao — sincronizando requisitos"],
    });
    assert.match(summary.whereStopped, /configuração|credenciais/i);
    assert.ok(summary.nextSteps.some((s) => /F5|F4/i.test(s)));
  });
});

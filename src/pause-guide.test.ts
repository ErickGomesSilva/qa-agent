import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildContinuarGuide } from "./pause-guide.ts";

describe("buildContinuarGuide", () => {
  it("gera guia com skipLogic quando parou no agente", () => {
    const guide = buildContinuarGuide(
      {
        id: "run-1",
        status: "running_agent",
        requisitosPath: "/x/requisitos",
        projectPath: "/x/projects/demo",
        rounds: 0,
        log: [
          "2026-09-11T10:00:00.000Z ▸ fase: Preparacao — sincronizando requisitos",
          "2026-09-11T10:01:00.000Z mapa por perfil gravado → scripts/falhas/MAPA-PERFIL.json",
          "2026-09-11T10:01:01.000Z roteiro: 10 linha(s) → scripts/falhas/ROTEIRO.json",
          "2026-09-11T10:01:02.000Z Script de testes encontrados: 50 arquivo(s) em scripts/tests",
          "2026-09-11T10:01:03.000Z ▸ fase: Agente IA — regras de negocio e logica-rn.spec.ts",
          "2026-09-11T10:01:04.000Z runId=run-abc",
        ],
      },
      { reason: "user_pause" },
    );
    assert.equal(guide.resume.skipLogicAgent, true);
    assert.equal(guide.resume.skipTour, true);
    assert.match(guide.whereStopped, /Pausa do usuário/i);
    assert.ok(guide.lines.some((l) => l.includes("Como o agente deve continuar")));
    assert.ok(guide.completed.some((c) => /Mapa/i.test(c)));
  });
});

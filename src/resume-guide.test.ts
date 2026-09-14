import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildResumeGuide, formatResumeGuideTerminal, type ResumeArtifacts } from "./resume-guide.ts";

const artifacts: ResumeArtifacts = {
  hasMapa: true,
  hasRoteiro: true,
  specCount: 3,
  hasContinuar: false,
};

describe("resume-guide", () => {
  it("fatal agente: Enter sem R e reaproveita specs", () => {
    const guide = buildResumeGuide(
      {
        id: "r1",
        status: "error",
        error: "Run do agente falhou: run-abc",
        log: ["▸ fase: Agente IA — regras", "erro fatal: Run do agente falhou"],
        rounds: 0,
        requisitosPath: "/x",
        projectPath: "/x",
      },
      artifacts,
    );
    assert.equal(guide.kind, "fatal_agent");
    assert.ok(guide.actions.some((a) => /Enter SEM R/i.test(a)));
    assert.ok(guide.reuse.some((r) => /3 spec/i.test(r)));
    const term = formatResumeGuideTerminal(guide);
    assert.ok(term.some((l) => /Como retomar/i.test(l)));
  });

  it("triagem PRODUTO: aponta F7 seguir após produto", () => {
    const guide = buildResumeGuide(
      {
        id: "r2",
        status: "paused_produto",
        log: ["▸ fase: Triagem IA"],
        rounds: 1,
        triage: {
          classe: "PRODUTO",
          resumo: "botão quebra",
          corrigiuTeste: false,
          discordEnviado: false,
        },
        playwright: {
          passed: false,
          exitCode: 1,
          failures: [{ title: "US_X CA01", file: "a.spec.ts", error: "expect failed" }],
          stats: { expected: 1, unexpected: 1, skipped: 0 },
          rawJsonPath: "",
          logPath: "",
        },
        requisitosPath: "/x",
        projectPath: "/x",
      },
      artifacts,
    );
    assert.equal(guide.kind, "triage_produto");
    assert.ok(guide.actions.some((a) => /PRODUTO/i.test(a)));
  });

  it("pausa usuário: CONTINUAR e skip lógica", () => {
    const guide = buildResumeGuide(
      {
        id: "r3",
        status: "paused_user",
        error: "Pausa solicitada pelo usuário",
        log: ["▸ fase: Gerando specs"],
        rounds: 0,
        requisitosPath: "/x",
        projectPath: "/x",
      },
      { ...artifacts, hasContinuar: true },
    );
    assert.equal(guide.kind, "paused_user");
    assert.ok(guide.reuse.some((r) => /PULADO/i.test(r)));
  });

  it("AMBIENTE: aponta AVISO-AMBIENTE", () => {
    const guide = buildResumeGuide(
      {
        id: "r4",
        status: "paused_ambiente",
        log: [],
        rounds: 1,
        triage: {
          classe: "AMBIENTE",
          resumo: "ECONNRESET",
          corrigiuTeste: false,
          discordEnviado: false,
        },
        requisitosPath: "/x",
        projectPath: "/x",
      },
      artifacts,
    );
    assert.equal(guide.kind, "triage_ambiente");
    assert.ok(guide.actions.some((a) => /AVISO-AMBIENTE/i.test(a)));
  });
});

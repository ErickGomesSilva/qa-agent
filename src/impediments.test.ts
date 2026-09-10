import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildImpediments } from "./impediments.ts";
import { defaultEscopo } from "./escopo.ts";

describe("buildImpediments", () => {
  it("detalha falha Playwright com erro e proximo passo", () => {
    const r = buildImpediments({
      playwright: {
        passed: [],
        skipped: [],
        failed: [
          {
            title: "US_DOC_001 CA01 — consulta @executavel",
            us: "US_DOC_001",
            ca: "CA01",
            file: "scripts/tests/US_DOC_001.spec.ts",
            status: "failed",
            error: "Error: expect(received).toHaveCount()\nReceived: 0",
          },
        ],
      },
    });
    const item = r.itens.find((i) => i.categoria === "playwright");
    assert.ok(item);
    assert.equal(item.severity, "falha");
    assert.match(item.detalhe, /toHaveCount/);
    assert.match(item.proximoPasso, /PRODUTO|MASSA|TESTE/i);
    assert.equal(r.totais.falha, 1);
  });

  it("massa e skip viram bloqueio com impacto de cobertura", () => {
    const r = buildImpediments({
      cobertura: {
        version: 2,
        casos: [
          {
            us: "US_ACL_001",
            ca: "CA02",
            arquivo: "f.md",
            titulo: "perfil validador",
            coberto: false,
            motivo: "Requer massa/perfil alternativo — validador",
            nivel: "skip-massa",
            massaNecessaria: "validador",
          },
        ],
      },
    });
    const item = r.itens.find((i) => i.categoria === "massa");
    assert.ok(item);
    assert.equal(item.severity, "bloqueio");
    assert.match(item.impacto, /nao esta feita|não está feita|nao prova/i);
  });

  it("aviso de permissao do roteiro e 403 no mapa de consulta autorizada", () => {
    const r = buildImpediments({
      roteiro: {
        version: 1,
        at: new Date().toISOString(),
        escopo: defaultEscopo(),
        coberturaPermissao: {
          completa: false,
          aviso: "cobertura de permissao incompleta: os requisitos citam 2 papeis e o F5 tem 1 acesso(s).",
        },
        linhas: [
          {
            us: "US_DOC_001",
            ca: "CA01",
            perfil: "operador",
            onde: "/app/docs",
            fazer: "consultar",
            esperado: "http-ok",
            specHint: "heading nao prova consulta",
          },
        ],
      },
      mapa: {
        version: 1,
        baseUrl: "http://x",
        at: new Date().toISOString(),
        escopo: defaultEscopo(),
        perfis: [
          {
            label: "operador",
            loginMasked: "op***",
            loginOk: true,
            recusasVisiveis: [],
            rotas: [
              {
                path: "/app/docs",
                heading: "Documentos",
                title: "Docs",
                headings: ["Documentos"],
                menu: ["Documentos"],
                controles: {},
                emptyVisible: false,
                errorVisible: false,
                http: [{ method: "GET", url: "/api/docs", status: 403, codigo: "SEM_PERFIL" }],
              },
            ],
          },
        ],
      },
    });
    assert.ok(r.itens.some((i) => i.categoria === "permissao" && i.severity === "bloqueio"));
    const http = r.itens.find((i) => i.categoria === "mapa-http");
    assert.ok(http);
    assert.equal(http.severity, "produto");
    assert.match(http.detalhe, /403/);
    assert.match(http.detalhe, /Heading/i);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultEscopo } from "./escopo.ts";
import { citedRoles, joinRoteiro, permissionCoverageWarning } from "./roteiro.ts";

describe("joinRoteiro", () => {
  const escopo = defaultEscopo();

  const perfis = [
    {
      label: "operador",
      rotas: [
        {
          path: "/app/docs",
          heading: "Documentos",
          menu: ["Inicio", "Documentos"],
          http: [{ method: "GET", url: "https://app.example/api/docs", status: 200 }],
        },
      ],
    },
    {
      label: "visitante",
      rotas: [
        {
          path: "/app/docs",
          heading: "Documentos",
          menu: ["Inicio", "Documentos"],
          http: [
            { method: "GET", url: "https://app.example/api/docs", status: 403, codigo: "SEM_PERFIL" },
          ],
        },
      ],
    },
  ];

  it("nao usa so heading quando o CA autoriza consulta e a API recusa no outro perfil", () => {
    const { linhas } = joinRoteiro({
      casos: [
        {
          us: "US_DOC_001",
          ca: "CA01",
          entao: "O operador visualiza a lista de documentos da consulta.",
          texto: "Perfil operador consulta documentos na tela Documentos.",
        },
        {
          us: "US_DOC_001",
          ca: "CA02",
          entao: "O visitante nao acessa os dados da consulta.",
          texto: "Perfil visitante nao pode consultar documentos.",
        },
      ],
      perfis,
      f5Labels: ["operador", "visitante"],
      f5ProfileCount: 2,
      escopo,
    });

    const ca01 = linhas.find((l) => l.ca === "CA01");
    const ca02 = linhas.find((l) => l.ca === "CA02");
    assert.ok(ca01);
    assert.ok(ca02);
    assert.equal(ca01.perfil, "operador");
    assert.equal(ca01.esperado, "http-ok");
    assert.match(ca01.specHint, /heading nao prova consulta/i);
    assert.equal(ca02.perfil, "visitante");
    assert.equal(ca02.esperado, "http-recusa");
    assert.notEqual(ca01.esperado, "visivel");
    assert.notEqual(ca02.esperado, "visivel");
  });

  it("CA de consulta autorizada com 403 no mapa do proprio perfil continua http-ok (falha de produto)", () => {
    const { linhas } = joinRoteiro({
      casos: [
        {
          us: "US_DOC_002",
          ca: "CA01",
          entao: "O operador consulta os documentos e ve a lista ou o empty.",
          texto: "operador consulta documentos",
        },
      ],
      perfis: [
        {
          label: "operador",
          rotas: [
            {
              path: "/app/docs",
              heading: "Documentos",
              menu: ["Documentos"],
              http: [{ method: "GET", url: "/api/docs", status: 403, codigo: "SEM_PERFIL" }],
            },
          ],
        },
      ],
      f5Labels: ["operador"],
      f5ProfileCount: 1,
      escopo,
    });
    assert.equal(linhas[0]?.esperado, "http-ok");
  });

  it("CA cita perfil sem label F5 vira massa", () => {
    const { linhas } = joinRoteiro({
      casos: [
        {
          us: "US_ACL_001",
          ca: "CA02",
          entao: "O validador aprova o item.",
          texto: "Perfil validador na tela de fila.",
        },
      ],
      perfis: [
        {
          label: "operador",
          rotas: [{ path: "/app/fila", heading: "Fila", menu: ["Fila"] }],
        },
      ],
      f5Labels: ["operador"],
      f5ProfileCount: 1,
      escopo,
    });
    assert.equal(linhas[0]?.esperado, "massa");
  });
});

describe("permissionCoverageWarning", () => {
  it("avisa quando ha um acesso e as US citam dois papeis", () => {
    const text = "US_A perfil operador consulta. US_B perfil produtor consulta.";
    const roles = citedRoles(text, ["operador"]);
    const aviso = permissionCoverageWarning(roles, 1);
    assert.ok(aviso);
    assert.match(aviso, /cobertura de permissao incompleta/i);
  });

  it("nao avisa com dois acessos para dois papeis", () => {
    const aviso = permissionCoverageWarning(["operador", "produtor"], 2);
    assert.equal(aviso, undefined);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hashFingerprint,
  planMapRoteiro,
  type MapFingerprintInput,
} from "./roteiro-cache.ts";
import type { ProfileMapFile } from "./profile-map.ts";
import type { RoteiroFile } from "./roteiro.ts";

const baseMapInput: MapFingerprintInput = {
  baseUrl: "http://10.0.0.1:3000",
  escopo: { modo: "geral", labels: [], paths: [] },
  f5: [{ label: "operador", login: "op@x", authKind: "form" }],
  crawlDepth: 35,
};

describe("roteiro-cache fingerprint", () => {
  it("hash estavel independente de ordem de chaves internas", () => {
    const a = hashFingerprint({ z: 1, a: { b: 2, c: 3 } });
    const b = hashFingerprint({ a: { c: 3, b: 2 }, z: 1 });
    assert.equal(a, b);
  });

  it("muda quando baseUrl muda", () => {
    const a = hashFingerprint(baseMapInput);
    const b = hashFingerprint({ ...baseMapInput, baseUrl: "http://other:3000" });
    assert.notEqual(a, b);
  });
});

describe("planMapRoteiro", () => {
  const mapFp = "map-aaa";
  const roteiroFp = "rot-bbb";
  const map = {
    version: 1 as const,
    baseUrl: "http://x",
    at: "t",
    escopo: { modo: "geral" as const, labels: [], paths: [] },
    fingerprint: mapFp,
    perfis: [
      {
        label: "op",
        loginMasked: "o***",
        loginOk: true,
        rotas: [],
        recusasVisiveis: [],
      },
    ],
  } satisfies ProfileMapFile & { fingerprint: string };
  const roteiro = {
    version: 1 as const,
    at: "t",
    escopo: { modo: "geral" as const, labels: [], paths: [] },
    fingerprint: roteiroFp,
    coberturaPermissao: { completa: true },
    linhas: [],
  } satisfies RoteiroFile & { fingerprint: string };

  it("reusa ambos quando fingerprints batem", () => {
    const plan = planMapRoteiro({ force: false, mapFp, roteiroFp, map, roteiro });
    assert.equal(plan.action, "reuse-both");
  });

  it("refaz so roteiro se mapa ok e roteiro stale", () => {
    const plan = planMapRoteiro({
      force: false,
      mapFp,
      roteiroFp: "rot-novo",
      map,
      roteiro,
    });
    assert.equal(plan.action, "reuse-map-rebuild-roteiro");
  });

  it("refaz tudo se force", () => {
    const plan = planMapRoteiro({ force: true, mapFp, roteiroFp, map, roteiro });
    assert.equal(plan.action, "rebuild-all");
  });

  it("refaz tudo se mapa antigo sem fingerprint", () => {
    const { fingerprint: _, ...mapSemFp } = map;
    const plan = planMapRoteiro({
      force: false,
      mapFp,
      roteiroFp,
      map: mapSemFp,
      roteiro,
    });
    assert.equal(plan.action, "rebuild-all");
  });
});

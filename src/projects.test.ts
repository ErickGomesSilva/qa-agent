import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generatedCleanupTargets } from "./clean.ts";
import { argvValue, resolveProjectSlug, workspacePathFor } from "./projects.ts";
import { projectSlugFromPath, slugifyProject } from "./project-name.ts";

describe("projeto / slug", () => {
  it("slug sai da pasta pai de requisitos", () => {
    assert.equal(projectSlugFromPath("C:/repos/Portal-Rural/requisitos"), "Portal-Rural");
    assert.equal(slugifyProject("Cliente X"), "Cliente-X");
  });

  it("--project ganha do env", () => {
    const slug = resolveProjectSlug({
      argv: ["node", "qaagent", "--project", "Outro"],
      env: { ...process.env, QA_PROJECT: "Ignorado" },
    });
    assert.equal(slug, "Outro");
  });

  it("argvValue le --project=", () => {
    assert.equal(argvValue(["--project=Acme"], "project"), "Acme");
  });
});

describe("generatedCleanupTargets", () => {
  it("aponta specs/falhas/massa e nao credenciais", () => {
    const paths = generatedCleanupTargets("/tmp/proj");
    const norm = paths.map((p) => p.replace(/\\/g, "/"));
    assert.ok(norm.some((p) => p.endsWith("/scripts/tests")));
    assert.ok(norm.some((p) => p.endsWith("/scripts/falhas")));
    assert.ok(norm.some((p) => p.endsWith("/massa/dados.json")));
    assert.ok(!norm.some((p) => /credenciais/i.test(p)));
    assert.ok(!norm.some((p) => p.endsWith("/escopo.json")));
  });
});

describe("workspacePathFor", () => {
  it("projeto nomeado vai para data/projects", () => {
    const p = workspacePathFor("Portal-Rural").replace(/\\/g, "/");
    assert.match(p, /data\/projects\/Portal-Rural$/);
  });
});

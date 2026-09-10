import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolve } from "node:path";
import { parseReqSource, projectSlugFromReqInput, looksLikeGitReqs } from "./req-source.ts";

describe("parseReqSource", () => {
  it("aceita pasta local", () => {
    const input = resolve("docs", "Portal-Rural", "requisitos");
    const s = parseReqSource(input);
    assert.equal(s.kind, "local");
    if (s.kind === "local") assert.equal(s.path, input);
    assert.equal(projectSlugFromReqInput(input), "Portal-Rural");
  });

  it("parseia GitHub tree com pasta", () => {
    const s = parseReqSource("https://github.com/org/Portal-Rural/tree/main/docs/requisitos");
    assert.equal(s.kind, "git");
    if (s.kind !== "git") return;
    assert.equal(s.cloneUrl, "https://github.com/org/Portal-Rural.git");
    assert.equal(s.ref, "main");
    assert.equal(s.subdir, "docs/requisitos");
    assert.equal(s.repo, "Portal-Rural");
    assert.equal(projectSlugFromReqInput(s.original), "Portal-Rural");
  });

  it("parseia GitHub blob usando a pasta do arquivo", () => {
    const s = parseReqSource("https://github.com/org/repo/blob/develop/docs/US.md");
    assert.equal(s.kind, "git");
    if (s.kind !== "git") return;
    assert.equal(s.ref, "develop");
    assert.equal(s.subdir, "docs");
  });

  it("parseia Gitea src/branch", () => {
    const s = parseReqSource("https://gitea.example.com/acme/app/src/branch/main/requisitos");
    assert.equal(s.kind, "git");
    if (s.kind !== "git") return;
    assert.equal(s.cloneUrl, "https://gitea.example.com/acme/app.git");
    assert.equal(s.ref, "main");
    assert.equal(s.subdir, "requisitos");
  });

  it("parseia Azure DevOps path e branch", () => {
    const s = parseReqSource(
      "https://dev.azure.com/org/proj/_git/Portal-Rural?path=/docs/requisitos&version=GBmain",
    );
    assert.equal(s.kind, "git");
    if (s.kind !== "git") return;
    assert.equal(s.cloneUrl, "https://dev.azure.com/org/proj/_git/Portal-Rural");
    assert.equal(s.ref, "main");
    assert.equal(s.subdir, "docs/requisitos");
    assert.equal(s.repo, "Portal-Rural");
  });

  it("parseia GitLab grupo aninhado com /-/tree/", () => {
    const s = parseReqSource("https://gitlab.com/group/sub/app/-/tree/main/docs/us");
    assert.equal(s.kind, "git");
    if (s.kind !== "git") return;
    assert.equal(s.cloneUrl, "https://gitlab.com/group/sub/app.git");
    assert.equal(s.ref, "main");
    assert.equal(s.subdir, "docs/us");
    assert.equal(s.repo, "app");
  });

  it("parseia Bitbucket src", () => {
    const s = parseReqSource("https://bitbucket.org/ws/app/src/main/requisitos");
    assert.equal(s.kind, "git");
    if (s.kind !== "git") return;
    assert.equal(s.cloneUrl, "https://bitbucket.org/ws/app.git");
    assert.equal(s.ref, "main");
    assert.equal(s.subdir, "requisitos");
  });

  it("aceita clone URL + pasta extra", () => {
    const s = parseReqSource("https://github.com/org/repo.git docs/requisitos");
    assert.equal(s.kind, "git");
    if (s.kind !== "git") return;
    assert.equal(s.subdir, "docs/requisitos");
  });

  it("aceita ssh", () => {
    const s = parseReqSource("git@github.com:org/repo.git");
    assert.equal(s.kind, "git");
    if (s.kind !== "git") return;
    assert.equal(s.cloneUrl, "git@github.com:org/repo.git");
    assert.equal(s.repo, "repo");
  });

  it("looksLikeGitReqs distingue URL de path", () => {
    assert.equal(looksLikeGitReqs("https://github.com/a/b"), true);
    assert.equal(looksLikeGitReqs("D:\\docs\\reqs"), false);
  });
});

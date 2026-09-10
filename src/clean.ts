import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.ts";
import { applyProject, listProjectSlugs, workspacePathFor } from "./projects.ts";
import { ensureWorkspace } from "./workspace.ts";

const SETUP_KEEP = /^_example\.setup\.ts$/i;

/** Caminhos gerados pelo agente (não inclui credenciais nem escopo.json). */
export function generatedCleanupTargets(workspace: string): string[] {
  const scripts = join(workspace, "scripts");
  const massaSetups = join(scripts, "massa", "setups");
  const extraSetups: string[] = [];
  if (existsSync(massaSetups)) {
    for (const name of readdirSync(massaSetups)) {
      if (SETUP_KEEP.test(name)) continue;
      extraSetups.push(join(massaSetups, name));
    }
  }
  return [
    join(workspace, "requisitos"),
    join(workspace, "session.json"),
    join(scripts, "tests"),
    join(scripts, "falhas"),
    join(scripts, "cobertura.json"),
    join(scripts, "massa", "dados.json"),
    join(scripts, "massa", "dados.md"),
    join(scripts, "massa", "manifest.json"),
    join(scripts, ".auth"),
    join(workspace, "test-results"),
    join(workspace, "playwright-report"),
    ...extraSetups,
  ];
}

export type CleanResult = {
  slug: string;
  workspace: string;
  removed: string[];
};

function rmIfExists(path: string): boolean {
  if (!existsSync(path)) return false;
  rmSync(path, { recursive: true, force: true });
  return true;
}

export function cleanWorkspace(workspace: string, slug: string): CleanResult {
  const removed: string[] = [];
  for (const path of generatedCleanupTargets(workspace)) {
    if (rmIfExists(path)) removed.push(path);
  }
  return { slug, workspace, removed };
}

export function cleanCurrentProject(): CleanResult {
  const slug = config.projectSlug || "default";
  const workspace = config.workspaceDir;
  const result = cleanWorkspace(workspace, slug);
  applyProject(slug);
  ensureWorkspace();
  return result;
}

export function cleanAllProjects(): CleanResult[] {
  const slugs = new Set(listProjectSlugs());
  slugs.add(config.projectSlug || "default");
  const results: CleanResult[] = [];
  for (const slug of slugs) {
    const workspace = workspacePathFor(slug);
    if (!existsSync(workspace)) continue;
    const result = cleanWorkspace(workspace, slug);
    applyProject(slug);
    ensureWorkspace();
    results.push(result);
  }
  const runs = join(config.dataDir, "runs");
  if (existsSync(runs) && statSync(runs).isDirectory()) {
    rmSync(runs, { recursive: true, force: true });
    results.push({ slug: "(runs)", workspace: runs, removed: [runs] });
  }
  applyProject(config.projectSlug || "default");
  ensureWorkspace();
  return results;
}

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.ts";
import { projectSlugFromPath, slugifyProject } from "./project-name.ts";
import { saveSettings, loadSettings } from "./settings.ts";

export function argvFlag(argv: string[], name: string): boolean {
  return argv.includes(`--${name}`) || argv.includes(`-${name}`);
}

export function argvValue(argv: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const eq = argv.find((a) => a.startsWith(prefix));
  if (eq) return eq.slice(prefix.length).trim() || undefined;
  const i = argv.indexOf(`--${name}`);
  const next = i >= 0 ? argv[i + 1] : undefined;
  if (next && !next.startsWith("-")) return next.trim();
  return undefined;
}

export function projectsDir(): string {
  return config.projectsDir;
}

export function legacyWorkspaceDir(): string {
  return join(config.dataDir, "workspace");
}

export function workspacePathFor(slug: string): string {
  const clean = slugifyProject(slug);
  const modern = join(config.projectsDir, clean);
  const legacy = legacyWorkspaceDir();
  if (clean === "default" && !existsSync(modern) && existsSync(join(legacy, "scripts"))) {
    return legacy;
  }
  return modern;
}

let pinned = false;

export function applyProject(slug: string): string {
  const clean = slugifyProject(slug);
  config.projectSlug = clean;
  config.workspaceDir = workspacePathFor(clean);
  pinned = true;
  return clean;
}

/** --project, QA_PROJECT, settings.project, pasta dos requisitos, senão default. */
export function resolveProjectSlug(opts?: {
  argv?: string[];
  env?: NodeJS.ProcessEnv;
}): string {
  const argv = opts?.argv ?? process.argv;
  const env = opts?.env ?? process.env;
  const fromArg = argvValue(argv, "project");
  if (fromArg) return slugifyProject(fromArg);
  const fromEnv = (env.QA_PROJECT ?? "").trim();
  if (fromEnv) return slugifyProject(fromEnv);
  const settings = loadSettings();
  if (settings.project?.trim()) return slugifyProject(settings.project);
  if (settings.requisitosPath?.trim()) return projectSlugFromPath(settings.requisitosPath);
  return "default";
}

export function applyResolvedProject(argv = process.argv): string {
  if (pinned) return config.projectSlug;
  const fromArg = argvValue(argv, "project");
  const slug = applyProject(resolveProjectSlug({ argv }));
  if (fromArg) {
    saveSettings({ ...loadSettings(), project: slug });
  }
  return slug;
}

export function listProjectSlugs(): string[] {
  const dir = projectsDir();
  const out: string[] = [];
  if (existsSync(dir)) {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) out.push(name);
    }
  }
  const legacy = join(legacyWorkspaceDir(), "scripts");
  if (existsSync(legacy) && !out.includes("default")) out.push("default");
  return out.sort((a, b) => a.localeCompare(b));
}

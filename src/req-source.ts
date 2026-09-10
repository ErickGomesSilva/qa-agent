import { createHash } from "node:crypto";
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { projectSlugFromPath, slugifyProject } from "./project-name.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export type GitReqSource = {
  kind: "git";
  cloneUrl: string;
  ref: string;
  subdir: string;
  repo: string;
  host: string;
  original: string;
};

export type LocalReqSource = {
  kind: "local";
  path: string;
  original: string;
};

export type ReqSource = GitReqSource | LocalReqSource;

export function looksLikeGitReqs(raw: string): boolean {
  const s = splitReqInput(raw).primary.trim();
  if (/^git@/i.test(s) || /^ssh:\/\//i.test(s) || /^git\+https?:\/\//i.test(s)) return true;
  return /^https?:\/\//i.test(s);
}

export function splitReqInput(raw: string): { primary: string; extraSubdir: string } {
  const t = raw.trim().replace(/\s*\|\s*/g, " ");
  if (/^[a-zA-Z]:[\\/]/.test(t) || t.startsWith("\\\\")) {
    return { primary: t, extraSubdir: "" };
  }
  const m = t.match(/^(git@\S+|ssh:\/\/\S+|git\+https?:\/\/\S+|https?:\/\/\S+)\s+(\S.*)$/i);
  if (m) {
    return {
      primary: m[1]!,
      extraSubdir: m[2]!.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""),
    };
  }
  return { primary: t, extraSubdir: "" };
}

export function parseReqSource(raw: string): ReqSource {
  const original = raw.trim();
  if (!original) throw new Error("Informe a pasta de requisitos ou a URL do repositório");
  const { primary, extraSubdir } = splitReqInput(original);
  if (!looksLikeGitReqs(primary)) {
    const path = isAbsolute(primary) ? primary : join(process.cwd(), primary);
    return { kind: "local", path, original };
  }
  const git = parseGitUrl(primary);
  if (extraSubdir) git.subdir = joinPosix(git.subdir, extraSubdir);
  git.original = original;
  return git;
}

export function projectSlugFromReqInput(raw: string): string {
  const src = parseReqSource(raw);
  if (src.kind === "local") return projectSlugFromPath(src.path);
  return slugifyProject(src.repo);
}

/** Pasta local com os .md (clone/atualiza se for git). */
export function materializeRequisitos(raw: string, opts?: { update?: boolean }): string {
  const src = parseReqSource(raw);
  if (src.kind === "local") {
    if (!existsSync(src.path) || !statSync(src.path).isDirectory()) {
      throw new Error(`Pasta de requisitos inválida: ${src.path}`);
    }
    return src.path;
  }
  return checkoutGitReqs(src, opts?.update !== false);
}

export function redactGitText(text: string): string {
  return text
    .replace(/\/\/[^/\s:@]+:[^@\s]+@/g, "//***:***@")
    .replace(/x-access-token:[^@\s]+/gi, "x-access-token:***");
}

function parseGitUrl(primary: string): GitReqSource {
  const ssh = parseSsh(primary);
  if (ssh) return ssh;
  let href = primary.replace(/^git\+https?:\/\//i, (m) => m.replace(/^git\+/i, ""));
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    throw new Error(`URL de repositório inválida: ${primary}`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(`URL de repositório inválida: ${primary}`);
  }
  const azure = parseAzure(u);
  if (azure) return azure;
  const gitlab = parseGitLab(u);
  if (gitlab) return gitlab;
  const gitlabRoot = parseGitLabRoot(u);
  if (gitlabRoot) return gitlabRoot;
  const bitbucket = parseBitbucket(u);
  if (bitbucket) return bitbucket;
  const giteaSrc = parseGiteaSrc(u);
  if (giteaSrc) return giteaSrc;
  const gh = parseGithubLike(u);
  if (gh) return gh;
  return genericHttps(u);
}

function parseSsh(primary: string): GitReqSource | null {
  const m = primary.match(/^git@([^:]+):(.+?)(?:\.git)?$/i);
  if (!m) return null;
  const host = m[1]!;
  const repoPath = m[2]!.replace(/\/+$/g, "");
  const repo = repoPath.split("/").filter(Boolean).pop() ?? "repo";
  return {
    kind: "git",
    cloneUrl: `git@${host}:${repoPath}.git`,
    ref: "HEAD",
    subdir: "",
    repo,
    host,
    original: primary,
  };
}

function parseAzure(u: URL): GitReqSource | null {
  const host = u.hostname.toLowerCase();
  const isVs = host.endsWith(".visualstudio.com");
  const isDev = host === "dev.azure.com" || host.endsWith(".dev.azure.com");
  if (!isVs && !isDev) return null;
  const parts = u.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const gitIdx = parts.findIndex((p) => p === "_git");
  if (gitIdx < 1 || !parts[gitIdx + 1]) return null;
  const repo = parts[gitIdx + 1]!.replace(/\.git$/i, "");
  const origin = `${u.protocol}//${u.host}`;
  const clonePath = parts.slice(0, gitIdx + 2).join("/");
  const cloneUrl = `${origin}/${clonePath}`;
  let ref = "HEAD";
  const version = u.searchParams.get("version") ?? "";
  if (/^GB/i.test(version)) ref = version.slice(2);
  else if (/^GT/i.test(version)) ref = version.slice(2);
  else if (/^GC/i.test(version)) ref = version.slice(2);
  const pathQ = (u.searchParams.get("path") ?? "").replace(/\\/g, "/");
  let subdir = pathQ.replace(/^\/+/, "").replace(/\/+$/, "");
  if (subdir && /\.[a-z0-9]+$/i.test(subdir.split("/").pop() ?? "")) {
    subdir = parentPosix(subdir);
  }
  return { kind: "git", cloneUrl, ref, subdir, repo, host, original: u.toString() };
}

function parseGitLab(u: URL): GitReqSource | null {
  const parts = u.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const dash = parts.indexOf("-");
  if (dash < 2) return null;
  const kind = parts[dash + 1];
  if (kind !== "tree" && kind !== "blob") return null;
  const repoParts = parts.slice(0, dash);
  const repo = (repoParts[repoParts.length - 1] ?? "repo").replace(/\.git$/i, "");
  const ref = parts[dash + 2] ? decodeURIComponent(parts[dash + 2]!) : "HEAD";
  let subdir = parts.slice(dash + 3).join("/");
  if (kind === "blob") subdir = parentPosix(subdir);
  const cloneUrl = `${u.protocol}//${u.host}/${repoParts.join("/")}.git`;
  return { kind: "git", cloneUrl, ref, subdir, repo, host: u.hostname, original: u.toString() };
}

function parseGitLabRoot(u: URL): GitReqSource | null {
  if (!u.hostname.toLowerCase().includes("gitlab")) return null;
  const parts = u.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts.length < 2 || parts.includes("-")) return null;
  const repo = (parts[parts.length - 1] ?? "repo").replace(/\.git$/i, "");
  const cloneUrl = `${u.protocol}//${u.host}/${parts.map((p) => p.replace(/\.git$/i, "")).join("/")}.git`;
  return { kind: "git", cloneUrl, ref: "HEAD", subdir: "", repo, host: u.hostname, original: u.toString() };
}

function parseBitbucket(u: URL): GitReqSource | null {
  const host = u.hostname.toLowerCase();
  if (!host.includes("bitbucket")) return null;
  const parts = u.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts.length < 2) return null;
  const workspace = parts[0]!;
  const repo = parts[1]!.replace(/\.git$/i, "");
  let ref = "HEAD";
  let subdir = "";
  if (parts[2] === "src" && parts[3]) {
    ref = parts[3]!;
    subdir = parts.slice(4).join("/");
  } else if (parts[2] === "branch" && parts[3]) {
    ref = parts[3]!;
  }
  const cloneUrl = `${u.protocol}//${u.host}/${workspace}/${repo}.git`;
  return { kind: "git", cloneUrl, ref, subdir, repo, host, original: u.toString() };
}

function parseGiteaSrc(u: URL): GitReqSource | null {
  const parts = u.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts.length < 5 || parts[2] !== "src") return null;
  if (parts[3] !== "branch" && parts[3] !== "tag" && parts[3] !== "commit") return null;
  const owner = parts[0]!;
  const repo = parts[1]!.replace(/\.git$/i, "");
  const ref = parts[4] ?? "HEAD";
  const subdir = parts.slice(5).join("/");
  const cloneUrl = `${u.protocol}//${u.host}/${owner}/${repo}.git`;
  return { kind: "git", cloneUrl, ref, subdir, repo, host: u.hostname, original: u.toString() };
}

function parseGithubLike(u: URL): GitReqSource | null {
  const parts = u.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts.length < 2) return null;
  if (parts[0] === "-" || parts.includes("_git")) return null;
  const owner = parts[0]!;
  const repo = parts[1]!.replace(/\.git$/i, "");
  let ref = "HEAD";
  let subdir = "";
  const verb = parts[2];
  if (verb === "tree" || verb === "blob") {
    ref = parts[3] ?? "HEAD";
    subdir = parts.slice(4).join("/");
    if (verb === "blob") subdir = parentPosix(subdir);
  } else if (verb === "commit" && parts[3]) {
    ref = parts[3]!;
  }
  const cloneUrl = `${u.protocol}//${u.host}/${owner}/${repo}.git`;
  return { kind: "git", cloneUrl, ref, subdir, repo, host: u.hostname, original: u.toString() };
}

function genericHttps(u: URL): GitReqSource {
  const parts = u.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const last = (parts[parts.length - 1] ?? "repo").replace(/\.git$/i, "");
  let pathname = u.pathname.replace(/\/+$/, "");
  if (!pathname.endsWith(".git")) pathname += ".git";
  return {
    kind: "git",
    cloneUrl: `${u.protocol}//${u.host}${pathname}`,
    ref: "HEAD",
    subdir: "",
    repo: last.replace(/\.git$/i, ""),
    host: u.hostname,
    original: u.toString(),
  };
}

function checkoutGitReqs(src: GitReqSource, update: boolean): string {
  ensureGit();
  const dest = gitCacheDir(src);
  mkdirSync(dirname(dest), { recursive: true });
  const url = authenticatedCloneUrl(src.cloneUrl, src.host);
  if (!existsSync(join(dest, ".git"))) {
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
    cloneRepo(url, dest, src);
  } else if (update) {
    fetchRepo(dest, url, src.ref);
  }
  return pickReqsDir(dest, src.subdir);
}

function cloneRepo(url: string, dest: string, src: GitReqSource): void {
  const args = ["clone", "--depth", "1"];
  if (src.subdir) args.push("--filter=blob:none", "--sparse");
  if (src.ref && src.ref !== "HEAD") args.push("--branch", src.ref);
  args.push(url, dest);
  runGit(args, undefined);
  if (src.subdir) {
    runGit(["-C", dest, "sparse-checkout", "set", "--cone", src.subdir.replace(/\\/g, "/")]);
  }
}

function fetchRepo(dest: string, url: string, ref: string): void {
  runGit(["-C", dest, "remote", "set-url", "origin", url]);
  const fetchArgs = ["-C", dest, "fetch", "--depth", "1", "origin"];
  if (ref && ref !== "HEAD") fetchArgs.push(ref);
  else fetchArgs.push("HEAD");
  runGit(fetchArgs);
  runGit(["-C", dest, "checkout", "--force", "FETCH_HEAD"]);
}

function pickReqsDir(repoRoot: string, subdir: string): string {
  if (subdir) {
    const p = join(repoRoot, ...subdir.split("/").filter(Boolean));
    if (!existsSync(p)) {
      throw new Error(`Pasta '${subdir}' não existe no repositório clonado`);
    }
    if (statSync(p).isDirectory()) return p;
    return dirname(p);
  }
  const named = join(repoRoot, "requisitos");
  if (existsSync(named) && statSync(named).isDirectory()) return named;
  return repoRoot;
}

function gitCacheDir(src: GitReqSource): string {
  const id = createHash("sha1").update(src.cloneUrl).digest("hex").slice(0, 12);
  return join(ROOT, "data", "cache", "git", `${slugifyProject(src.repo)}-${id}`);
}

function authenticatedCloneUrl(cloneUrl: string, host: string): string {
  if (/^git@/i.test(cloneUrl) || /^ssh:\/\//i.test(cloneUrl)) return cloneUrl;
  const token = tokenForHost(host);
  if (!token) return cloneUrl;
  try {
    const u = new URL(cloneUrl);
    const h = u.hostname.toLowerCase();
    if (h === "github.com" || h.endsWith(".ghe.com") || h.includes("github")) {
      u.username = "x-access-token";
      u.password = token;
    } else if (h.includes("gitlab")) {
      u.username = "oauth2";
      u.password = token;
    } else if (h.includes("dev.azure.com") || h.endsWith("visualstudio.com")) {
      u.username = "pat";
      u.password = token;
    } else if (h.includes("bitbucket")) {
      u.username = "x-token-auth";
      u.password = token;
    } else {
      u.username = "oauth2";
      u.password = token;
    }
    return u.toString();
  } catch {
    return cloneUrl;
  }
}

function tokenForHost(host: string): string {
  const e = process.env;
  const central = (e.QA_GIT_TOKEN ?? "").trim();
  if (central) return central;
  const h = host.toLowerCase();
  if (h.includes("github")) return (e.GITHUB_TOKEN ?? e.GH_TOKEN ?? "").trim();
  if (h.includes("gitlab")) return (e.GITLAB_TOKEN ?? "").trim();
  if (h.includes("azure") || h.includes("visualstudio")) {
    return (e.AZURE_DEVOPS_PAT ?? e.SYSTEM_ACCESSTOKEN ?? "").trim();
  }
  if (h.includes("bitbucket")) return (e.BITBUCKET_TOKEN ?? "").trim();
  return (e.GITEA_TOKEN ?? "").trim();
}

function ensureGit(): void {
  const r = spawnSync("git", ["--version"], { encoding: "utf8", windowsHide: true });
  if (r.status !== 0) {
    throw new Error("Git não está no PATH. Instale o Git para usar requisitos de repositório remoto.");
  }
}

function runGit(args: string[], cwd?: string): void {
  const r = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  if (r.status !== 0) {
    const err = redactGitText((r.stderr || r.stdout || "git falhou").trim());
    throw new Error(err || "git falhou");
  }
}

function joinPosix(a: string, b: string): string {
  return [a, b].filter(Boolean).join("/").replace(/\/+/g, "/");
}

function parentPosix(p: string): string {
  const parts = p.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

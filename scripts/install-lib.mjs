/**
 * Lógica compartilhada de instalação/desinstalação (Windows + Linux + macOS).
 */
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(__dirname, "..");
export const BIN_DIR = join(ROOT, "bin");
export const DISPLAY_NAME = "QA Agent";
export const MIN_NODE = [22, 13, 0];

const CLI_ENTRIES = [
  { name: "qaagent", entry: "src/index.ts", args: [] },
  { name: "qaagent-audit", entry: "src/audit-cli.ts", args: [] },
  { name: "qaagent-reports", entry: "src/reports-cli.ts", args: [] },
  { name: "qaagent-k6", entry: "src/k6-cli.ts", args: [] },
  { name: "qaagent-deepen", entry: "src/deepen-cli.ts", args: [] },
  { name: "qaagent-unblock", entry: "src/unblock-cli.ts", args: [] },
  { name: "qaagent-massa", entry: "src/massa-cli.ts", args: [] },
  { name: "qaagent-tour", entry: "src/tour-cli.ts", args: [] },
];

const PATH_MARKER_START = "# >>> qa-agent PATH >>>";
const PATH_MARKER_END = "# <<< qa-agent PATH <<<";

export function packageVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    return String(pkg.version ?? "?");
  } catch {
    return "?";
  }
}

export function parseNodeVersion(raw) {
  const parts = String(raw).trim().split(".").map((n) => Number(n) || 0);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

export function nodeVersionOk() {
  const raw = process.versions.node;
  const [maj, min, patch] = parseNodeVersion(raw);
  const [needMaj, needMin, needPatch] = MIN_NODE;
  if (maj !== needMaj) return maj > needMaj;
  if (min !== needMin) return min > needMin;
  return patch >= needPatch;
}

export function run(cmd, args, opts = {}) {
  const win = process.platform === "win32";
  const { shell: shellOpt, ...rest } = opts;
  const useShell = shellOpt ?? win;
  const file = useShell && /\s/.test(cmd) ? `"${cmd}"` : cmd;
  const res = spawnSync(file, args, {
    cwd: ROOT,
    stdio: "inherit",
    shell: useShell,
    ...rest,
  });
  if (res.error) throw res.error;
  return res.status ?? 1;
}

export function runNodeScript(relativePath, extraArgs = []) {
  const tsx = join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
  return run(process.execPath, [tsx, join(ROOT, relativePath), ...extraArgs], { shell: false });
}

function unixWrapperContent(entryRel) {
  return `#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "\${BASH_SOURCE[0]}")/.." && pwd)"
exec node "$ROOT/node_modules/tsx/dist/cli.mjs" "$ROOT/${entryRel.replace(/\\/g, "/")}" "$@"
`;
}

/** Cria bin/qaagent, bin/qaagent-audit, … (sem extensão) para Linux/macOS. */
export function ensureUnixBinWrappers() {
  if (process.platform === "win32") return;
  for (const { name, entry } of CLI_ENTRIES) {
    const target = join(BIN_DIR, name);
    writeFileSync(target, unixWrapperContent(entry), { encoding: "utf8", mode: 0o755 });
    try {
      chmodSync(target, 0o755);
    } catch {
      /* ignore on FS without chmod */
    }
  }
}

function profileCandidates() {
  const home = homedir();
  const shells = [];
  if (process.env.SHELL?.includes("zsh")) shells.push(join(home, ".zshrc"));
  shells.push(join(home, ".bashrc"));
  shells.push(join(home, ".profile"));
  return [...new Set(shells.filter((p) => existsSync(p)))];
}

function pathBlock() {
  const bin = BIN_DIR.replace(/\\/g, "/");
  return `${PATH_MARKER_START}
export QA_AGENT_ROOT="${ROOT.replace(/\\/g, "/")}"
export PATH="$QA_AGENT_ROOT/bin:$PATH"
${PATH_MARKER_END}
`;
}

/** Adiciona bin/ ao PATH via bloco marcado em ~/.bashrc / ~/.zshrc / ~/.profile */
export function addUnixPathToProfile() {
  const block = pathBlock();
  const candidates = profileCandidates();
  let target = candidates[0];
  if (!target) {
    target = join(homedir(), ".bashrc");
    if (!existsSync(target)) writeFileSync(target, "", "utf8");
  }
  const content = existsSync(target) ? readFileSync(target, "utf8") : "";
  if (content.includes(PATH_MARKER_START)) {
    return { added: false, profile: target };
  }
  const sep = content.length && !content.endsWith("\n") ? "\n" : "";
  writeFileSync(target, content + sep + "\n" + block + "\n", "utf8");
  return { added: true, profile: target };
}

export function removeUnixPathFromProfile() {
  for (const profile of profileCandidates()) {
    if (!existsSync(profile)) continue;
    const content = readFileSync(profile, "utf8");
    if (!content.includes(PATH_MARKER_START)) continue;
    const re = new RegExp(
      `\\n?${PATH_MARKER_START}[\\s\\S]*?${PATH_MARKER_END}\\n?`,
      "g",
    );
    writeFileSync(profile, content.replace(re, "\n").replace(/\n{3,}/g, "\n\n"), "utf8");
  }
}

/** Symlinks em ~/.local/bin (quando existir ou puder ser criado). */
export function symlinkUnixCommands() {
  const localBin = join(homedir(), ".local", "bin");
  mkdirSync(localBin, { recursive: true });
  for (const { name } of CLI_ENTRIES) {
    const src = join(BIN_DIR, name);
    const dest = join(localBin, name);
    if (existsSync(dest)) {
      try {
        unlinkSync(dest);
      } catch {
        /* ignore */
      }
    }
    try {
      symlinkSync(src, dest);
    } catch {
      /* PATH via profile basta */
    }
  }
  return localBin;
}

export function removeUnixSymlinks() {
  const localBin = join(homedir(), ".local", "bin");
  if (!existsSync(localBin)) return;
  for (const { name } of CLI_ENTRIES) {
    const dest = join(localBin, name);
    if (!existsSync(dest)) continue;
    try {
      unlinkSync(dest);
    } catch {
      /* ignore */
    }
  }
}

/** PATH do usuário no Windows (sem admin). */
export function addWindowsUserPath() {
  if (process.platform !== "win32") return false;
  const ps = `
$bin = '${BIN_DIR.replace(/'/g, "''")}'
$current = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($null -eq $current) { $current = '' }
$parts = @($current -split ';' | Where-Object { $_ -and $_.Trim() })
$norm = $bin.TrimEnd('\\')
$exists = $parts | Where-Object { $_.TrimEnd('\\') -ieq $norm }
if (-not $exists) {
  $parts += $norm
  [Environment]::SetEnvironmentVariable('Path', ($parts -join ';'), 'User')
  'added'
} else { 'exists' }
`.trim();
  const res = spawnSync(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
    { encoding: "utf8" },
  );
  const out = (res.stdout ?? "").trim();
  return out === "added";
}

export function removeWindowsUserPath() {
  if (process.platform !== "win32") return;
  const ps = `
$bin = '${BIN_DIR.replace(/'/g, "''")}'
$current = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($null -eq $current) { exit 0 }
$norm = $bin.TrimEnd('\\')
$parts = @($current -split ';' | Where-Object { $_ -and ($_.TrimEnd('\\') -ine $norm) })
[Environment]::SetEnvironmentVariable('Path', ($parts -join ';'), 'User')
`.trim();
  spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps], {
    stdio: "inherit",
  });
}

export function createWindowsStartMenuShortcuts() {
  if (process.platform !== "win32") return;
  const psPath = join(ROOT, "scripts", "windows-start-menu.ps1");
  if (!existsSync(psPath)) return;
  run("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", psPath], { shell: false });
}

export function removeWindowsStartMenuShortcuts() {
  if (process.platform !== "win32") return;
  const ps = `
$DisplayName = '${DISPLAY_NAME.replace(/'/g, "''")}'
$programs = Join-Path $env:APPDATA "Microsoft\\Windows\\Start Menu\\Programs\\$DisplayName"
if (Test-Path $programs) { Remove-Item -Recurse -Force $programs }
`.trim();
  spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps], {
    stdio: "ignore",
  });
}

export function writeChromiumMarker() {
  const marker = join(ROOT, "data", "workspace", ".chromium-ok");
  mkdirSync(dirname(marker), { recursive: true });
  writeFileSync(marker, new Date().toISOString() + "\n", "utf8");
}

export function platformLabel() {
  if (process.platform === "win32") return "Windows";
  if (process.platform === "darwin") return "macOS";
  return "Linux";
}

export const CLI_HELP = CLI_ENTRIES.map((c) => c.name);

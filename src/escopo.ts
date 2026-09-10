import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.ts";
import { scriptsDir } from "./workspace.ts";

export type EscopoModo = "geral" | "focado";

export type RunEscopo = {
  modo: EscopoModo;
  labels: string[];
  paths: string[];
};

function splitList(raw: string): string[] {
  return raw
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function asModo(raw: unknown): EscopoModo {
  return String(raw ?? "").trim().toLowerCase() === "focado" ? "focado" : "geral";
}

export function defaultEscopo(): RunEscopo {
  return { modo: "geral", labels: [], paths: [] };
}

/** Lê `scripts/escopo.json` e/ou env `QA_ESCOPO_*`. Env ganha do arquivo nos campos preenchidos. */
export function loadRunEscopo(dir = scriptsDir()): RunEscopo {
  const fileName = config.escopoFile.trim();
  const candidates = [
    fileName ? (fileName.includes("/") || fileName.includes("\\") ? fileName : join(dir, fileName)) : "",
    join(dir, "escopo.json"),
  ].filter(Boolean);

  let fromFile: Partial<RunEscopo> = {};
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
      const labelsRaw = raw.labels ?? raw.perfis;
      const pathsRaw = raw.paths ?? raw.rotas;
      fromFile = {
        modo: asModo(raw.modo ?? raw.mode),
        labels: Array.isArray(labelsRaw) ? labelsRaw.map(String).map((s) => s.trim()).filter(Boolean) : [],
        paths: Array.isArray(pathsRaw) ? pathsRaw.map(String).map((s) => s.trim()).filter(Boolean) : [],
      };
      break;
    } catch {
      fromFile = {};
    }
  }

  const envModo = config.escopoModo.trim();
  const envLabels = splitList(config.escopoLabels);
  const envPaths = splitList(config.escopoPaths);

  const modo = envModo ? asModo(envModo) : (fromFile.modo ?? "geral");
  const labels = envLabels.length ? envLabels : (fromFile.labels ?? []);
  const paths = envPaths.length ? envPaths : (fromFile.paths ?? []);

  if (modo === "geral" && !envModo && !fromFile.modo && (labels.length || paths.length)) {
    return { modo: "focado", labels, paths };
  }
  return { modo, labels, paths };
}

export function filterAccessesByEscopo<T extends { label?: string }>(accesses: T[], escopo: RunEscopo): T[] {
  if (escopo.modo !== "focado" || escopo.labels.length === 0) return accesses;
  const want = new Set(escopo.labels.map((l) => l.toLowerCase()));
  const hit = accesses.filter((a) => a.label && want.has(a.label.toLowerCase()));
  return hit.length ? hit : accesses;
}

export function pathInEscopo(pathname: string, escopo: RunEscopo): boolean {
  if (escopo.modo !== "focado" || escopo.paths.length === 0) return true;
  const p = pathname.split("?")[0] ?? pathname;
  return escopo.paths.some((prefix) => p === prefix || p.startsWith(prefix));
}

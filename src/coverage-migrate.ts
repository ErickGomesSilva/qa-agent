import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CoverageCase, CoverageFile, CoverageNivel } from "./coverage-types.ts";
import { scriptsDir } from "./workspace.ts";

export function coberturaPath(): string {
  return join(scriptsDir(), "cobertura.json");
}

export function nivelToCoberto(nivel: CoverageNivel): boolean {
  return nivel === "real" || nivel === "api";
}

export function inferNivelFromLegacy(c: CoverageCase): CoverageNivel {
  if (c.nivel) return c.nivel;
  if (!c.coberto) {
    if (c.motivo === "sem-ui" || /sem-ui|sem superf/i.test(c.motivo)) return "sem-ui";
    return "sem-ui";
  }
  return "real";
}

export function normalizeCase(c: CoverageCase): CoverageCase {
  const nivel = inferNivelFromLegacy(c);
  return {
    ...c,
    nivel,
    coberto: nivelToCoberto(nivel),
    motivo: c.motivo ?? "",
    massaNecessaria: c.massaNecessaria ?? "",
    assertEntao: c.assertEntao ?? (nivel === "real" || nivel === "api"),
    specPath: c.specPath ?? "",
  };
}

export function loadCoverageFile(path = coberturaPath()): CoverageFile | null {
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as { casos?: CoverageCase[]; version?: number };
    const casos = (raw.casos ?? []).map(normalizeCase);
    const version: 1 | 2 = raw.version === 2 ? 2 : 2;
    return { version, casos };
  } catch {
    return null;
  }
}

export function saveCoverageFile(file: CoverageFile, path = coberturaPath()): void {
  writeFileSync(path, JSON.stringify({ version: 2, casos: file.casos }, null, 2), "utf8");
}

export function mergeAuditIntoCoverage(
  file: CoverageFile,
  updates: Map<string, Partial<CoverageCase>>,
): CoverageFile {
  const casos = file.casos.map((c) => {
    const key = `${c.us}:${c.ca}`;
    const patch = updates.get(key);
    if (!patch) return c;
    const nivel = (patch.nivel ?? c.nivel ?? "real") as CoverageNivel;
    return normalizeCase({
      ...c,
      ...patch,
      nivel,
      coberto: nivelToCoberto(nivel),
    });
  });
  return { version: 2, casos };
}

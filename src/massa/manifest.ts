import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SpecAuditFinding } from "../coverage-types.ts";
import type { MassaManifest, MassaManifestEntry } from "./types.ts";
import { scriptsDir } from "../workspace.ts";

export function manifestPath(): string {
  return join(scriptsDir(), "massa", "manifest.json");
}

export function loadMassaManifest(): MassaManifest {
  const path = manifestPath();
  if (!existsSync(path)) {
    return { version: 1, updatedAt: new Date().toISOString(), entries: [] };
  }
  try {
    return JSON.parse(readFileSync(path, "utf8")) as MassaManifest;
  } catch {
    return { version: 1, updatedAt: new Date().toISOString(), entries: [] };
  }
}

function parsePrecisa(motivo: string): string[] {
  const parts = motivo
    .replace(/^Requer massa\/perfil alternativo\s*[—-]\s*/i, "")
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : [motivo.trim()].filter(Boolean);
}

function inferPerfil(motivo: string): string | undefined {
  if (/sem perfil/i.test(motivo)) return "sem_perfil";
  if (/revogad/i.test(motivo)) return "revogado";
  if (/outro piloto/i.test(motivo)) return "outro_piloto";
  if (/revisor|validador|aprovador/i.test(motivo)) {
    const m = motivo.match(/(revisor|validador|aprovador[^\s,]*)/i);
    return m?.[1]?.toLowerCase();
  }
  return undefined;
}

export function entryFromFinding(f: SpecAuditFinding): MassaManifestEntry {
  const motivo = f.massaNecessaria ?? f.motivo;
  return {
    us: f.us,
    ca: f.ca,
    precisa: parsePrecisa(motivo),
    perfil: inferPerfil(motivo),
    motivo,
    specPath: f.specPath,
    status: "pendente",
  };
}

/** Sincroniza manifest a partir de achados skip-massa da auditoria. Preserva status desbloqueado. */
export function saveMassaManifest(manifest: MassaManifest): void {
  mkdirSync(join(scriptsDir(), "massa"), { recursive: true });
  writeFileSync(manifestPath(), JSON.stringify({ ...manifest, updatedAt: new Date().toISOString() }, null, 2), "utf8");
}

export function syncMassaManifest(findings: SpecAuditFinding[]): MassaManifest {
  const existing = loadMassaManifest();
  const byKey = new Map(existing.entries.map((e) => [`${e.us}:${e.ca}`, e]));

  for (const f of findings) {
    if (f.nivel !== "skip-massa") continue;
    const key = `${f.us}:${f.ca}`;
    const prev = byKey.get(key);
    const next = entryFromFinding(f);
    if (prev?.status === "desbloqueado" || prev?.status === "impossivel") {
      byKey.set(key, { ...next, status: prev.status });
    } else {
      byKey.set(key, next);
    }
  }

  const manifest: MassaManifest = {
    version: 1,
    updatedAt: new Date().toISOString(),
    entries: [...byKey.values()].sort((a, b) =>
      `${a.us}:${a.ca}`.localeCompare(`${b.us}:${b.ca}`),
    ),
  };

  mkdirSync(join(scriptsDir(), "massa"), { recursive: true });
  mkdirSync(join(scriptsDir(), "massa", "setups"), { recursive: true });
  writeFileSync(manifestPath(), JSON.stringify(manifest, null, 2), "utf8");
  return manifest;
}

export function manifestSummary(manifest: MassaManifest): {
  total: number;
  pendente: number;
  desbloqueado: number;
} {
  const pendente = manifest.entries.filter((e) => e.status === "pendente").length;
  const desbloqueado = manifest.entries.filter((e) => e.status === "desbloqueado").length;
  return { total: manifest.entries.length, pendente, desbloqueado };
}

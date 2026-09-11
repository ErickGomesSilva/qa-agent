import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.ts";
import type { RunEscopo } from "./escopo.ts";
import type { ExploreIssue, ExploreResult } from "./logic-explore.ts";
import {
  profileMapToExplore,
  runProfileMap,
  type ProfileMapFile,
} from "./profile-map.ts";
import { listRequirementCases } from "./req-sync.ts";
import { writeRoteiro, type RoteiroFile } from "./roteiro.ts";
import type { AccessCredential } from "./types.ts";
import { requisitosDestDir, scriptsDir } from "./workspace.ts";

export type MapFingerprintInput = {
  baseUrl: string;
  escopo: RunEscopo;
  f5: Array<{ label: string; login: string; authKind: string }>;
  crawlDepth: number;
};

export type RoteiroFingerprintInput = MapFingerprintInput & {
  casos: Array<{ us: string; ca: string; hash: string }>;
};

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

export function hashFingerprint(input: unknown): string {
  return createHash("sha256").update(stableStringify(input)).digest("hex").slice(0, 20);
}

export function buildMapFingerprintInput(opts: {
  baseUrl: string;
  escopo: RunEscopo;
  accesses: AccessCredential[];
}): MapFingerprintInput {
  return {
    baseUrl: opts.baseUrl.replace(/\/+$/, ""),
    escopo: {
      modo: opts.escopo.modo,
      labels: [...opts.escopo.labels].map((s) => s.trim()).filter(Boolean).sort(),
      paths: [...opts.escopo.paths].map((s) => s.trim()).filter(Boolean).sort(),
    },
    f5: opts.accesses.map((a, i) => ({
      label: (a.label?.trim() || `acesso-${i + 1}`).toLowerCase(),
      login: a.login.trim().toLowerCase(),
      authKind: a.authKind,
    })),
    crawlDepth: config.crawlDepth,
  };
}

export function buildRoteiroFingerprintInput(opts: {
  baseUrl: string;
  escopo: RunEscopo;
  accesses: AccessCredential[];
  reqDir?: string;
}): RoteiroFingerprintInput {
  const casos = listRequirementCases(opts.reqDir ?? requisitosDestDir())
    .map((c) => ({ us: c.us, ca: c.ca, hash: c.hash }))
    .sort((a, b) => `${a.us}:${a.ca}`.localeCompare(`${b.us}:${b.ca}`));
  return {
    ...buildMapFingerprintInput(opts),
    casos,
  };
}

function readJsonFile<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return undefined;
  }
}

export function mapFilePath(dir = scriptsDir()): string {
  return join(dir, "falhas", "MAPA-PERFIL.json");
}

export function roteiroFilePath(dir = scriptsDir()): string {
  return join(dir, "falhas", "ROTEIRO.json");
}

export function loadCachedMap(dir = scriptsDir()): ProfileMapFile | undefined {
  const map = readJsonFile<ProfileMapFile & { fingerprint?: string }>(mapFilePath(dir));
  if (!map?.perfis?.length) return undefined;
  return map;
}

export function loadCachedRoteiro(dir = scriptsDir()): (RoteiroFile & { fingerprint?: string }) | undefined {
  return readJsonFile<RoteiroFile & { fingerprint?: string }>(roteiroFilePath(dir));
}

export function loadExploreFromDisk(map: ProfileMapFile, dir = scriptsDir()): ExploreResult {
  const exploracao = readJsonFile<{ issues?: ExploreIssue[] }>(join(dir, "falhas", "EXPLORACAO.json"));
  const issues = Array.isArray(exploracao?.issues) ? exploracao!.issues! : [];
  return profileMapToExplore(map, issues);
}

export type MapRoteiroPlan =
  | { action: "reuse-both"; mapFp: string; roteiroFp: string }
  | { action: "reuse-map-rebuild-roteiro"; mapFp: string; roteiroFp: string; reason: string }
  | { action: "rebuild-all"; mapFp: string; roteiroFp: string; reason: string };

/** Decide se mapa/roteiro em disco ainda valem para os inputs atuais. */
export function planMapRoteiro(opts: {
  force: boolean;
  mapFp: string;
  roteiroFp: string;
  map?: (ProfileMapFile & { fingerprint?: string }) | undefined;
  roteiro?: (RoteiroFile & { fingerprint?: string }) | undefined;
}): MapRoteiroPlan {
  if (opts.force) {
    return { action: "rebuild-all", mapFp: opts.mapFp, roteiroFp: opts.roteiroFp, reason: "force/regenerate" };
  }
  const mapOk = Boolean(opts.map?.perfis?.length && opts.map.fingerprint === opts.mapFp);
  const roteiroOk = Boolean(opts.roteiro && opts.roteiro.fingerprint === opts.roteiroFp);
  if (mapOk && roteiroOk) {
    return { action: "reuse-both", mapFp: opts.mapFp, roteiroFp: opts.roteiroFp };
  }
  if (mapOk && !roteiroOk) {
    return {
      action: "reuse-map-rebuild-roteiro",
      mapFp: opts.mapFp,
      roteiroFp: opts.roteiroFp,
      reason: opts.roteiro ? "requisitos/escopo do roteiro mudaram" : "ROTEIRO.json ausente",
    };
  }
  return {
    action: "rebuild-all",
    mapFp: opts.mapFp,
    roteiroFp: opts.roteiroFp,
    reason: opts.map?.fingerprint
      ? "URL/F5/escopo/crawl mudaram (ou mapa sem fingerprint)"
      : "MAPA-PERFIL ausente ou vazio",
  };
}

export type EnsureMapRoteiroResult = {
  map: ProfileMapFile;
  explore: ExploreResult;
  roteiro: RoteiroFile;
  mapReused: boolean;
  roteiroReused: boolean;
};

/** Garante MAPA-PERFIL + ROTEIRO, reutilizando disco quando o fingerprint bate. */
export async function ensureMapAndRoteiro(opts: {
  baseUrl: string;
  accesses: AccessCredential[];
  allAccessesForLabels: AccessCredential[];
  escopo: RunEscopo;
  force: boolean;
  onLog: (line: string) => void;
}): Promise<EnsureMapRoteiroResult> {
  const mapInput = buildMapFingerprintInput({
    baseUrl: opts.baseUrl,
    escopo: opts.escopo,
    accesses: opts.accesses,
  });
  const roteiroInput = buildRoteiroFingerprintInput({
    baseUrl: opts.baseUrl,
    escopo: opts.escopo,
    accesses: opts.accesses,
  });
  const mapFp = hashFingerprint(mapInput);
  const roteiroFp = hashFingerprint(roteiroInput);
  const plan = planMapRoteiro({
    force: opts.force,
    mapFp,
    roteiroFp,
    map: loadCachedMap(),
    roteiro: loadCachedRoteiro(),
  });

  const f5Labels = opts.allAccessesForLabels.map((a, i) => a.label?.trim() || `acesso-${i + 1}`);
  const f5ProfileCount = opts.allAccessesForLabels.length;

  if (plan.action === "reuse-both") {
    const map = loadCachedMap()!;
    const roteiro = loadCachedRoteiro()!;
    opts.onLog(
      `mapa/roteiro reutilizados (fingerprint ok) — ${roteiro.linhas.length} linha(s); R regenerate força novo mapa`,
    );
    return {
      map,
      explore: loadExploreFromDisk(map),
      roteiro,
      mapReused: true,
      roteiroReused: true,
    };
  }

  if (plan.action === "reuse-map-rebuild-roteiro") {
    const map = loadCachedMap()!;
    opts.onLog(`mapa reutilizado; refazendo roteiro (${plan.reason})`);
    const roteiro = writeRoteiro({
      map,
      f5Labels,
      f5ProfileCount,
      escopo: opts.escopo,
      fingerprint: roteiroFp,
      onLog: opts.onLog,
    });
    return {
      map,
      explore: loadExploreFromDisk(map),
      roteiro,
      mapReused: true,
      roteiroReused: false,
    };
  }

  opts.onLog(`mapa/roteiro novos — ${plan.reason}`);
  const { map, explore } = await runProfileMap({
    baseUrl: opts.baseUrl,
    accesses: opts.accesses,
    escopo: opts.escopo,
    fingerprint: mapFp,
    onLog: opts.onLog,
  });
  const roteiro = writeRoteiro({
    map,
    f5Labels,
    f5ProfileCount,
    escopo: opts.escopo,
    fingerprint: roteiroFp,
    onLog: opts.onLog,
  });
  return { map, explore, roteiro, mapReused: false, roteiroReused: false };
}

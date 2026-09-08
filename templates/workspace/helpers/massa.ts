import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { MassaData, MassaDataEntry, MassaEntryStatus } from "./massa-types";

let cache: MassaData | undefined;
let cachePath: string | undefined;

function massaFilePath(): string {
  const fromEnv = (process.env.E2E_MASSA_FILE ?? "").trim();
  if (fromEnv) return fromEnv;
  return join(process.cwd(), "massa", "dados.json");
}

function parseStatus(raw: string | undefined): MassaEntryStatus {
  const v = (raw ?? "pendente").toLowerCase();
  if (v === "pronto" || v === "ready") return "pronto";
  if (v === "aplicado" || v === "applied") return "aplicado";
  if (v === "impossivel" || v === "impossible") return "impossivel";
  return "pendente";
}

function parseJson(text: string): MassaData {
  const parsed = JSON.parse(text) as { entries?: MassaDataEntry[] };
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    entries: Array.isArray(parsed.entries) ? parsed.entries : [],
  };
}

export function loadMassaData(force = false): MassaData {
  const path = massaFilePath();
  if (!force && cache && cachePath === path) return cache;
  if (!existsSync(path)) {
    cache = { version: 1, updatedAt: new Date().toISOString(), entries: [] };
    cachePath = path;
    return cache;
  }
  const text = readFileSync(path, "utf8");
  cache = path.toLowerCase().endsWith(".md") ? { version: 1, updatedAt: new Date().toISOString(), entries: [] } : parseJson(text);
  cachePath = path;
  return cache!;
}

export function findMassaEntry(us: string, ca: string): MassaDataEntry | undefined {
  const data = loadMassaData();
  return data.entries.find((e) => e.us === us && e.ca === ca);
}

/** CA tem massa pronta ou ja aplicada em runtime. */
export function hasMassa(us: string, ca: string): boolean {
  const entry = findMassaEntry(us, ca);
  return entry?.status === "pronto" || entry?.status === "aplicado";
}

/** Valor em entry.dados ou env E2E_MASSA_US_XXX_CAyy_CHAVE. */
export function getMassa(us: string, ca: string, key: string): string | undefined {
  const entry = findMassaEntry(us, ca);
  const fromDados = entry?.dados?.[key];
  if (fromDados !== undefined && fromDados !== null) return String(fromDados);

  const slug = key
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  const usSlug = us.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const caSlug = ca.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const envKey = `E2E_MASSA_${usSlug}_${caSlug}_${slug}`;
  const fromEnv = process.env[envKey];
  return fromEnv?.trim() || undefined;
}

/** Caminho de fixture/ref declarado na massa. */
export function massaRef(us: string, ca: string, key: string): string | undefined {
  const entry = findMassaEntry(us, ca);
  const fromRefs = entry?.refs?.[key];
  if (fromRefs) return fromRefs;
  return getMassa(us, ca, `ref_${key}`);
}

export function massaStatus(us: string, ca: string): MassaEntryStatus {
  return findMassaEntry(us, ca)?.status ?? "pendente";
}

/** Invalida cache apos setups alterarem dados.json. */
export function reloadMassa(): MassaData {
  cache = undefined;
  return loadMassaData(true);
}

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import type { MassaManifest } from "./types.ts";
import type { MassaData, MassaDataEntry, MassaEntryStatus } from "./data-types.ts";
import { massaEntryKey } from "./data-types.ts";
import { scriptsDir } from "../workspace.ts";
import { config } from "../config.ts";

const META_KEYS = new Set([
  "perfil",
  "accesslabel",
  "acessolabel",
  "rotulo",
  "label",
  "status",
  "setup",
  "notas",
  "nota",
  "precisa",
  "us",
  "ca",
]);

function stripDecor(s: string): string {
  return s
    .trim()
    .replace(/^\*\*(.+)\*\*$/, "$1")
    .replace(/^`(.+)`$/, "$1")
    .replace(/^['"]|['"]$/g, "")
    .trim();
}

function normalizeMetaKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_-]+/g, "");
}

function parseStatus(raw: string | undefined): MassaEntryStatus {
  const v = (raw ?? "pendente").toLowerCase().trim();
  if (v === "pronto" || v === "ready") return "pronto";
  if (v === "aplicado" || v === "applied") return "aplicado";
  if (v === "impossivel" || v === "impossible") return "impossivel";
  return "pendente";
}

function parseScalar(raw: string): string | number | boolean {
  const v = stripDecor(raw);
  if (/^(true|sim|yes)$/i.test(v)) return true;
  if (/^(false|nao|não|no)$/i.test(v)) return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

function parseHeader(line: string): { us: string; ca: string } | undefined {
  const m = line.match(/^##\s+(US_[A-Z0-9_]+)\s+(?:\/\s*)?(CA\d+)\b/i);
  if (!m) return undefined;
  return { us: m[1]!.toUpperCase(), ca: m[2]!.toUpperCase() };
}

function emptyEntry(us: string, ca: string): MassaDataEntry {
  return { us, ca, status: "pendente", dados: {} };
}

function applyMeta(entry: MassaDataEntry, key: string, value: string): void {
  const k = normalizeMetaKey(key);
  const v = stripDecor(value);
  if (!v) return;
  if (k === "perfil") entry.perfil = v;
  else if (k === "accesslabel" || k === "acessolabel" || k === "rotulo" || k === "label") {
    entry.accessLabel = v;
  } else if (k === "status") entry.status = parseStatus(v);
  else if (k === "setup") entry.setup = v;
  else if (k === "notas" || k === "nota") entry.notas = v;
  else if (k === "precisa") {
    entry.precisa = v
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  } else if (!META_KEYS.has(k)) {
    entry.dados[key.trim()] = parseScalar(v);
  }
}

/** Lê massa declarativa de Markdown (## US_XXX CAyy + chave: valor). */
export function parseMassaMd(text: string): MassaData {
  const entries: MassaDataEntry[] = [];
  let current: MassaDataEntry | undefined;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("# ") && !line.startsWith("## ")) continue;

    const header = parseHeader(line);
    if (header) {
      current = emptyEntry(header.us, header.ca);
      entries.push(current);
      continue;
    }

    if (!current) continue;
    const kv = line.replace(/^\s*[-*]\s+/, "").match(/^([^:=]{1,80})\s*[:=]\s*(.+)$/);
    if (!kv) continue;
    applyMeta(current, kv[1] ?? "", kv[2] ?? "");
  }

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    source: "md",
    entries,
  };
}

function parseEntryRow(raw: unknown): MassaDataEntry | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const row = raw as Record<string, unknown>;
  const us = String(row.us ?? row.US ?? "").trim().toUpperCase();
  const ca = String(row.ca ?? row.CA ?? "").trim().toUpperCase();
  if (!us || !ca) return undefined;

  const dadosRaw = row.dados ?? row.data ?? row.values ?? row.campos;
  const dados: Record<string, string | number | boolean> = {};
  if (dadosRaw && typeof dadosRaw === "object" && !Array.isArray(dadosRaw)) {
    for (const [k, v] of Object.entries(dadosRaw as Record<string, unknown>)) {
      if (v === null || v === undefined) continue;
      if (typeof v === "boolean" || typeof v === "number") dados[k] = v;
      else dados[k] = String(v);
    }
  }

  const refsRaw = row.refs ?? row.referencias ?? row.files;
  const refs: Record<string, string> = {};
  if (refsRaw && typeof refsRaw === "object" && !Array.isArray(refsRaw)) {
    for (const [k, v] of Object.entries(refsRaw as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) refs[k] = v.trim();
    }
  }

  const precisaRaw = row.precisa ?? row.needs;
  let precisa: string[] | undefined;
  if (Array.isArray(precisaRaw)) {
    precisa = precisaRaw.map((p) => String(p).trim()).filter(Boolean);
  } else if (typeof precisaRaw === "string" && precisaRaw.trim()) {
    precisa = precisaRaw
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const entry: MassaDataEntry = {
    us,
    ca,
    perfil: typeof row.perfil === "string" ? row.perfil.trim() : undefined,
    accessLabel:
      typeof row.accessLabel === "string"
        ? row.accessLabel.trim()
        : typeof row.access === "string"
          ? row.access.trim()
          : typeof row.rotulo === "string"
            ? row.rotulo.trim()
            : undefined,
    precisa,
    status: parseStatus(typeof row.status === "string" ? row.status : undefined),
    dados,
    setup: typeof row.setup === "string" ? row.setup.trim() : undefined,
    notas:
      typeof row.notas === "string"
        ? row.notas.trim()
        : typeof row.nota === "string"
          ? row.nota.trim()
          : undefined,
  };
  if (Object.keys(refs).length) entry.refs = refs;
  return entry;
}

/** Lê massa declarativa de JSON. */
export function parseMassaJson(text: string): MassaData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("JSON de massa inválido");
  }

  let rows: unknown[] = [];
  if (Array.isArray(parsed)) rows = parsed;
  else if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    const list = obj.entries ?? obj.entradas ?? obj.items ?? obj.massa ?? obj.cases;
    if (Array.isArray(list)) rows = list;
  }

  const entries = rows.map(parseEntryRow).filter((e): e is MassaDataEntry => Boolean(e));
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    source: "json",
    entries,
  };
}

export function defaultMassaDataPath(): string {
  if (config.massaFile.trim()) return resolveMassaFilePath(config.massaFile);
  const md = join(scriptsDir(), "massa", "dados.md");
  const json = join(scriptsDir(), "massa", "dados.json");
  if (existsSync(md) && !existsSync(json)) return md;
  return json;
}

export function resolveMassaFilePath(input: string, base = scriptsDir()): string {
  const trimmed = input.trim().replace(/^['"]|['"]$/g, "");
  if (!trimmed) return defaultMassaDataPath();
  return isAbsolute(trimmed) ? trimmed : join(base, trimmed);
}

export function readMassaFile(path: string): MassaData {
  if (!existsSync(path)) {
    throw new Error(`Arquivo de massa não encontrado: ${path}`);
  }
  const text = readFileSync(path, "utf8");
  return path.toLowerCase().endsWith(".md") ? parseMassaMd(text) : parseMassaJson(text);
}

export function loadMassaData(path = defaultMassaDataPath()): MassaData {
  if (!existsSync(path)) {
    return { version: 1, updatedAt: new Date().toISOString(), entries: [] };
  }
  try {
    const data = readMassaFile(path);
    data.source = path.replace(/\\/g, "/");
    return data;
  } catch {
    return { version: 1, updatedAt: new Date().toISOString(), entries: [] };
  }
}

export function saveMassaData(data: MassaData, path = defaultMassaDataPath()): void {
  mkdirSync(join(scriptsDir(), "massa"), { recursive: true });
  const payload: MassaData = { ...data, updatedAt: new Date().toISOString() };
  writeFileSync(path, JSON.stringify(payload, null, 2) + "\n", "utf8");
}

export function formatMassaMd(data: MassaData): string {
  const lines = [
    "# Massa E2E",
    "",
    "Gerado pelo QA Agent. Edite ou complemente antes da rodada.",
    "",
  ];

  for (const e of data.entries) {
    lines.push(`## ${e.us} ${e.ca}`);
    if (e.perfil) lines.push(`perfil: ${e.perfil}`);
    if (e.accessLabel) lines.push(`accessLabel: ${e.accessLabel}`);
    lines.push(`status: ${e.status}`);
    if (e.setup) lines.push(`setup: ${e.setup}`);
    if (e.precisa?.length) lines.push(`precisa: ${e.precisa.join("; ")}`);
    if (e.notas) lines.push(`notas: ${e.notas}`);
    lines.push("");
    for (const [k, v] of Object.entries(e.dados)) {
      lines.push(`${k}: ${String(v)}`);
    }
    if (e.refs) {
      for (const [k, v] of Object.entries(e.refs)) {
        lines.push(`ref_${k}: ${v}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

/** Mescla manifest (skip-massa) com dados existentes; preserva status aplicado/pronto. */
export function syncMassaDataFromManifest(
  manifest: MassaManifest,
  existing = loadMassaData(),
): MassaData {
  const byKey = new Map(existing.entries.map((e) => [massaEntryKey(e.us, e.ca), e]));

  for (const m of manifest.entries) {
    if (m.status === "impossivel") continue;
    const key = massaEntryKey(m.us, m.ca);
    const prev = byKey.get(key);
    const next: MassaDataEntry = {
      us: m.us,
      ca: m.ca,
      perfil: m.perfil ?? prev?.perfil,
      precisa: m.precisa.length ? m.precisa : prev?.precisa,
      status: prev?.status === "aplicado" || prev?.status === "pronto" ? prev.status : "pendente",
      dados: prev?.dados ?? {},
      refs: prev?.refs,
      setup: m.setup ?? prev?.setup ?? `${m.us}_${m.ca}.setup.ts`,
      notas: prev?.notas ?? m.motivo,
      accessLabel: prev?.accessLabel ?? m.perfil,
    };
    if (prev?.status === "impossivel") next.status = "impossivel";
    byKey.set(key, next);
  }

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    source: existing.source ?? defaultMassaDataPath(),
    entries: [...byKey.values()].sort((a, b) =>
      massaEntryKey(a.us, a.ca).localeCompare(massaEntryKey(b.us, b.ca)),
    ),
  };
}

export function entriesNeedingGeneration(data: MassaData): MassaDataEntry[] {
  return data.entries.filter(
    (e) => e.status === "pendente" && Object.keys(e.dados).length === 0,
  );
}

export function entriesReadyToApply(data: MassaData): MassaDataEntry[] {
  return data.entries.filter((e) => e.status === "pronto" || e.status === "aplicado");
}

export function massaDataExample(): string {
  return JSON.stringify(
    {
      version: 1,
      entries: [
        {
          us: "US_ACL_001",
          ca: "CA02",
          perfil: "validador",
          accessLabel: "validador",
          status: "pronto",
          precisa: ["Equipe rural ou produtor tenta conceder validador"],
          dados: {
            concessao_tipo: "validador",
            actor_perfil: "equipe_rural",
          },
        },
        {
          us: "US_LCD_004",
          ca: "CA03",
          perfil: "revisor",
          accessLabel: "revisor",
          status: "pronto",
          dados: {
            arquivo_estado: "pendente_aprovacao",
            acao_tentada: "aprovar",
          },
        },
      ],
    },
    null,
    2,
  );
}

export function massaMdExample(): string {
  return formatMassaMd(parseMassaJson(massaDataExample()));
}

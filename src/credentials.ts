import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import type { AccessCredential, AppCredentials, AuthKind, ResolvedCredentials } from "./types.ts";

function stripDecor(s: string): string {
  return s
    .trim()
    .replace(/^\*\*(.+)\*\*$/, "$1")
    .replace(/^`(.+)`$/, "$1")
    .replace(/^['"]|['"]$/g, "")
    .trim();
}

function normalizeKey(raw: string): string {
  return stripDecor(raw)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_-]+/g, "");
}

type CredField = "baseUrl" | "login" | "senha" | "authKind";

function classify(key: string): CredField | undefined {
  if (["url", "baseurl", "e2ebaseurl", "endereco", "site"].includes(key)) return "baseUrl";
  if (["autenticacao", "auth", "authkind", "logintype", "tipo"].includes(key)) return "authKind";
  if (
    [
      "usuario",
      "user",
      "email",
      "e2eemail",
      "e2euser",
      "login",
      "username",
      "conta",
      "cpf",
      "e2ecpf",
      "documento",
    ].includes(key)
  ) {
    return "login";
  }
  if (["senha", "password", "pass", "e2esenha", "e2epassword", "secret", "pwd"].includes(key)) {
    return "senha";
  }
  return undefined;
}

function parseAuthKind(raw: string): AuthKind | undefined {
  const v = raw.toLowerCase().trim();
  if (v === "cpf" || v === "documento") return "cpf";
  if (v === "email" || v === "e-mail" || v === "mail" || v === "usuario") return "email";
  return undefined;
}

export function inferAuthKind(login: string, explicit?: AuthKind): AuthKind {
  if (explicit) return explicit;
  const digits = login.replace(/\D/g, "");
  if (digits.length === 11 && !login.includes("@")) return "cpf";
  return "email";
}

/** Lê credenciais de um .md (chave: valor, KEY=valor, ou itens de lista). */
export function parseCredenciaisMd(text: string): Partial<AppCredentials> & { authKind?: AuthKind } {
  const out: Partial<AppCredentials> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/^\s*[-*]\s+/, "").trim();
    if (!line || line.startsWith("#")) continue;
    const kv = line.match(/^([^:=]{1,80})\s*[:=]\s*(.+)$/);
    if (!kv) continue;
    const field = classify(normalizeKey(kv[1] ?? ""));
    const value = stripDecor(kv[2] ?? "");
    if (!field || !value) continue;
    if (field === "authKind") {
      const kind = parseAuthKind(value);
      if (kind) out.authKind = kind;
      continue;
    }
    if (!out[field]) out[field] = value;
  }
  if (out.login && !out.authKind) out.authKind = inferAuthKind(out.login);
  return out;
}

export function readCredenciaisFile(path: string): Partial<AppCredentials> {
  if (!existsSync(path)) {
    throw new Error(`Arquivo de credenciais não encontrado: ${path}`);
  }
  return parseCredenciaisMd(readFileSync(path, "utf8"));
}

export function resolveCredentialsMdPath(input: string, scriptsDir: string): string {
  return resolveCredentialsFilePath(input, scriptsDir);
}

export function resolveCredentialsFilePath(input: string, scriptsDir: string): string {
  const trimmed = input.trim().replace(/^['"]|['"]$/g, "");
  if (!trimmed) return join(scriptsDir, "credenciais.md");
  return isAbsolute(trimmed) ? trimmed : join(scriptsDir, trimmed);
}

function parseAccessRow(raw: unknown): Partial<AccessCredential> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const row = raw as Record<string, unknown>;
  const login = String(row.login ?? row.email ?? row.usuario ?? row.user ?? row.cpf ?? "").trim();
  const senha = String(row.senha ?? row.password ?? row.pass ?? "").trim();
  const labelRaw = row.label ?? row.rotulo ?? row.perfil ?? row.profile ?? row.nome;
  const label = typeof labelRaw === "string" ? labelRaw.trim() : undefined;
  let authKind: AuthKind | undefined;
  const kindRaw = String(row.authKind ?? row.autenticacao ?? row.auth ?? row.tipo ?? "").toLowerCase();
  if (kindRaw === "cpf" || kindRaw === "documento") authKind = "cpf";
  else if (kindRaw === "email" || kindRaw === "e-mail" || kindRaw === "mail") authKind = "email";
  if (!login && !senha) return undefined;
  return { label: label || undefined, authKind, login: login || undefined, senha: senha || undefined };
}

/** Lê credenciais de JSON (objeto com accesses/acessos ou array de logins). */
export function parseCredenciaisJson(text: string): {
  baseUrl?: string;
  accessCount: number;
  accesses: Array<Partial<AccessCredential>>;
} {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("JSON de credenciais invalido");
  }

  let baseUrl: string | undefined;
  let rows: unknown[] = [];
  let declared: number | undefined;

  if (Array.isArray(raw)) {
    rows = raw;
  } else if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    baseUrl = typeof obj.url === "string" ? obj.url : typeof obj.baseUrl === "string" ? obj.baseUrl : undefined;
    const countRaw = obj.acessos ?? obj.accesses ?? obj.accessCount ?? obj.qtdAcessos;
    if (typeof countRaw === "number") declared = countRaw;
    const list = obj.accesses ?? obj.acessos ?? obj.credentials ?? obj.credenciais ?? obj.logins ?? obj.users;
    if (Array.isArray(list)) rows = list;
  }

  const accesses = rows.map(parseAccessRow).filter((row): row is Partial<AccessCredential> => Boolean(row));
  const accessCount = Math.min(10, Math.max(1, declared ?? (accesses.length || 1)));
  return { baseUrl, accessCount, accesses: accesses.slice(0, accessCount) };
}

export function readMultiCredenciaisFromPath(path: string): {
  baseUrl?: string;
  accessCount: number;
  accesses: Array<Partial<AccessCredential>>;
} {
  if (!existsSync(path)) {
    throw new Error(`Arquivo de credenciais não encontrado: ${path}`);
  }
  const text = readFileSync(path, "utf8");
  if (path.toLowerCase().endsWith(".json")) {
    return parseCredenciaisJson(text);
  }
  return parseCredenciaisMdMulti(text);
}

export function mergeCredentials(
  parts: Array<Partial<AppCredentials> | undefined>,
): AppCredentials {
  const merged: Partial<AppCredentials> = {};
  for (const part of parts) {
    if (!part) continue;
    if (part.authKind) merged.authKind = part.authKind;
    if (part.login) merged.login = part.login;
    if (part.senha) merged.senha = part.senha;
    if (part.baseUrl) merged.baseUrl = part.baseUrl;
  }
  if (!merged.login || !merged.senha) {
    throw new Error(
      "Credenciais incompletas: informe e-mail ou CPF e senha no terminal ou em scripts/credenciais.md",
    );
  }
  const authKind = inferAuthKind(merged.login, merged.authKind);
  return { authKind, login: merged.login, senha: merged.senha, baseUrl: merged.baseUrl };
}

export function formatCredenciaisMd(opts: {
  authKind: AuthKind;
  login: string;
  senha: string;
  baseUrl?: string;
}): string {
  const idLine = opts.authKind === "cpf" ? `cpf: ${opts.login}` : `email: ${opts.login}`;
  const urlLine = opts.baseUrl ? `url: ${opts.baseUrl}\n` : "";
  return `# Credenciais E2E

${urlLine}autenticacao: ${opts.authKind}
${idLine}
senha: ${opts.senha}
`;
}

export function credenciaisJsonExample(): string {
  return `{
  "url": "https://exemplo.com",
  "acessos": 2,
  "accesses": [
    {
      "label": "admin",
      "authKind": "email",
      "login": "qa@exemplo.com",
      "senha": "troque-me"
    },
    {
      "label": "REVOKED",
      "authKind": "email",
      "login": "revogado@exemplo.com",
      "senha": "troque-me"
    }
  ]
}
`;
}

export function credenciaisExample(): string {
  return `# Credenciais E2E (não commitar — fica em data/, ignorado pelo git)

url: https://exemplo.com
acessos: 1

## acesso 1
autenticacao: email
email: qa@exemplo.com
senha: troque-me

# Se a aplicação entra com CPF:
# autenticacao: cpf
# cpf: 000.000.000-00
# senha: troque-me
`;
}

export function placeholderSenha(parsed: Partial<AppCredentials>): boolean {
  return !parsed.senha || parsed.senha.toLowerCase() === "troque-me";
}

function parseAccessCount(text: string): number | undefined {
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/^\s*[-*]\s+/, "").trim();
    if (!line || line.startsWith("#")) continue;
    const kv = line.match(/^([^:=]{1,80})\s*[:=]\s*(.+)$/);
    if (!kv) continue;
    const key = normalizeKey(kv[1] ?? "");
    if (!["acessos", "accesses", "accesscount", "qtdacessos"].includes(key)) continue;
    const n = Number.parseInt(stripDecor(kv[2] ?? ""), 10);
    if (Number.isFinite(n)) return Math.min(10, Math.max(1, n));
  }
  return undefined;
}

function parseAccessLabel(block: string): string | undefined {
  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.replace(/^\s*[-*]\s+/, "").trim();
    if (!line || line.startsWith("#")) continue;
    const kv = line.match(/^([^:=]{1,80})\s*[:=]\s*(.+)$/);
    if (!kv) continue;
    const key = normalizeKey(kv[1] ?? "");
    if (!["rotulo", "label", "perfil", "profile", "nome"].includes(key)) continue;
    const value = stripDecor(kv[2] ?? "");
    if (value) return value;
  }
  return undefined;
}

/** Lê 1–10 acessos de credenciais.md (formato legado = 1 acesso). */
export function parseCredenciaisMdMulti(text: string): {
  baseUrl?: string;
  accessCount: number;
  accesses: Array<Partial<AccessCredential>>;
} {
  const declared = parseAccessCount(text);
  const sections: Array<Partial<AccessCredential>> = [];
  const parts = text.split(/^##\s+/m);

  for (const part of parts.slice(1)) {
    const block = part.replace(/^acesso\s+\d+\s*\n?/i, "").trim();
    if (!block) continue;
    const parsed = parseCredenciaisMd(block);
    sections.push({
      label: parseAccessLabel(block),
      authKind: parsed.authKind,
      login: parsed.login,
      senha: parsed.senha,
    });
  }

  if (sections.length > 0) {
    const accessCount = Math.min(10, Math.max(declared ?? sections.length, sections.length));
    const top = parseCredenciaisMd(parts[0] ?? text);
    return { baseUrl: top.baseUrl, accessCount, accesses: sections.slice(0, accessCount) };
  }

  const single = parseCredenciaisMd(text);
  if (single.login || single.senha) {
    return {
      baseUrl: single.baseUrl,
      accessCount: declared ?? 1,
      accesses: [{ authKind: single.authKind, login: single.login, senha: single.senha }],
    };
  }

  return { baseUrl: single.baseUrl, accessCount: declared ?? 1, accesses: [] };
}

export function readMultiCredenciaisFile(path: string): {
  baseUrl?: string;
  accessCount: number;
  accesses: Array<Partial<AccessCredential>>;
} {
  return readMultiCredenciaisFromPath(path);
}

export function mergeMultiCredentials(
  parts: Array<{
    baseUrl?: string;
    accessCount?: number;
    accesses?: Array<Partial<AccessCredential>>;
  } | undefined>,
): ResolvedCredentials {
  let baseUrl = "";
  let accessCount = 1;
  const slots: Array<Partial<AccessCredential>> = [];

  for (const part of parts) {
    if (!part) continue;
    if (part.baseUrl) baseUrl = part.baseUrl;
    if (part.accessCount) accessCount = Math.min(10, Math.max(1, part.accessCount));
    if (part.accesses?.length) {
      for (let i = 0; i < part.accesses.length; i++) {
        slots[i] = { ...slots[i], ...part.accesses[i] };
      }
      accessCount = Math.max(accessCount, part.accesses.length);
    }
  }

  accessCount = Math.min(10, Math.max(1, accessCount));
  const accesses: AccessCredential[] = [];
  for (let i = 0; i < accessCount; i++) {
    const slot = slots[i] ?? {};
    if (!slot.login || !slot.senha || placeholderSenha(slot)) {
      throw new Error(
        `Credenciais incompletas no acesso ${i + 1}: informe login e senha na aba F5 ou em scripts/credenciais.md`,
      );
    }
    const authKind = inferAuthKind(slot.login, slot.authKind);
    accesses.push({
      label: slot.label?.trim() || undefined,
      authKind,
      login: slot.login.trim(),
      senha: slot.senha.trim(),
    });
  }

  if (!baseUrl.trim()) {
    throw new Error("URL da aplicação ausente — informe na aba F4 ou em credenciais.md");
  }

  return { baseUrl: baseUrl.trim(), accessCount, accesses };
}

export function primaryCredentials(resolved: ResolvedCredentials): AppCredentials & { baseUrl: string } {
  const first = resolved.accesses[0]!;
  return { ...first, baseUrl: resolved.baseUrl };
}

export function formatCredenciaisMdMulti(opts: {
  baseUrl?: string;
  accesses: AccessCredential[];
}): string {
  const urlLine = opts.baseUrl ? `url: ${opts.baseUrl}\n` : "";
  const blocks = opts.accesses.map((access, idx) => {
    const idLine = access.authKind === "cpf" ? `cpf: ${access.login}` : `email: ${access.login}`;
    const labelLine = access.label ? `rotulo: ${access.label}\n` : "";
    return `## acesso ${idx + 1}
${labelLine}autenticacao: ${access.authKind}
${idLine}
senha: ${access.senha}`;
  });

  return `# Credenciais E2E

${urlLine}acessos: ${opts.accesses.length}

${blocks.join("\n\n")}
`;
}

export function accessEnvPrefix(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return "";
  if (/^E2E_/i.test(trimmed)) {
    return trimmed.replace(/_LOGIN$|_SENHA$|_AUTH_KIND$/i, "").toUpperCase();
  }
  const slug = trimmed
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return slug ? `E2E_USER_${slug}` : "";
}

function slugKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function envKeysForAccess(access: AccessCredential, index: number): string[] {
  const keys = new Set<string>();
  if (access.label) {
    const prefix = accessEnvPrefix(access.label);
    if (prefix) keys.add(prefix);
    keys.add(slugKey(access.label));
  }
  keys.add(`access_${index + 1}`);
  keys.add(slugKey(access.login));
  return [...keys];
}

/** Encontra acesso que corresponde ao perfil/motivo do manifest de massa. */
export function findAccessForMassa(
  accesses: AccessCredential[],
  perfil?: string,
  motivo?: string,
): { index: number; access: AccessCredential } | undefined {
  const wanted = new Set<string>();
  if (perfil?.trim()) wanted.add(slugKey(perfil));
  const envMatch = motivo?.match(/E2E_[A-Z0-9_]+/);
  if (envMatch?.[0]) wanted.add(slugKey(envMatch[0].replace(/^E2E_USER_/i, "")));

  for (let i = 0; i < accesses.length; i++) {
    const access = accesses[i]!;
    const keys = envKeysForAccess(access, i);
    for (const key of keys) {
      if (wanted.has(key)) return { index: i, access };
    }
    if (perfil && access.label && slugKey(access.label) === slugKey(perfil)) {
      return { index: i, access };
    }
  }
  return undefined;
}

export function countMassaCredentialMatches(
  entries: Array<{ perfil?: string; motivo: string }>,
  accesses: AccessCredential[],
): number {
  let n = 0;
  for (const entry of entries) {
    if (findAccessForMassa(accesses, entry.perfil, entry.motivo)) n += 1;
  }
  return n;
}

export function multiCredentialsOk(path: string): {
  ok: boolean;
  accessCount?: number;
  primaryLogin?: string;
  primaryAuthKind?: AuthKind;
} {
  if (!existsSync(path)) return { ok: false };
  try {
    const parsed = readMultiCredenciaisFile(path);
    if (!parsed.accesses.length) return { ok: false };
    const first = parsed.accesses[0]!;
    if (placeholderSenha(first) || !first.login) return { ok: false };
    for (let i = 1; i < parsed.accessCount; i++) {
      const slot = parsed.accesses[i];
      if (!slot?.login || placeholderSenha(slot)) return { ok: false };
    }
    return {
      ok: true,
      accessCount: parsed.accessCount,
      primaryLogin: first.login,
      primaryAuthKind: first.authKind ?? inferAuthKind(first.login),
    };
  } catch {
    return { ok: false };
  }
}

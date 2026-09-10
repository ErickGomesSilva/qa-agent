import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RunEscopo } from "./escopo.ts";
import type { ProfileMapFile, ProfileRouteMap } from "./profile-map.ts";
import { listRequirementCases } from "./req-sync.ts";
import { requisitosDestDir, scriptsDir } from "./workspace.ts";

export type Esperado = "visivel" | "ausente" | "http-ok" | "http-recusa" | "sem-ui" | "massa";

export type RoteiroLinha = {
  us: string;
  ca: string;
  perfil: string | null;
  onde: string;
  fazer: string;
  esperado: Esperado;
  specHint: string;
};

export type JoinCase = {
  us: string;
  ca: string;
  dado?: string;
  quando?: string;
  entao: string;
  texto?: string;
};

export type JoinMapRoute = {
  path: string;
  heading?: string;
  headings?: string[];
  menu?: string[];
  controles?: Record<string, "visivel" | "ausente">;
  http?: Array<{ method: string; url: string; status: number; codigo?: string }>;
};

export type JoinMapPerfil = {
  label: string;
  rotas: JoinMapRoute[];
};

export type RoteiroFile = {
  version: 1;
  at: string;
  escopo: RunEscopo;
  coberturaPermissao: { completa: boolean; aviso?: string };
  linhas: RoteiroLinha[];
};

const ROLE_HINTS = [
  "produtor",
  "operador",
  "validador",
  "administrador",
  "admin",
  "gestor",
  "veterinario",
  "visitante",
  "cliente",
  "auditor",
  "revisor",
];

function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function blob(c: JoinCase): string {
  return [c.dado, c.quando, c.entao, c.texto].filter(Boolean).join("\n");
}

export function citedRoles(text: string, f5Labels: string[]): string[] {
  const f = fold(text);
  const found: string[] = [];
  const push = (role: string) => {
    const key = fold(role);
    if (!key || found.some((x) => fold(x) === key)) return;
    found.push(role);
  };
  for (const label of f5Labels) {
    const key = fold(label);
    if (key.length >= 2 && f.includes(key)) push(label);
  }
  for (const hint of ROLE_HINTS) {
    if (f.includes(hint)) {
      const labeled = f5Labels.find((l) => fold(l) === hint);
      push(labeled ?? hint);
    }
  }
  return found;
}

export function permissionCoverageWarning(rolesCited: string[], f5ProfileCount: number): string | undefined {
  const unique = [...new Set(rolesCited.map((r) => fold(r)))];
  if (unique.length >= 2 && f5ProfileCount < 2) {
    return (
      `cobertura de permissao incompleta: os requisitos citam ${unique.length} papeis ` +
      `(${rolesCited.join(", ")}) e o F5 tem ${f5ProfileCount} acesso(s). ` +
      `Nao marque variantes de perfil como cobertas.`
    );
  }
  return undefined;
}

function looksConsulta(text: string): boolean {
  return /consult|list|visualiz|\bver\b|exib|mostr|acess|\bler\b/.test(fold(text));
}

function looksRecusaAcao(text: string): boolean {
  return /nao (pode|deve|consegue|permite)|sem permiss|proibid|recus|nao (import|enviar|validar|upload|excluir)/.test(
    fold(text),
  );
}

function looksUi(text: string): boolean {
  return /tela|pagina|menu|botao|lista|form|modal|consulta|cadastro|relatorio|ui|interface/.test(fold(text)) ||
    looksConsulta(text);
}

function significantTokens(text: string): string[] {
  return fold(text)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !/^(entao|quando|dado|para|como|uma|com|pelo|pela|este|esta|deve|sendo)$/.test(w));
}

function routeScore(route: JoinMapRoute, tokens: string[]): number {
  const hay = fold(
    [route.path, route.heading, ...(route.headings ?? []), ...(route.menu ?? []), ...Object.keys(route.controles ?? {})].join(
      " ",
    ),
  );
  let score = 0;
  for (const t of tokens) {
    if (hay.includes(t)) score += 1;
  }
  return score;
}

function bestRoute(rotas: JoinMapRoute[], tokens: string[]): JoinMapRoute | undefined {
  let best: JoinMapRoute | undefined;
  let bestScore = 0;
  for (const r of rotas) {
    const s = routeScore(r, tokens);
    if (s > bestScore) {
      best = r;
      bestScore = s;
    }
  }
  if (bestScore === 0 && rotas.length === 1) return rotas[0];
  return bestScore > 0 ? best : undefined;
}

function perfilForCase(roles: string[], f5Labels: string[]): string | null {
  const foldedLabels = f5Labels.map((l) => ({ raw: l, f: fold(l) }));
  for (const role of roles) {
    const hit = foldedLabels.find((l) => l.f === fold(role) || fold(role).includes(l.f) || l.f.includes(fold(role)));
    if (hit) return hit.raw;
  }
  return null;
}

function specHint(linha: Omit<RoteiroLinha, "specHint">): string {
  const login = linha.perfil ? `loginAs(page, ${JSON.stringify(linha.perfil)})` : "loginAs do acesso 1";
  if (linha.esperado === "http-ok") {
    return `${login}; assertar lista, empty da lista ou HTTP 2xx da API da tela — heading nao prova consulta.`;
  }
  if (linha.esperado === "http-recusa") {
    return `${login}; assertar HTTP 401/403 (ou recusa visivel). Menu visivel nao e sucesso.`;
  }
  if (linha.esperado === "ausente") {
    return `${login}; assertar controle ausente; nao pular consulta da mesma tela se o CA tambem autoriza ver dados.`;
  }
  if (linha.esperado === "sem-ui") {
    return `tag @sem-ui; mapa nao tem rota/controle para este CA.`;
  }
  if (linha.esperado === "massa") {
    return `tag @massa; credencial do perfil ausente no F5. Proibido test.skip(true) generico.`;
  }
  return `${login}; assertar o Entao observavel (nao so heading).`;
}

export function joinRoteiro(input: {
  casos: JoinCase[];
  perfis: JoinMapPerfil[];
  f5Labels: string[];
  f5ProfileCount: number;
  escopo: RunEscopo;
}): { linhas: RoteiroLinha[]; coberturaPermissao: { completa: boolean; aviso?: string } } {
  const allCited: string[] = [];
  for (const c of input.casos) {
    allCited.push(...citedRoles(blob(c), input.f5Labels));
  }
  const aviso = permissionCoverageWarning(allCited, input.f5ProfileCount);
  const linhas: RoteiroLinha[] = [];

  const labelsFocado =
    input.escopo.modo === "focado" && input.escopo.labels.length
      ? new Set(input.escopo.labels.map((l) => fold(l)))
      : undefined;

  for (const c of input.casos) {
    const text = blob(c);
    const roles = citedRoles(text, input.f5Labels);
    const perfil = perfilForCase(roles, input.f5Labels);
    if (labelsFocado && perfil && !labelsFocado.has(fold(perfil))) continue;

    const tokens = significantTokens(`${c.us} ${c.ca} ${text}`);
    const mapPerfil = perfil
      ? input.perfis.find((p) => fold(p.label) === fold(perfil))
      : input.perfis[0];
    const rotas = mapPerfil?.rotas ?? [];
    const route = bestRoute(rotas, tokens);
    const pathOk =
      !input.escopo.paths.length ||
      input.escopo.modo !== "focado" ||
      (route && input.escopo.paths.some((p) => (route.path ?? "").startsWith(p) || p.startsWith(route.path ?? "")));
    if (input.escopo.modo === "focado" && input.escopo.paths.length && route && !pathOk) continue;

    const consulta = looksConsulta(text);
    const recusa = looksRecusaAcao(text);
    const ui = looksUi(text);
    let esperado: Esperado;
    let onde = route?.path || route?.heading || "";
    let fazer = (c.quando || c.entao || "").replace(/\s+/g, " ").trim().slice(0, 200);

    const hasF5ForCitedRole = Boolean(perfil);
    const citesRole = roles.length > 0;

    if (citesRole && !hasF5ForCitedRole) {
      esperado = "massa";
      onde = onde || "(sem mapa)";
    } else if (ui && !route && rotas.length === 0) {
      esperado = "sem-ui";
      onde = "(sem rota no mapa)";
    } else if (ui && !route) {
      esperado = "sem-ui";
      onde = "(rota nao encontrada no mapa)";
    } else if (consulta && recusa) {
      esperado = "http-recusa";
    } else if (consulta) {
      esperado = "http-ok";
    } else if (recusa) {
      esperado = "ausente";
    } else if (route) {
      esperado = "visivel";
    } else {
      esperado = ui ? "sem-ui" : "visivel";
    }

    if (!fazer) fazer = consulta ? "consultar a tela do CA" : "exercer o Quando/Entao";

    const linha: Omit<RoteiroLinha, "specHint"> = {
      us: c.us,
      ca: c.ca,
      perfil,
      onde: onde || "(indefinido)",
      fazer,
      esperado,
    };
    linhas.push({ ...linha, specHint: specHint(linha) });
  }

  return {
    linhas,
    coberturaPermissao: { completa: !aviso, aviso },
  };
}

export function toJoinPerfis(map: ProfileMapFile): JoinMapPerfil[] {
  return map.perfis.map((p) => ({
    label: p.label,
    rotas: p.rotas.map((r: ProfileRouteMap) => ({
      path: r.path,
      heading: r.heading,
      headings: r.headings,
      menu: r.menu,
      controles: r.controles,
      http: r.http,
    })),
  }));
}

export function writeRoteiro(opts: {
  map: ProfileMapFile;
  f5Labels: string[];
  f5ProfileCount: number;
  escopo: RunEscopo;
  onLog: (line: string) => void;
}): RoteiroFile {
  const casos: JoinCase[] = listRequirementCases(requisitosDestDir()).map((c) => ({
    us: c.us,
    ca: c.ca,
    entao: c.entao,
    texto: `${c.entao}\n${c.bloco}`,
  }));
  const joined = joinRoteiro({
    casos,
    perfis: toJoinPerfis(opts.map),
    f5Labels: opts.f5Labels,
    f5ProfileCount: opts.f5ProfileCount,
    escopo: opts.escopo,
  });
  const file: RoteiroFile = {
    version: 1,
    at: new Date().toISOString(),
    escopo: opts.escopo,
    coberturaPermissao: joined.coberturaPermissao,
    linhas: joined.linhas,
  };
  const falhas = join(scriptsDir(), "falhas");
  mkdirSync(falhas, { recursive: true });
  const path = join(falhas, "ROTEIRO.json");
  writeFileSync(path, JSON.stringify(file, null, 2) + "\n", "utf8");
  opts.onLog(`roteiro: ${file.linhas.length} linha(s) → ${path.replace(/\\/g, "/")}`);
  if (file.coberturaPermissao.aviso) opts.onLog(file.coberturaPermissao.aviso);
  return file;
}

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SpecAuditFinding } from "./coverage-types.ts";
import type { MassaDataEntry } from "./massa/data-types.ts";
import { requisitosDestDir } from "./workspace.ts";

export type CaRef = {
  us: string;
  ca: string;
  specPath?: string;
  motivo?: string;
};

/** Lista caminhos de artefatos de exploracao para o agente. */
export function exploreArtifacts(): { exploracao?: string; mapaUi?: string } {
  const falhas = join(requisitosDestDir(), "..", "scripts", "falhas");
  const exploracao = join(falhas, "EXPLORACAO.json");
  const mapaUi = join(falhas, "MAPA-UI.json");
  return {
    exploracao: existsSync(exploracao) ? exploracao.replace(/\\/g, "/") : undefined,
    mapaUi: existsSync(mapaUi) ? mapaUi.replace(/\\/g, "/") : undefined,
  };
}

export function buildDeepenPrompt(opts: {
  baseUrl: string;
  cases: SpecAuditFinding[];
  limit: number;
}): string {
  const arts = exploreArtifacts();
  const list = opts.cases
    .slice(0, opts.limit)
    .map(
      (c) =>
        `- ${c.us} ${c.ca} spec=${c.specPath ?? "?"} motivo="${c.motivo}" assertEntao=${c.assertEntao}`,
    )
    .join("\n");

  return `Tarefa: **aprofundar specs @rascunho** — reescrever para assertar o Entao do CA e promover a @executavel.

cwd: data/workspace. Requisitos: \`requisitos/\`. BASE_URL: ${opts.baseUrl}

## CAs rascunho (max ${opts.limit} nesta rodada)

${list || "(nenhum)"}

## Artefatos de exploracao

- EXPLORACAO.json: ${arts.exploracao ?? "ausente"}
- MAPA-UI.json: ${arts.mapaUi ?? "ausente"}

## Obrigatorio

1. Para cada CA listado: leia Dado/Quando/Entao em \`requisitos/\` e o spec atual.
2. Reescreva o \`test()\` para exercitar o fluxo e **assertar o Entao** (nao so visibilidade generica de body/heading).
3. Use \`ensureAppReady(page)\` — nao relogue a cada teste.
4. Se o Entao for assertado com evidencia na UI: troque tag **@rascunho** → **@executavel**.
5. Se nao houver UI para o Entao: mantenha @rascunho ou @sem-ui com motivo; atualize \`cobertura.json\` (\`nivel\`).
6. Reproduza **somente** o CA alterado (grep US_XXX.*CAyy) antes de declarar pronto. Playwright e o oraculo.
7. Nao rode a suíte inteira. Nao Discord.

Ao terminar, resuma quantos CAs promoveu a @executavel.
`;
}

export function buildMassaUnblockPrompt(opts: {
  baseUrl: string;
  us: string;
  ca: string;
  specPath?: string;
  precisa: string[];
  perfil?: string;
  motivo: string;
}): string {
  return `Tarefa: **desbloquear CA @massa** — remover skip e implementar teste executavel ou registrar setup.

cwd: data/workspace. BASE_URL: ${opts.baseUrl}

## CA

- US/CA: ${opts.us} ${opts.ca}
- Spec: ${opts.specPath ?? "?"}
- Perfil sugerido: ${opts.perfil ?? "NÃO DEFINIDO"}
- Precisa: ${opts.precisa.join("; ") || opts.motivo}

## Obrigatorio

1. Leia o CA em \`requisitos/\` e o spec.
2. Consulte \`scripts/massa/dados.json\` (ou \`dados.md\`) — preencha \`dados\` e marque \`status: pronto\` se a massa for declaravel.
3. Se existir \`scripts/massa/setups/${opts.us}_${opts.ca}.setup.ts\`, use ou crie setup idempotente (Playwright/API) que aplica a massa de \`dados\`.
4. Remova \`test.skip\` e implemente o fluxo **se** a massa puder ser criada com credenciais E2E atuais ou perfis em credenciais.md.
5. Nos specs, use \`hasMassa('${opts.us}','${opts.ca}')\` e \`getMassa('${opts.us}','${opts.ca}', 'chave')\` de \`helpers/massa\`.
6. Se impossivel sem massa externa: mantenha skip, atualize \`scripts/massa/manifest.json\` status \`impossivel\` e motivo claro.
7. Se implementou: tag @executavel, reproduza grep \`${opts.us}.*${opts.ca}\`. Playwright e o oraculo.
8. Nao Discord.

Grave/atualize manifest entry status: pendente | desbloqueado | impossivel.
`;
}

export function buildMassaGeneratePrompt(opts: {
  baseUrl: string;
  massaPath: string;
  entries: MassaDataEntry[];
  limit: number;
}): string {
  const list = opts.entries
    .slice(0, opts.limit)
    .map(
      (e) =>
        `- ${e.us} ${e.ca} perfil=${e.perfil ?? "N/A"} precisa=${(e.precisa ?? []).join("; ") || (e.notas ?? "?")}`,
    )
    .join("\n");

  return `Tarefa: **gerar massa de dados E2E em runtime** — preencher \`scripts/massa/dados.json\` (ou \`dados.md\`) para desbloquear CAs @massa.

cwd: data/workspace. BASE_URL: ${opts.baseUrl}
Arquivo alvo: ${opts.massaPath.replace(/\\/g, "/")}

## CAs pendentes (max ${opts.limit})

${list || "(nenhum)"}

## Formato JSON (preferido)

\`\`\`json
{
  "version": 1,
  "entries": [
    {
      "us": "US_XXX",
      "ca": "CAyy",
      "perfil": "revisor",
      "accessLabel": "revisor",
      "status": "pronto",
      "precisa": ["..."],
      "dados": { "periodo": "FECHADO", "documento_tipo": "XML" },
      "refs": { "xml": "massa/fixtures/exemplo.xml" },
      "setup": "US_XXX_CAyy.setup.ts"
    }
  ]
}
\`\`\`

## Obrigatorio

1. Para cada CA listado: leia Dado/Quando/Entao em \`requisitos/\` e o skip no spec.
2. Preencha \`dados\` com valores concretos e testaveis (estados, perfis, documentos, periodos).
3. Defina \`accessLabel\` alinhado aos rotulos em credenciais.md quando houver perfil alternativo.
4. Marque \`status: pronto\` quando os dados forem suficientes para setup/spec; \`impossivel\` se depender de backend externo.
5. Se precisar seed na aplicacao: crie \`scripts/massa/setups/US_XXX_CAyy.setup.ts\` idempotente que le \`helpers/massa\` (\`getMassa\`).
6. Nao altere credenciais. Nao Discord.
7. Preserve entradas ja preenchidas no arquivo; apenas merge/atualize as listadas.

Ao terminar, resuma quantas entradas ficaram com \`status: pronto\`.
`;
}

/** Leitura leve de MAPA-UI para log. */
export function mapaUiRouteCount(): number {
  const path = join(requisitosDestDir(), "..", "scripts", "falhas", "MAPA-UI.json");
  if (!existsSync(path)) return 0;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as { routes?: unknown[] };
    return raw.routes?.length ?? 0;
  } catch {
    return 0;
  }
}

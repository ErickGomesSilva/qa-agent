import { existsSync } from "node:fs";
import { basename, join, relative } from "node:path";
import type { AuthKind } from "./types.ts";
import { listRequisitoFiles, listSpecFiles, requisitosDestDir, scriptsDir } from "./workspace.ts";

export function buildGeneratePrompt(opts: {
  requisitosPath: string;
  baseUrl: string;
  authKind: AuthKind;
  regenerate: boolean;
}): string {
  const reqDir = requisitosDestDir();
  const files = listRequisitoFiles(reqDir).map((f) => relative(reqDir, f).replace(/\\/g, "/"));
  const fileList = files.length
    ? files.map((f) => `- requisitos/${f}`).join("\n")
    : "(nenhum .md/.txt copiado — verifique a pasta informada)";
  const existing = listSpecFiles().map((f) => basename(f));
  const falhas = join(scriptsDir(), "falhas");
  const roteiro = join(falhas, "ROTEIRO.json");
  const mapa = join(falhas, "MAPA-PERFIL.json");
  const roteiroNote = existsSync(roteiro) ? "presente" : "AUSENTE";
  const mapaNote = existsSync(mapa) ? "presente" : "AUSENTE";

  return `Siga a skill de sistema (ja injetada). Tarefa: **construir TODOS os casos de teste** da documentacao em Playwright.

cwd: data/workspace da instalacao QA Agent.

## Pastas

- Requisitos: \`requisitos/\` (origem: ${opts.requisitosPath.replace(/\\/g, "/")}) — texto do Entao/RN, nao invente tela
- Roteiro: \`scripts/falhas/ROTEIRO.json\` (${roteiroNote}) — **fonte primaria de cada test()**
- Mapa: \`scripts/falhas/MAPA-PERFIL.json\` (${mapaNote}) — o que cada perfil F5 realmente ve e o HTTP da tela
- Scripts: \`scripts/tests/\`
- Helper: \`scripts/helpers/env.ts\` → \`e2eEnv()\`
- Autenticacao: **${opts.authKind === "cpf" ? "CPF + senha" : "e-mail + senha"}** via e2eEnv(). Nunca hardcode.
- BASE_URL desta rodada: ${opts.baseUrl}

## Arquivos de requisito (leia todos)

${fileList}

Specs ja existentes: ${existing.length ? existing.join(", ") : "(nenhum)"}

## Obrigatorio

1. Leia \`ROTEIRO.json\` primeiro. Um \`test()\` por linha. Requisitos so para o texto do Entao/RN.
2. Arquivo \`US_XXX.spec.ts\`. Titulo com US/CA. Variantes (negativo/permissao/vazio/limite) **somente se o CA/RN e o roteiro permitirem**.
3. Tag **@executavel** somente se assertar o Entao observavel. Senao **@rascunho**.
4. \`esperado: sem-ui\` → \`@sem-ui\` + skip \`sem-ui\`. Sem inventar tela.
5. \`esperado: massa\` → \`@massa\` + skip com o perfil faltante. **Proibido** \`test.skip(true)\` "precisa de outro usuario".
6. Linha com \`perfil\`: \`loginAs(page, "<label>")\` obrigatorio (mesmo label do F5 / roteiro).
7. \`esperado: http-ok\` ou consulta: lista, empty da lista, ou HTTP 2xx. **Heading da pagina nao prova consulta.**
8. \`esperado: http-recusa\`: 401/403 ou recusa visivel. Menu visivel nao e sucesso.
9. \`esperado: ausente\`: controle ausente; nao pule a consulta da mesma tela se o roteiro tambem tiver linha de consulta.
10. CA de API: \`helpers/api.ts\` + \`@executavel @api\`.
11. Encadeamento so se o roteiro/requisitos descreverem sequencia: \`jornadas.spec.ts\` \`@executavel @jornada\`.
12. Gravar \`scripts/cobertura.json\` v2 com TODOS os CAs.
13. Nao rode a suíte. Nao Discord. Nao PENDENTE.md.

## Regenerar

${opts.regenerate ? "REESCREVER specs das US da documentacao. Preserve helpers/env.ts." : "Complete CAs faltantes. Nao apague specs de US que ainda existem nos requisitos."}

Quando terminar, a cobertura.json tem que listar cada CA da pasta requisitos/.
`;
}

import { basename, relative } from "node:path";
import type { AuthKind } from "./types.ts";
import { listRequisitoFiles, listSpecFiles, requisitosDestDir } from "./workspace.ts";

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

  return `Siga a skill de sistema (ja injetada). Tarefa: **construir TODOS os casos de teste** da documentacao em Playwright.

cwd: data/workspace da instalacao QA Agent.

## Pastas

- Requisitos: \`requisitos/\` (origem: ${opts.requisitosPath.replace(/\\/g, "/")})
- Scripts: \`scripts/tests/\`
- Helper: \`scripts/helpers/env.ts\` → \`e2eEnv()\`
- Autenticacao: **${opts.authKind === "cpf" ? "CPF + senha" : "e-mail + senha"}** via e2eEnv(). Nunca hardcode.
- BASE_URL desta rodada: ${opts.baseUrl}

## Arquivos de requisito (leia todos)

${fileList}

Specs ja existentes: ${existing.length ? existing.join(", ") : "(nenhum)"}

## Obrigatorio

1. Inventariar cada US/CA/RN. Nao amostrar.
2. Arquivo \`US_XXX.spec.ts\`: fluxo feliz + variantes (negativo/permissao/vazio/limite) **somente se o texto do CA/RN permitir**. Titulo da variante com \`variante:negativo\` (etc.) e tags \`@executavel @variante\`.
3. Tag **@executavel** somente se assertar o Entao. Senao **@rascunho**.
4. Sem UI e sem API: \`@sem-ui\` + skip \`sem-ui\`.
5. CA de API: \`helpers/api.ts\` + \`@executavel @api\`. Nao skip.
6. Perfil citado no CA: \`loginAs(page, label)\` alinhado ao F5.
7. Encadeamento entre US: \`scripts/tests/jornadas.spec.ts\` com \`@executavel @jornada\`.
8. CAs de massa/perfil sem dado: skip + @massa.
9. RNs visiveis: \`logica-rn.spec.ts\` ou spec da US.
10. Gravar \`scripts/cobertura.json\` v2 com TODOS os CAs.
11. Login: \`helpers/auth.ts\` + \`ensureAppReady(page)\` (ou \`loginAs\` no perfil).
12. Nao rode a suíte. Nao Discord. Nao PENDENTE.md.

## Regenerar

${opts.regenerate ? "REESCREVER specs das US da documentacao. Preserve helpers/env.ts." : "Complete CAs faltantes. Nao apague specs de US que ainda existem nos requisitos."}

Quando terminar, a cobertura.json tem que listar cada CA da pasta requisitos/.
`;
}

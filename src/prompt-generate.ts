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

1. Inventariar cada US/CA/RN da documentacao. Nao amostrar.
2. Um \`test()\` por CA com UI. Arquivo \`US_XXX.spec.ts\`.
3. Tag **@executavel** somente se o teste assertar o Entao do CA. Caso contrario **@rascunho**.
4. CAs sem UI: \`test.skip\` ou tag @sem-ui; \`nivel: "sem-ui"\` em cobertura.json.
5. CAs que exigem massa/perfil: \`test.skip\` com mensagem; tag @massa; \`nivel: "skip-massa"\`.
6. RNs visiveis na UI: testes em \`logica-rn.spec.ts\` ou no spec da US.
7. Gravar \`scripts/cobertura.json\` v2 com TODOS os CAs (\`nivel\`, \`coberto\`, \`motivo\`, \`assertEntao\`, \`specPath\`).
8. Login: \`scripts/helpers/auth.ts\` + \`helpers/global-setup.ts\` (sessao via storageState); use \`ensureAppReady(page)\` nos specs autenticados.
9. CAs @massa: mensagem clara no skip (manifest gerado pelo auditor).
10. Nao rode a suíte. Nao Discord. Nao PENDENTE.md.

## Regenerar

${opts.regenerate ? "REESCREVER specs das US da documentacao. Preserve helpers/env.ts." : "Complete CAs faltantes. Nao apague specs de US que ainda existem nos requisitos."}

Quando terminar, a cobertura.json tem que listar cada CA da pasta requisitos/.
`;
}

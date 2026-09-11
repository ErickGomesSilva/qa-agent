import type { McpFile } from "./mcp.ts";
import type { PlaywrightOutcome } from "./types.ts";

export function buildTriagePrompt(opts: {
  projectPath: string;
  e2eDir: string;
  grep: string;
  playwright: PlaywrightOutcome;
  mcpServers: McpFile;
  /** Paths relativos ao workspace (já stageados em scripts/falhas/). */
  evidenceLogRel: string;
  evidenceJsonRel: string;
}): string {
  const failure = opts.playwright.failures[0];
  const mcpNames = Object.keys(opts.mcpServers);
  const hasDiscord = mcpNames.some((n) => /discord/i.test(n));
  const ws = opts.projectPath.replace(/\\/g, "/");
  const e2e = opts.e2eDir.replace(/\\/g, "/");

  return `Você é o agente de QA orquestrado pelo QA-Agent. A suíte Playwright **já parou** na primeira falha (--max-failures=1). Você **não** substitui o Playwright: o runner é o oráculo de pass/fail. Você classifica a falha e só então decide o próximo passo.

Siga a skill \`.cursor/skills/qa-e2e-requisitos\` e \`AGENTS.md\` deste workspace. Fonte dos CAs: pasta \`requisitos/\`. Scripts: \`scripts/tests/\`.

## Contexto desta rodada

- Workspace (cwd): ${ws}
- Pasta de scripts: ${e2e}
- Grep da suíte: ${opts.grep || "(todos)"}
- Stats Playwright: expected=${opts.playwright.stats.expected} unexpected=${opts.playwright.stats.unexpected} skipped=${opts.playwright.stats.skipped} exit=${opts.playwright.exitCode}
- Evidência Playwright (USE SÓ ESTES PATHS — relativos ao workspace):
  - Log: \`${opts.evidenceLogRel}\`
  - JSON: \`${opts.evidenceJsonRel}\`
- **Proibido** ler \`../runs/\`, \`data/runs/\` ou qualquer caminho fora do workspace. Se a tool recusar um path, classifique **AMBIENTE** (ferramenta/sandbox), **não** PRODUTO.

## Falha que parou a suíte

- Título: ${failure?.title ?? "(desconhecido)"}
- Arquivo: ${failure?.file ?? "—"}
- Grep sugerido para reproduzir só este CA: ${failure?.grepHint ?? opts.grep}

Erro:
\`\`\`
${(failure?.error ?? "sem mensagem").slice(0, 8000)}
\`\`\`

## O que fazer (nesta ordem)

1. Ler o CA (Dado/Quando/Então) em \`requisitos/\`. Não chute o “Então”.
2. Ler \`${opts.evidenceLogRel}\` / \`${opts.evidenceJsonRel}\` se precisar de detalhe. Reproduzir **somente** este cenário se for TESTE. Não relançar a suíte inteira.
3. Classificar **uma** classe: TESTE | PRODUTO | MASSA | AMBIENTE | INCONCLUSIVO.
   - **TESTE** — locator/assert/script errado (corrigível no spec).
   - **PRODUTO** — bug real na aplicação sob teste.
   - **MASSA** — dado/credencial de teste faltando ou inválido.
   - **AMBIENTE** — URL inacessível, rede, Chromium, timeout de infra, **erro da ferramenta QA-Agent** (path fora do workspace, API LLM, sandbox). **Não** é bug de produto. Pare e explique o que o usuário deve fazer.
   - **INCONCLUSIVO** — evidência insuficiente.
   - Não altere copy/UI da aplicação sob teste para o locator passar.
   - Credenciais só via env (\`e2eEnv()\`). Nunca grave senha em PENDENTE.md.
4. TESTE: corrija o locator/assert no spec em \`scripts/tests\`, reexecute **este** CA. Não avise desenvolvedor. Não use Discord.
5. PRODUTO: grave \`scripts/falhas/PENDENTE.md\` com o template da skill. Só então notifique Discord, e **somente** se houver MCP Discord configurado.
6. MASSA / AMBIENTE / INCONCLUSIVO: não Discord, não “bug de produto”. Em AMBIENTE, o resumo deve dizer claramente que a suíte **parou** e o que o usuário deve verificar.

## Discord

MCP inline nesta sessão: ${mcpNames.length ? mcpNames.join(", ") : "(nenhum — mcp.json ausente)"}
Discord configurado: ${hasDiscord ? "sim — ferramenta MCP \`discord_notify\` no servidor \`discord\`. Chame SOMENTE se classe = PRODUTO e PENDENTE.md já gravado. Não envie seletor, massa ou ambiente." : "não — não invente webhook nem MCP"}

## Artefato obrigatório

Grave \`${e2e}/falhas/TRIAGEM.json\` com JSON puro (sem markdown):

{
  "classe": "TESTE|PRODUTO|MASSA|AMBIENTE|INCONCLUSIVO",
  "us": "US_XXX",
  "ca": "CAyy",
  "resumo": "uma frase",
  "corrigiuTeste": false,
  "pendentePath": "scripts/falhas/PENDENTE.md ou vazio",
  "discordEnviado": false
}

Não continue a suíte @executavel inteira. A orquestração retoma se classe=TESTE e corrigiuTeste=true.
`;
}

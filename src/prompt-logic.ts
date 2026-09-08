export function buildLogicPrompt(opts: {
  baseUrl: string;
  pages: number;
  issueCount: number;
  reportPath: string;
}): string {
  return `Siga a skill de sistema. Tarefa: **logica da aplicacao**, nao so o fluxo feliz do CA.

O crawler Playwright ja navegou o sistema (${opts.pages} paginas, ${opts.issueCount} achados de runtime). Relatorio: \`${opts.reportPath.replace(/\\/g, "/")}\` (relativo ao workspace: \`scripts/falhas/EXPLORACAO.json\`).

BASE_URL: ${opts.baseUrl}

## O que o Playwright cobre aqui

- Erro de runtime no browser (pageerror, console.error)
- HTTP 5xx
- CAs/RNs que voce transformar em assert visivel

## O que ele NAO cobre

- Regra de dominio que nao aparece na tela
- Nao invente RN. Leia \`requisitos/\`.

## Fazer

1. Ler \`scripts/falhas/EXPLORACAO.json\` e \`requisitos/\`.
2. Se o achado for falha de produto (nao seletor, nao timeout de rede unica), grave \`scripts/falhas/LOGICA.md\` com evidencia.
3. Escrever/completar \`scripts/tests/logica-rn.spec.ts\` so para RN observavel ainda sem teste.
4. Atualizar \`scripts/cobertura.json\` se criar casos novos.
5. Nao rode a suíte inteira. Nao Discord nesta etapa, salvo PRODUTO ja documentado em LOGICA.md + PENDENTE.md.
`;
}

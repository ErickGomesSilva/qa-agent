# Gestores de projeto via MCP (Plane e outros)

[English](mcp.md) · [Voltar ao README](../README.pt-BR.md)

Além de pasta local e Git, os requisitos podem vir de um **gestor de projetos conectado por MCP** (hoje: Plane). Esta página cobre configuração, regras do contrato e o que ainda não está implementado.

## Regras do contrato

- A User Story **aprovada** no gestor é o **contrato oficial**.
- Uma **Mudança de Requisito** aprovada, com relação explícita de substituição a uma RN ou CA, altera o **contrato vigente**.
- Rascunhos e conflitos sem relação explícita **nunca** são resolvidos por adivinhação. A US é materializada com aviso de "contrato ambíguo".

## Configurar pela F3 (TUI)

A aba **Requisitos** tem o seletor **Local / Git / MCP** (teclas 1/2/3 ou ←→). Com **MCP**:

1. Digite o nome do servidor MCP, como declarado em `mcp.json` (ex.: `plane`). Ver [`mcp.example.json`](../mcp.example.json).
2. **Enter** conecta e lista os projetos do workspace. Escolha com ↑↓.
3. **Enter** de novo **valida** o projeto: busca todos os work items, mantém só os que têm a label **`Requisitos`** e agrupa em **Épicos** para você conferir antes de gravar. O nome da label é fixo hoje; ele evita misturar os itens `QA / E2E` que a ferramenta cria de volta e as tarefas de `Desenvolvimento`.
4. Se a mesma US aparecer duplicada (ex.: reimportação antiga `[V1]` + catálogo atual), **vence o `updated_at` mais recente**. A mais antiga é descartada e contada no resumo (`N duplicata(s) descartada(s)`). É regra fixa de recência, nunca adivinhação de conteúdo.
5. Confirmados os Épicos, a F3 materializa os requisitos em Markdown local e aponta `requisitosPath` para essa pasta. Mapa, roteiro, specs e auditoria rodam igual ao modo local/Git.
6. Tecla **R** na F3 (com MCP já validado) reconecta e relista do zero. É assim que você atualiza depois de mudanças no Plane.

**Convenção de título:** nem todo workspace Plane tem Work Item Types habilitado, então Épico / Feature / US são identificados pelo título (`Épico:`, `Feature:`, `US_XXX`) quando não há tipo nativo. Quem decide o que é requisito é a **label**, não o título.

## Arquivo de configuração

A F3 grava estes campos opcionais em `data/settings.json`. Instalações sem eles continuam funcionando sem alteração.

```json
{
  "requirementSourceKind": "mcp",
  "mcpRequirementSource": {
    "server": "plane",
    "provider": "plane",
    "projectId": "...",
    "cycleId": "...",
    "defaultLabels": ["qa-agent"]
  }
}
```

O servidor MCP em si (URL, token) fica só em `mcp.json`, que está no `.gitignore`. Nenhum token ou segredo do MCP é gravado em `data/`, relatórios, `run.json` ou logs.

## Saída materializada

Cada US vira `US_<KEY>.md` com front matter (provider, projeto, ciclo, ID externo, revisão, URL de origem) e um bloco `### CA<n>` por critério, no mesmo formato dos requisitos locais (ver [Formato dos requisitos](../README.pt-BR.md#formato-dos-requisitos)). O `SOURCE-MANIFEST.json` guarda proveniência e hashes de conteúdo, sem segredos.

## Escopo de execução

`RequirementRunScope` aceita: suíte completa, uma **US específica**, um **cenário** (US + dependências/jornadas com relação explícita, nunca a Feature/Épico inteiros) ou **reteste de Bug** (resolve a US de origem e roda o menor recorte).

## Bug automático

- Só depois da triagem classificar **PRODUTO**. O LLM nunca cria item externo por conta própria.
- Deduplicação por assinatura estável: provider + projeto + US + CA + comportamento.
- Se a sincronização falhar, o achado local (`PRODUTO.json`) é preservado e `BUG-SYNC-PENDENTE.md` / `.json` é gravado para retomada idempotente. A ferramenta nunca afirma que o Bug foi criado sem confirmação do provider.

## Arquitetura

- `src/requirements/`: contrato normalizado, contrato vigente, materialização, resolução de escopo.
- `src/project-managers/`: adapters de provider, sincronização e dedupe de Bug.
- Um segundo adapter (Jira, Linear, Azure DevOps…) é registrado em `src/project-managers/registry.ts` sem alterar o orquestrador nem a UI da F3.

Tudo acima tem teste unitário com fixtures, sem depender de rede real.

## Ainda não implementado

- Flags CLI dedicadas (`--requirements-source mcp ...`). Configure pela F3 ou por `data/settings.json`.
- Seleção de ciclo / release na F3.
- Escolha de provider quando houver mais de um adapter. Só existe o Plane, então a F3 assume `provider=plane`.
- Propagar o escopo US / cenário / Bug para roteiro e geração. Só a resolução do escopo está pronta (`src/requirements/scope-resolver.ts`).

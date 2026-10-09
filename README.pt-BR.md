# QA Agent

**Requisitos entram. Playwright sai. O modelo tria a falha — não é o oráculo do teste.**

CLI local (TUI + modo texto) que transforma US/CA em specs Playwright, mapeia a UI por perfil, gera massa em runtime, executa a suíte e classifica a primeira falha com LLM.

[English README](README.md) · [Wiki](https://github.com/ErickGomesSilva/qa-agent/wiki) · [Changelog](CHANGELOG.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933)](https://nodejs.org)

<!-- TODO: print ou GIF da TUI (F8 rodando + feed do agente na F10). -->

## O que faz

1. **Lê** requisitos em markdown (US / CA) de pasta local, URL Git ou gestor de projetos via MCP.
2. **Mapeia** a UI com Playwright **por cada login da F5** (menu, controles, HTTP 401/403) e cruza com os requisitos → `ROTEIRO.json`.
3. **Gera** specs Playwright a partir do roteiro (`loginAs` por perfil; heading **não** prova consulta), com tags `@executavel`, `@rascunho`, `@massa` ou `@sem-ui`.
4. **Explora** as regras de negócio (RN) restantes, mais uma **jornada** opcional com cliques reais.
5. **Preenche** massa em runtime via `dados.json` / `dados.md`.
6. **Roda** Playwright (`--max-failures=1`). Na falha, um **agente tria** como TESTE, PRODUTO, MASSA, AMBIENTE ou INCONCLUSIVO (ver [Glossário](#glossário)).
7. **TESTE** com correção de locator pode retomar sozinho. **PRODUTO** pode seguir a suíte e notificar Discord / Slack / Teams.

A chave da API fica na sua máquina. O runtime do agente é **local**, então alcança URLs internas que um agente na nuvem não alcança.

## O que o agente não faz

- Não é o oráculo do teste. O Playwright é.
- Não altera texto do produto para o locator passar.
- Não marca spec como `@executavel` se o *Então* não for assertado. A auditoria rebaixa stubs.
- Não notifica em TESTE / MASSA / AMBIENTE / INCONCLUSIVO, só em PRODUTO confirmado.

## Início rápido

1. Instale (uma linha, ver [Instalar](#instalar)) e abra um **terminal novo**.
2. Rode `qaagent`.
3. **F1**: cole a chave da API. **F2**: escolha o modelo.
4. **F3**: aponte a pasta (ou URL Git) com os requisitos, escritos no [formato esperado](#formato-dos-requisitos).
5. **F4**: URL da aplicação. **F5**: pelo menos um login.
6. **F8**: **Enter** inicia a missão completa. Acompanhe a telemetria ali e o feed do LLM na **F10**.
7. Ao terminar, leia **F9 → 5 Problemas** (`PROBLEMAS.md`) e o bloco **Como retomar** (`RETOMAR.md`).

## Requisitos de ambiente

- Node.js **≥ 22.13**
- Chave de API **de usuário** de um destes: [Cursor](https://cursor.com/dashboard/settings/api-keys), OpenAI, Claude (Anthropic), OpenRouter, Groq ou qualquer endpoint compatível com OpenAI (Custom). Chaves **Team Admin** do Cursor **não** funcionam.
- URL da aplicação e pelo menos um login para E2E.
- **Git** no PATH, só se a F3 apontar para URL Git.

## Instalar

**Node.js ≥ 22.13** precisa estar no PATH ([nodejs.org](https://nodejs.org)).

**Windows** (PowerShell):

```powershell
irm https://raw.githubusercontent.com/ErickGomesSilva/qa-agent/main/install.ps1 | iex
```

**Linux / macOS**:

```bash
curl -fsSL https://raw.githubusercontent.com/ErickGomesSilva/qa-agent/main/install.sh | bash
```

O script baixa o app para `%LOCALAPPDATA%\qa-agent` (Windows) ou `~/.local/share/qa-agent` (Linux/macOS), roda `npm install`, instala o Chromium e coloca `qaagent` no PATH. Abra um **terminal novo** e rode `qaagent`.

**Atualizar:** rode o mesmo comando de instalação. Ele baixa o código novo e **preserva** `.env` e `data/`.

Pasta customizada: `$env:QA_AGENT_HOME="D:\tools\qa-agent"` (Windows) ou `QA_AGENT_HOME=~/qa-agent` (Unix) antes da linha de instalação.

**Confiança:** `| iex` / `| bash` executa código do GitHub. Leia [`install.ps1`](install.ps1) e [`install.sh`](install.sh) antes, ou clone o repo e rode `node instalar.mjs`. Ver [SECURITY.md](SECURITY.md).

### Já clonou o repositório?

| SO | Comando |
|---|---|
| Windows (PowerShell) | `.\instalar.ps1` ou `.\instalar.cmd` |
| Linux / macOS | `chmod +x instalar && ./instalar` |
| Qualquer SO | `node instalar.mjs` ou `npm run setup` |

Sem instalador (dev): `npm install`, `npx playwright install chromium`, `npm start`.

### Desinstalar

Só remove o `qaagent` do PATH — mantém `.env`, `data/` e a pasta de instalação.

**Windows:**

```powershell
cd $env:LOCALAPPDATA\qa-agent; node desinstalar.mjs
```

**Linux / macOS:**

```bash
cd ~/.local/share/qa-agent && node desinstalar.mjs
```

## Formato dos requisitos

A ferramenta lê todo arquivo `.md` / `.txt` dentro da pasta da F3 (recursivo). Exemplo mínimo:

```md
# US_LOGIN_001 — Entrar com e-mail

### CA1 (US_LOGIN_001)
**Dado** um usuário ativo
**Quando** informa e-mail e senha válidos
**Então** vê o painel inicial

### CA2 (US_LOGIN_001)
**Dado** um usuário ativo
**Quando** informa a senha errada
**Então** vê "Credenciais inválidas" e continua na tela de login
```

Regras de que o parser depende:

- **ID da US:** `US_` seguido de letras maiúsculas, dígitos ou `_` (ex.: `US_LOGIN_001`).
- **ID do CA:** `CA` seguido de dígitos (`CA1`, `CA12`). `CA-1` **não** é reconhecido.
- **Um bloco por CA**, começando com `### CA<n>` ou `**CA<n>`.
- **Repita o ID da US dentro de cada bloco de CA** (no título ou em `<!-- US_LOGIN_001 -->`). Se o arquivo tiver uma única US e nenhum bloco a repetir, a ferramenta ainda acha os CAs, mas não extrai o *Então*, e a detecção de mudança fica mais fraca.
- **`**Então**` em negrito** é o resultado esperado. O texto dele vira hash: editar o *Então* refaz o roteiro e marca o CA como alterado.
- **Regras de negócio:** `RN_X` / `RN-X` / `RNX` em qualquer lugar do arquivo; o agente de RN as explora.
- *Dado / Quando* são texto livre lido pelo LLM, não pelo parser.

## Abas (TUI)

| Tecla | Aba | Função |
|---|---|---|
| F1 | Chave | Chave de API: Cursor, OpenAI, Claude, OpenRouter, Groq ou Custom (compatível OpenAI) |
| F2 | Modelo | Modelos da chave escolhida |
| F3 | Requisitos | Fonte **Local / Git / MCP** (teclas 1/2/3) |
| F4 | URL | Aplicação sob teste |
| F5 | Login | 1–10 contas ou arquivo `.md` / `.json` |
| F6 | Webhook | Opcional; avisa bug confirmado na aplicação (não erro de teste) |
| F7 | Opções | **Rodar tudo**, k6, massa, jornada, headed, grep, idioma, seguir após PRODUTO, retestar quarentena |
| F8 | Missão | Etapa com **1–4** (Completa, Mapa+roteiro, Scripts, Testes) e telemetria. **R** na etapa 2 refaz o crawl; na 3 reescreve specs sem crawl |
| F9 | Consulta | **1** relatórios · **2** matriz · **3** quarentena · **4** jornadas · **5** problemas |
| F10 | Agente | Feed ao vivo do LLM (tools, texto, rounds) · indica **● SESSÃO ATIVA** / **○ SESSÃO ENCERRADA** com duração · **End** segue ao vivo · **C** limpa |

Enter grava a aba. Na F8, Enter inicia a rodada. **P** ou **Esc** durante a rodada pausa no próximo checkpoint; **Esc** com a rodada parada sai do TUI; **Ctrl+C** encerra o processo. Sem TTY a ferramenta cai no `qaagent --plain`.

**F3 — Git:** GitHub, Gitea/Forgejo/Codeberg (`/src/branch/…`), Azure DevOps (`_git/…?path=`), GitLab (`/-/tree/…`), Bitbucket ou `https://host/repo.git docs/requisitos`. Repo privado: **Tab** no segundo campo da F3 e cole o token — a ferramenta grava `QA_GIT_TOKEN` no `.env` (não cole o PAT na URL). O clone fica em `data/cache/git/` e atualiza a cada missão.

**F3 — MCP:** ver [Gestores de projeto (MCP)](#gestores-de-projeto-mcp).

**F7 — Rodar tudo = SIM** liga k6, massa, jornada e navegador visível (headed + vídeo). Os interruptores individuais continuam disponíveis. Espaço alterna; Enter grava em `.env` + `data/settings.json`.

## Fases da rodada

A missão **completa** faz, nesta ordem:

1. Sincroniza `requisitos/` (e grava `SYNC-DIFF.json`: CAs novos / alterados / órfãos).
2. **Mapa por perfil** (Playwright, sem LLM) → `MAPA-PERFIL.json`. Um crawl por conta da F5; registra menu, controles visíveis/ausentes e HTTP **401/403** same-origin (não só 5xx).
3. **Join** requisitos ∩ mapa ∩ labels F5 → `ROTEIRO.json` (`us`, `ca`, `perfil`, `onde`, `fazer`, `esperado`, `specHint`).
4. **Gera** specs a partir de roteiro + mapa + requisitos. Pulado se já existirem specs, salvo **R**.
5. Auditoria, massa, Playwright, triagem.
6. Relatórios: `COBERTURA-RESUMO-<slug>.md` + **`PROBLEMAS.md`** (bloqueios, falhas, bugs de produto, HTTP 4xx do mapa, CAs sem spec, stubs).
7. Em **erro fatal** (agente caiu, limite de loops…): `FALHA-FATAL.md` com onde parou e próximos passos.
8. Em **qualquer** desfecho: `RETOMAR.md` + bloco **Como retomar** na telemetria (o que reaproveitar e o que o próximo Enter faz — quase sempre sem **R**).
9. **Pausa** (P / Esc): para no próximo checkpoint e grava `CONTINUAR.md`. Enter na F8 retoma.

### Etapas (F8, teclas 1–4)

| Tecla | Etapa | Executa | Para depois de |
|---|---|---|---|
| 1 | Completa | Tudo acima | Relatórios |
| 2 | Mapa+roteiro | Passos 1–3 | `ROTEIRO.json` |
| 3 | Scripts | Passos 1–4; **R** reescreve specs sem novo crawl | Specs gravados (sem Playwright) |
| 4 | Testes | Playwright + triagem nos specs existentes | Relatórios. Falha se `scripts/tests` estiver vazio |

### Reuso de mapa e roteiro

`MAPA-PERFIL.json` e `ROTEIRO.json` guardam um **fingerprint** dos inputs (URL, F5, escopo, profundidade de crawl; o roteiro inclui também os hashes dos CAs).

| Situação | Comportamento |
|---|---|
| Fingerprints iguais aos da rodada anterior | **Reutiliza** mapa e roteiro (sem novo crawl) |
| Só requisitos/CAs mudaram | **Reutiliza o mapa**, refaz só o roteiro |
| URL, F5, escopo ou crawl mudaram (ou arquivo antigo sem fingerprint) | Refaz mapa + roteiro |
| **R** na etapa Completa ou Mapa+roteiro | **Força** novo crawl |
| **R** na etapa Scripts | Reescreve specs, **reusa** o mapa |

Mudança só na UI do app (mesma URL / F5 / requisitos) **não** invalida o cache — use **R**.

### Rodada focada

Rodada geral e focada usam o mesmo motor. Recorte o mapa/roteiro em `data/projects/<slug>/scripts/escopo.json` (modelo: [`templates/workspace/escopo.example.json`](templates/workspace/escopo.example.json)) ou por env:

```json
{ "modo": "focado", "labels": ["operador"], "paths": ["/app/documentos"] }
```

- `QA_ESCOPO_MODO=geral|focado`
- `QA_ESCOPO_LABELS=operador,visitante`
- `QA_ESCOPO_PATHS=/app/docs,/app/fila`

Se a F5 tiver **um** acesso e as US citarem **vários** papéis, a rodada grava aviso de cobertura de permissão incompleta — não trata os outros perfis como cobertos.

## Arquivos gerados

Salvo indicação, tudo vai para `data/projects/<slug>/scripts/falhas/`. A F9 abre os principais.

| Arquivo | Quando | Para quê |
|---|---|---|
| `SYNC-DIFF.json` | Toda rodada | CAs novos / alterados / órfãos em relação aos specs |
| `MAPA-PERFIL.json` | Etapa de mapa | UI vista por perfil da F5, HTTP 401/403 |
| `ROTEIRO.json` | Etapa de mapa | US × CA × perfil: onde, o que fazer, o que esperar |
| `MAPA-UI.json`, `EXPLORACAO.json` | Mapa / exploração de RN | Detalhe do crawl e achados de RN |
| `AUDITORIA.json` | Auditoria | Checagem de tags e stubs por spec |
| `COBERTURA-RESUMO-<slug>.md` | Fim da rodada | Resumo de cobertura (F9 → 1) |
| `MATRIZ.md` / `.json` | Fim da rodada | Rastreabilidade US × CA × spec × resultado (F9 → 2) |
| `QUARENTENA.md` / `.json` | Caso TESTE esgota as retomadas | Casos pulados na rodada normal (F9 → 3) |
| `JORNADA.md` / `.json` | Jornada | O que um usuário conseguiu abrir clicando (F9 → 4) |
| `PROBLEMAS.md` / `.json` | Fim da rodada | Todos os bloqueios num lugar só (F9 → 5) |
| `TRIAGEM.json` | Após uma falha | Classe da triagem e justificativa |
| `ULTIMA-FALHA.json` | Após uma falha | Evidência Playwright da última falha |
| `PRODUTO.json`, `PENDENTE.md` | Triagem = PRODUTO | Bug confirmado na aplicação |
| `AVISO-AMBIENTE.md` | Triagem = AMBIENTE | Por que a suíte parou e o que verificar |
| `FALHA-FATAL.md` / `.json` | Erro fatal | Onde parou, marcos concluídos, próximos passos |
| `CONTINUAR.md` / `.json` | Pausa | Como o próximo Enter retoma |
| `RETOMAR.md` / `.json` | Qualquer desfecho | O que reaproveitar e como retomar |
| `BUG-SYNC-PENDENTE.md` / `.json` | Falha ao sincronizar Bug via MCP | Bug pendente para retomada idempotente |
| `SOURCE-MANIFEST.json` | Fonte MCP (na pasta de requisitos materializados) | Proveniência de cada US |

Specs ficam em `scripts/tests/`, massa em `scripts/massa/`, scripts k6 em `scripts/k6/`.

## Glossário

**Tags dos specs**

| Tag | Significado |
|---|---|
| `@executavel` | Asserta o *Então*. Entra no grep padrão (`PLAYWRIGHT_GREP=@executavel`) |
| `@rascunho` | Incompleto. Nunca junto de `@executavel` |
| `@massa` | Bloqueado por dados de teste ou perfil ausente; `test.skip` com motivo |
| `@sem-ui` | Sem UI e sem API para assertar |
| `@api` | Asserta via request HTTP |
| `@variante` | Variação extra de um CA |
| `@jornada` | Fluxo entre US |

**Classes da triagem** (uma por falha)

| Classe | Significado | O que acontece |
|---|---|---|
| TESTE | Locator / assert / script errado | O agente corrige o spec e reexecuta aquele CA; retoma até `TESTE_RESUME_LIMIT` (padrão 5), depois o caso vai para a quarentena (F7 **Retestar quarentena** roda de novo) |
| PRODUTO | Bug real na aplicação | `PENDENTE.md` + `PRODUTO.json`, notificação no webhook; a suíte segue se `CONTINUE_ON_PRODUTO=true` |
| MASSA | Dado de teste / credencial faltando ou inválido | Sem notificação. Ajuste `dados.json` ou rode `--unblock-massa` |
| AMBIENTE | URL fora, rede, Chromium, timeout de infra ou erro da própria ferramenta | A suíte para; `AVISO-AMBIENTE.md` diz o que verificar |
| INCONCLUSIVO | Evidência insuficiente | Sem notificação |

## Massa e jornada

- **Massa:** `data/projects/<slug>/scripts/massa/dados.json` (ou `dados.md`). Os specs usam `hasMassa()` / `getMassa()` de `helpers/massa`. Preencha com `qaagent-massa` (`npm run generate-massa`).
- **Jornada:** Chromium visível que faz login, escolhe contexto e clica nos controles visíveis (pula logout/excluir). Evidência: `JORNADA.md`. Rode com `qaagent-tour` (`npm run tour`).

A jornada **não** prova todos os CAs e **não** substitui o mapa por perfil. Os specs assertam o *Então*; a jornada registra o que um usuário conseguiu abrir clicando.

## Vários projetos

Cada produto fica numa pasta da ferramenta (não mistura specs/massa): `data/projects/<slug>/scripts/` guarda testes, massa, relatórios e credenciais daquele produto.

O `<slug>` vem da pasta dos requisitos (F3; pai de `requisitos/`), ou `qaagent --project Nome`, ou `QA_PROJECT` no `.env`. Lista: `qaagent --projects`.

Instalação antiga em `data/workspace` continua válida só no projeto `default`, se essa pasta ainda existir.

**Limpar o que o agente gerou:** `qaagent --clean` apaga specs, relatórios em `falhas/`, massa gerada e a cópia dos requisitos **do projeto atual**. **Não** apaga `.env`, `data/settings.json` nem `credenciais.md`. `--all` limpa todos os projetos + `data/runs`. Sem TTY use `--yes`.

## Credenciais e segredos

Arquivo de credenciais (modelo: [`templates/credenciais.example.md`](templates/credenciais.example.md)), gravado em `data/projects/<slug>/scripts/credenciais.md`:

```md
url: https://exemplo.com
autenticacao: email
email: qa@exemplo.com
senha: troque-me
```

Para login por CPF use `autenticacao: cpf` e `cpf: ...`.

O helper de login gerado (`scripts/helpers/auth.ts`) funciona com qualquer aplicação: acha os campos de usuário e senha por label, placeholder ou tipo do input. Ajuste no `.env` quando sua aplicação fugir do padrão:

| Variável | Padrão | Uso |
|---|---|---|
| `E2E_LOGIN_PATH` | `/login` | Rota da tela de login |
| `E2E_HOME_PATH` | `/` | Uma rota que exige login (usada para checar sessão existente) |
| `E2E_CONTEXT` | vazio | Nome da empresa / conta / workspace a escolher depois do login; vazio escolhe o primeiro |

Os testes não leem o arquivo de credenciais. O orquestrador injeta `BASE_URL`, `E2E_AUTH_KIND`, `E2E_LOGIN`, `E2E_SENHA` (e `E2E_ACCESS_N_*` / `E2E_USER_<LABEL>_*` para contas extras).

Copie `.env.example` → `.env`; toda configuração está comentada lá. Não commite `.env`, `data/`, `credenciais.md`, `credenciais.json` nem `mcp.json` (todos no `.gitignore`). Ver [SECURITY.md](SECURITY.md).

## Gestores de projeto (MCP)

Os requisitos também podem vir de um **gestor de projetos conectado por MCP** (hoje: Plane). Na F3 escolha **MCP**, digite o nome do servidor em `mcp.json`, escolha o projeto, confira os Épicos e confirme. Só contam itens com a label `Requisitos`; US duplicada fica com o `updated_at` mais recente. Os requisitos são materializados em Markdown local, então o resto do pipeline não muda.

Bugs só são criados no gestor depois que a triagem diz PRODUTO, com deduplicação e arquivo de retomada idempotente se a sincronização falhar.

Detalhes completos, arquivo de configuração e o que ainda não está implementado: [docs/mcp.pt-BR.md](docs/mcp.pt-BR.md).

## Referência da CLI

| Comando | O que faz |
|---|---|
| `qaagent` | TUI (F1–F10) |
| `qaagent --plain` | Assistente em texto (automático sem TTY) |
| `qaagent --plain --reconfigure` | Refaz todas as perguntas de configuração |
| `qaagent --plain --map-roteiro` | Etapa 2: só mapa + roteiro |
| `qaagent --plain --scripts-only` | Etapa 3: gera specs reusando o mapa |
| `qaagent --plain --tests-only` | Etapa 4: Playwright + triagem nos specs existentes |
| `qaagent --plain --audit-only` | Só auditoria de cobertura, sem Playwright |
| `qaagent --plain --deepen-stubs` | Agente aprofunda specs stub (`DEEPEN_LIMIT`) |
| `qaagent --plain --unblock-massa` | Prepara massa e tenta desbloquear casos `@massa` (`MASSA_UNBLOCK_LIMIT`) |
| `qaagent --plain --tour` | Só a jornada headed |
| `qaagent --plain --load-only` | Só smoke/carga k6 |
| `qaagent --project NOME` | Usa / cria esse projeto (grava em settings) |
| `qaagent --projects` | Lista projetos |
| `qaagent --clean [--all] [--yes]` | Apaga artefatos gerados |
| `qaagent --help` · `--version` (`-v`) | Ajuda · versão |

Atalhos: `qaagent-audit`, `qaagent-deepen`, `qaagent-unblock`, `qaagent-massa` (gera massa), `qaagent-tour`, `qaagent-k6`, `qaagent-reports` (lista relatórios), `qaagent-clean`.

## API HTTP (opcional)

```bash
npm run serve
```

Escuta em `127.0.0.1:8787`. `POST /v1/runs` aceita `{ requisitosPath, baseUrl, authKind, login, senha, credentialsMd }`. Senhas **não** vão para `run.json`. Defina `QA_AGENT_TOKEN` no `.env` para exigir Bearer.

## Solução de problemas

| Sintoma | Solução |
|---|---|
| `qaagent` não encontrado após instalar | Abra um **terminal novo** (o PATH é lido na abertura) |
| F1 recusa a chave do Cursor | Chave Team Admin não é aceita; crie uma chave **de usuário** |
| URL Git na F3 falha | Instale o Git e confira se está no PATH; em repo privado o token vai no segundo campo da F3, não na URL |
| `ECONNRESET` do agente no Windows | Mantenha `CURSOR_USE_HTTP1=true` (padrão) no `.env` |
| Specs falham no login, ou entram mas caem na empresa / conta errada | Defina `E2E_LOGIN_PATH`, `E2E_HOME_PATH` e `E2E_CONTEXT` no `.env` (ver [Credenciais e segredos](#credenciais-e-segredos)) |
| A UI do app mudou mas a rodada reusa o mapa antigo | **R** na etapa 1 ou 2 |
| Etapa 4 diz que não há specs | Rode antes a etapa 3 (Scripts) |
| `qaagent --clean` falha com "Sem TTY" | Adicione `--yes` |
| A suíte para com AMBIENTE | Leia `AVISO-AMBIENTE.md`; é problema de infra / ferramenta, não bug do app |

## Cobrança

`CURSOR_API_KEY` / `LLM_API_KEY` cobra **seu** plano. Geração de specs e triagem consomem runs de agente. O Playwright em si não.

## Contribuir

[CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) · licença [MIT](LICENSE)

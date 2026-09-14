# QA Agent

**Requisitos entram. Playwright sai. O modelo tria a falha — não é o oráculo do teste.**

CLI local (TUI + modo texto) que transforma US/CA em specs Playwright, mapeia a UI por perfil, gera massa em runtime, executa a suíte e classifica a primeira falha com LLM.

[English README](README.md) · [Wiki](https://github.com/ErickGomesSilva/qa-agent/wiki)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933)](https://nodejs.org)

## O que faz

1. **Lê** requisitos em markdown (US / CA).
2. **Mapeia** a UI com Playwright **por cada login da F5** (menu, controles, HTTP 401/403) e cruza com os requisitos → `ROTEIRO.json`.
3. **Gera** specs Playwright a partir do roteiro (`loginAs` por perfil; heading **não** prova consulta), com tags `@executavel`, `@rascunho`, `@massa` ou `@sem-ui`.
4. **Explora** o restante (agente de RN + **jornada** opcional com cliques reais). O crawl de um único login foi substituído pelo mapa por perfil.
5. **Preenche** massa em runtime via `dados.json` / `dados.md`.
6. **Roda** Playwright (`--max-failures=1`). Na falha, **tria** com LLM: TESTE / PRODUTO / MASSA / AMBIENTE / INCONCLUSIVO.
7. **TESTE** com correção de locator pode retomar; **PRODUTO** pode seguir a suíte e notificar Discord / Slack / Teams.

A chave da API fica na sua máquina. O runtime do agente é **local** (alcança URL interna).

## Requisitos

- Node.js **≥ 22.13**
- Chave de API **de usuário** ([Cursor](https://cursor.com/dashboard/settings/api-keys) ou compatível OpenAI). Chaves Team Admin do Cursor **não** funcionam.
- URL da aplicação e pelo menos um login para E2E.

## Instalar (uma linha)

**Node.js ≥ 22.13** precisa estar no PATH ([nodejs.org](https://nodejs.org)).

**Windows** (PowerShell):

```powershell
irm https://raw.githubusercontent.com/ErickGomesSilva/qa-agent/main/install.ps1 | iex
```

**Linux / macOS**:

```bash
curl -fsSL https://raw.githubusercontent.com/ErickGomesSilva/qa-agent/main/install.sh | bash
```

O script baixa o app para `%LOCALAPPDATA%\qa-agent` (Windows) ou `~/.local/share/qa-agent` (Linux/macOS), roda `npm install`, instala Chromium e coloca `qaagent` no PATH. Abra um **terminal novo** e rode `qaagent`.

**Atualizar:** rode o mesmo comando de instalação. Ele baixa o código novo e **preserva** `.env` e `data/`.

Pasta customizada: `$env:QA_AGENT_HOME="D:\tools\qa-agent"` (Windows) ou `QA_AGENT_HOME=~/qa-agent` (Unix) antes da linha de comando.

**Confiança:** `| iex` / `| bash` executa código do GitHub. Leia [`install.ps1`](install.ps1) e [`install.sh`](install.sh) antes, ou clone o repo e rode `node instalar.mjs`. Ver [SECURITY.md](SECURITY.md).

### Já clonou o repositório?

| SO | Comando |
|---|---|
| Windows | `.\instalar.ps1` ou `.\instalar.cmd` |
| Linux / macOS | `chmod +x instalar && ./instalar` |
| Qualquer SO | `node instalar.mjs` ou `npm run setup` |

### Desinstalar

Só remove o comando do PATH — mantém `.env`, `data/` e a pasta de instalação.

**Windows:**

```powershell
cd $env:LOCALAPPDATA\qa-agent; node desinstalar.mjs
```

**Linux / macOS:**

```bash
cd ~/.local/share/qa-agent && node desinstalar.mjs
```

Sem instalador: `npm install`, `npx playwright install chromium`, `npm start`.

## Abas (TUI)

| Tecla | Aba | Função |
|---|---|---|
| F1 | Chave | API Cursor / OpenAI / Claude / OpenRouter / Groq / custom |
| F2 | Modelo | Modelos da chave escolhida |
| F3 | Requisitos | Pasta local **ou** URL Git (GitHub, Gitea, Azure DevOps, GitLab, Bitbucket) |
| F4 | URL | Aplicação sob teste |
| F5 | Login | 1–10 contas ou arquivo `.md` / `.json` |
| F6 | Webhook | Opcional; avisa bug confirmado na aplicação (não erro de teste) |
| F7 | Opções | **Rodar tudo**, k6, massa, jornada, headed, grep, idioma, seguir após PRODUTO, retestar quarentena |
| F8 | Missão | Inicia rodada + telemetria ao vivo (**R** = regenerar specs **e** forçar novo mapa/roteiro) |
| F9 | Consulta | **1** relatórios · **2** matriz · **3** quarentena · **4** jornadas · **5** problemas |
| F10 | Agente | Feed ao vivo do LLM (tools, texto, rounds) enquanto a F8 está NO AR · **End** segue ao vivo · **C** limpa |

No fim de cada rodada a telemetria da F8 mostra **Como retomar** (também em `RETOMAR.md` / F9).

Enter grava a aba. Na F8, Enter inicia a rodada. Sem TTY: `qaagent --plain`. Reconfigurar: `qaagent --plain --reconfigure`.

Na F3 vale **pasta local** ou **URL Git**: GitHub, Gitea/Forgejo/Codeberg (`/src/branch/…`), Azure DevOps (`_git/…?path=`), GitLab (`/-/tree/…`), Bitbucket, ou `https://host/repo.git docs/requisitos`. Repo privado: **Tab** no segundo campo da F3 e cole o token — a ferramenta grava `QA_GIT_TOKEN` no `.env` (não cole o PAT na URL). O clone fica em `data/cache/git/` e atualiza a cada missão. **Git precisa estar no PATH.**

Na F7, **Rodar tudo = SIM** liga k6, massa, jornada e navegador visível. Espaço alterna; Enter grava em `.env` + `data/settings.json`.

## Comandos extras

```text
qaagent --plain
qaagent --plain --audit-only
qaagent --plain --deepen-stubs
qaagent --plain --unblock-massa
qaagent --plain --tour
qaagent --plain --load-only
qaagent --help
qaagent --project Portal-Rural
qaagent --projects
qaagent --clean
qaagent --clean --all --yes

qaagent-audit
qaagent-deepen
qaagent-unblock
qaagent-massa
qaagent-tour
qaagent-k6
qaagent-reports
qaagent-clean
```

## Vários projetos

Cada produto fica numa pasta da ferramenta (não mistura specs/massa):

`data/projects/<slug>/scripts/` — testes, massa, falhas, credenciais desse produto.

O `<slug>` vem da pasta dos requisitos (F3; pai de `requisitos/`), ou `qaagent --project Nome`, ou `QA_PROJECT` no `.env`. Lista: `qaagent --projects`.

Instalação antiga em `data/workspace` continua válida só no projeto `default`, se essa pasta ainda existir.

## Limpar o que o agente gerou

`qaagent --clean` (ou `qaagent-clean`) apaga specs, relatórios em `falhas/`, massa gerada e a cópia de requisitos **do projeto atual**. Não apaga `.env`, `data/settings.json` nem `credenciais.md`. `--all` limpa todos os projetos + `data/runs`. Sem TTY use `--yes`.

## Segredos

Não commite `.env`, `data/`, `credenciais.md`, `credenciais.json` nem `mcp.json` (todos no `.gitignore`). Copie `.env.example` → `.env`. Detalhes em [SECURITY.md](SECURITY.md).

Arquivo de credenciais (exemplo em `templates/credenciais.example.md`):

```md
url: https://exemplo.com
autenticacao: email
email: qa@exemplo.com
senha: troque-me
```

Os testes não leem esse arquivo diretamente; o orquestrador injeta variáveis `E2E_*` no Playwright.

## Fases da rodada (mapa → roteiro → specs)

Na missão completa a ordem é:

1. Sincronizar `requisitos/`
2. **Mapa por perfil** (Playwright, sem LLM) → `scripts/falhas/MAPA-PERFIL.json` — um crawl por conta da F5; registra menu, controles visíveis/ausentes e HTTP **401/403** same-origin (não só 5xx)
3. **Join** requisitos ∩ mapa ∩ labels F5 → `scripts/falhas/ROTEIRO.json` (`us`, `ca`, `perfil`, `onde`, `fazer`, `esperado`, `specHint`)
4. **Generate** lê roteiro + mapa + requisitos (`loginAs` no perfil da linha; consulta ≠ heading)
5. Auditoria, massa, Playwright, triagem (como antes)
6. Relatórios: `COBERTURA-RESUMO-*.md` + **`PROBLEMAS.md`** — bloqueios (massa/perfil), falhas Playwright com erro, produto, HTTP 4xx do mapa, CAs sem spec, stubs. F9 → **5 Problemas**.
7. Em **erro fatal** (agente Cursor caiu, limite de loops, etc.): grava `scripts/falhas/FALHA-FATAL.md` (+ `.json`) com onde parou, marcos concluídos e próximos passos — e imprime o resumo no log da F8 / CLI.
8. Em **qualquer desfecho** (fatal, pausa, triagem TESTE/PRODUTO/MASSA/AMBIENTE, suíte ok…): grava `scripts/falhas/RETOMAR.md` e imprime na telemetria o bloco **Como retomar** — o que já pode reaproveitar (mapa/roteiro/specs) e o que fazer no próximo Enter (quase sempre **sem R**).
9. **Pausa:** durante a rodada, **P** ou **Esc** pede pausa no próximo checkpoint e grava `scripts/falhas/CONTINUAR.md` (guia de retomada). Enter na F8 retoma (pula lógica/jornada conforme o guia). Esc com a rodada **parada** ainda sai do TUI; **Ctrl+C** encerra o processo.

### Reuso de mapa e roteiro

`MAPA-PERFIL.json` e `ROTEIRO.json` guardam um **fingerprint** dos inputs (URL, F5, escopo, profundidade de crawl; o roteiro inclui também os hashes dos CAs).

| Situação | Comportamento |
|----------|----------------|
| Fingerprints iguais aos da rodada anterior | **Reutiliza** mapa e roteiro (sem novo crawl Playwright) |
| Só requisitos/CAs mudaram | **Reutiliza o mapa**; **refaz só o roteiro** |
| URL, F5, escopo ou crawl mudaram (ou arquivo antigo sem fingerprint) | **Refaz mapa + roteiro** |
| Tecla **R** (regenerate) na F8 | **Força** mapa + roteiro + reescrita de specs |

Mudança só na UI do app (sem alterar URL/F5/requisitos) **não** invalida o cache — use **R** regenerate.

Specs Playwright: se já existirem arquivos em `scripts/tests`, a geração é pulada salvo **R** regenerate (igual às versões anteriores).

Run **geral** e **focado** usam o mesmo motor. Recorte em `data/projects/<slug>/scripts/escopo.json` (exemplo em `escopo.example.json`) ou env:

```json
{ "modo": "focado", "labels": ["operador"], "paths": ["/app/documentos"] }
```

- `QA_ESCOPO_MODO=geral|focado`
- `QA_ESCOPO_LABELS=operador,visitante`
- `QA_ESCOPO_PATHS=/app/docs,/app/fila`

Se o F5 tiver **um** acesso e as US citarem **vários** papéis, a rodada grava aviso de cobertura de permissão incompleta — não trata variante de perfil como coberta.

A jornada headed (F7) continua opcional; **não** substitui o mapa por perfil.

## API HTTP (opcional)

```bash
npm run serve
```

Escuta em `127.0.0.1:8787`. `POST /v1/runs` aceita `{ requisitosPath, baseUrl, authKind, login, senha, credentialsMd }`. Senhas **não** vão para `run.json`. Use `QA_AGENT_TOKEN` no `.env` para exigir Bearer.

## Cobrança

`CURSOR_API_KEY` / `LLM_API_KEY` cobra **seu** plano. Geração de specs e triagem consomem runs de agente. Playwright em si não.

## Contribuir

[CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) · licença [MIT](LICENSE)

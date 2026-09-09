# QA Agent

**Requisitos entram. Playwright sai. O modelo tria a falha — não é o oráculo do teste.**

CLI local (TUI + modo texto) que transforma US/CA em specs Playwright, explora a aplicação, opcionalmente simula cliques reais, gera massa em runtime, executa a suíte e classifica a primeira falha com LLM.

[English README](README.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933)](https://nodejs.org)

## O que faz

1. **Lê** requisitos em markdown (US / CA).
2. **Gera** specs Playwright com tags `@executavel`, `@rascunho`, `@massa` ou `@sem-ui`.
3. **Explora** a UI (crawler + **jornada** opcional com cliques reais).
4. **Preenche** massa em runtime via `dados.json` / `dados.md`.
5. **Roda** Playwright (`--max-failures=1`). Na falha, **tria** com LLM: TESTE / PRODUTO / MASSA / AMBIENTE / INCONCLUSIVO.
6. **TESTE** com correção de locator pode retomar; **PRODUTO** pode seguir a suíte e notificar Discord / Slack / Teams.

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
| F3 | Requisitos | Pasta com US/CA |
| F4 | URL | Aplicação sob teste |
| F5 | Login | 1–10 contas ou arquivo `.md` / `.json` |
| F6 | Webhook | Opcional, só PRODUTO |
| F7 | Opções | **Rodar tudo**, k6, massa, jornada, headed, grep, idioma, seguir após PRODUTO, retestar quarentena |
| F8 | Missão | Inicia rodada + telemetria ao vivo |
| F9 | Consulta | **1** relatórios · **2** matriz · **3** quarentena · **4** jornadas |

Enter grava a aba. Na F8, Enter inicia a rodada. Sem TTY: `qaagent --plain`. Reconfigurar: `qaagent --plain --reconfigure`.

Na F7, **Rodar tudo = SIM** liga k6, massa, jornada e navegador visível. Espaço alterna; Enter grava em `.env` + `data/settings.json`.

## Comandos extras

```text
qaagent --plain
qaagent --plain --audit-only
qaagent --plain --deepen-stubs
qaagent --plain --unblock-massa
qaagent --plain --tour
qaagent --plain --load-only

qaagent-audit
qaagent-deepen
qaagent-unblock
qaagent-massa
qaagent-tour
qaagent-k6
qaagent-reports
```

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

## API HTTP (opcional)

```bash
npm run serve
```

Escuta em `127.0.0.1:8787`. `POST /v1/runs` aceita `{ requisitosPath, baseUrl, authKind, login, senha, credentialsMd }`. Senhas **não** vão para `run.json`. Use `QA_AGENT_TOKEN` no `.env` para exigir Bearer.

## Cobrança

`CURSOR_API_KEY` / `LLM_API_KEY` cobra **seu** plano. Geração de specs e triagem consomem runs de agente. Playwright em si não.

## Contribuir

[CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) · licença [MIT](LICENSE)

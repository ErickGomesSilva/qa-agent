# QA Agent

**Requisitos entram. Playwright sai. O modelo tria a falha — não é o oráculo do teste.**

CLI local (TUI + modo texto) que transforma US/CA em specs Playwright, explora a aplicação, opcionalmente simula cliques reais, gera massa em runtime, executa a suíte e classifica a primeira falha com LLM.

[English README](README.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## O que faz

Gera specs a partir de requisitos, rastreia a UI, pode gerar `dados.json` de massa, pode abrir o Chromium e clicar como pessoa (jornada), roda Playwright e tria TESTE / PRODUTO / MASSA / AMBIENTE / INCONCLUSIVO.

A chave da API fica na sua máquina. O runtime do agente é **local** (alcança URL interna).

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

## Abas

| Tecla | Aba |
|---|---|
| F1 | Chave de API |
| F2 | Modelo |
| F3 | Pasta de requisitos |
| F4 | URL da aplicação |
| F5 | Logins (1–10 ou arquivo `.md`/`.json`) |
| F6 | Webhook (opcional, só PRODUTO) |
| F7 | Opções: **Rodar tudo**, k6, massa, jornada, headed, grep, idioma |
| F8 | Missão |
| F9 | Resumos |

Na F7, **Rodar tudo = SIM** liga k6, massa, jornada e navegador visível. Espaço alterna; Enter grava.

Sem TTY: `qaagent --plain`. Sem instalar: `npm start`.

Comandos: `qaagent-massa`, `qaagent-tour`, `qaagent-audit`, `qaagent-deepen`, `qaagent-unblock`, `qaagent-k6`, `qaagent-reports`.

## Segredos

Não commite `.env` nem `data/` (credenciais, settings, evidências). Copie `.env.example`.

## Contribuir

[CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) · licença [MIT](LICENSE)

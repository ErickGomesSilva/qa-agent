# QA Agent

**Requirements in. Playwright out. The model triages failures — it is not the test oracle.**

Local CLI (TUI + plain mode) that turns user stories / acceptance criteria into Playwright specs, crawls the app, optionally simulates real clicks, generates runtime test data, runs the suite, and classifies the first failure with an LLM.

[Português](README.pt-BR.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933)](https://nodejs.org)

## What it does

1. **Reads** markdown requirements (US / CA).
2. **Generates** Playwright specs tagged `@executavel`, `@rascunho`, `@massa`, or `@sem-ui`.
3. **Explores** the UI (link crawler + optional headed **tour** that clicks like a person).
4. **Seeds** optional runtime mass from `dados.json` / `dados.md`.
5. **Runs** Playwright (`--max-failures=1`). On failure, an **agent triages**: TESTE / PRODUTO / MASSA / AMBIENTE / INCONCLUSIVO.
6. **TESTE** + locator fix can auto-resume. **PRODUTO** can notify Discord / Slack / Teams.

Your Cursor/OpenAI key stays on your machine. The agent runtime is **local** — it can reach internal URLs that a cloud agent cannot.

## Requirements

- Node.js **≥ 22.13**
- A **user** API key ([Cursor](https://cursor.com/dashboard/settings/api-keys) or OpenAI-compatible). Team Admin Cursor keys are **not** accepted.
- An application URL and at least one login for E2E.

## Install (one line)

**Node.js ≥ 22.13** must already be on PATH ([nodejs.org](https://nodejs.org)).

**Windows** (PowerShell):

```powershell
irm https://raw.githubusercontent.com/ErickGomesSilva/qa-agent/main/install.ps1 | iex
```

**Linux / macOS**:

```bash
curl -fsSL https://raw.githubusercontent.com/ErickGomesSilva/qa-agent/main/install.sh | bash
```

The script downloads the app to `%LOCALAPPDATA%\qa-agent` (Windows) or `~/.local/share/qa-agent` (Linux/macOS), runs `npm install`, installs Chromium, and adds `qaagent` to your user PATH. Open a **new** terminal and run `qaagent`.

Override install folder: `$env:QA_AGENT_HOME="D:\tools\qa-agent"` (Windows) or `QA_AGENT_HOME=~/qa-agent` (Unix) before the one-liner.

### Already cloned the repo?

| OS | Command |
|---|---|
| Windows (PowerShell) | `.\instalar.ps1` or `.\instalar.cmd` |
| Linux / macOS | `chmod +x instalar && ./instalar` |
| Any OS | `node instalar.mjs` or `npm run setup` |

### Uninstall

Removes `qaagent` from PATH only — keeps `.env`, `data/`, and the install folder.

**Windows:**

```powershell
cd $env:LOCALAPPDATA\qa-agent; node desinstalar.mjs
```

**Linux / macOS:**

```bash
cd ~/.local/share/qa-agent && node desinstalar.mjs
```

Manual dev setup without installer: `npm install`, `npx playwright install chromium`, `npm start`.

## Keyboard map (TUI)

| Key | Tab | Role |
|---|---|---|
| F1 | Key | Cursor / OpenAI API key |
| F2 | Model | Models for that key |
| F3 | Reqs | Requirements folder |
| F4 | URL | App under test |
| F5 | Login | 1–10 accounts, or a `.md` / `.json` file |
| F6 | Notify | Webhook (optional, PRODUTO only) |
| F7 | Options | **Run all**, k6, mass, tour, headed, grep, locale |
| F8 | Mission | Start the run + live telemetry |
| F9 | Reports | Coverage / k6 markdown |

Enter saves the tab. On F8, Enter starts a run. No TTY: `qaagent --plain`. Reconfigure: `qaagent --plain --reconfigure`.

### F7 — Run all

**Run all = yes** turns on k6, runtime mass, browser tour, and a visible browser (headed + video). Individual toggles stay available. Space flips a switch; Enter persists to `.env` + `data/settings.json`.

## CLI extras

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

## Runtime mass and tour

- **Mass:** `scripts/massa/dados.json` (or `dados.md`). Specs use `hasMassa()` / `getMassa()` from `helpers/massa`. `npm run generate-massa` / `qaagent-massa`.
- **Tour:** headed Chromium that logs in, picks context, clicks visible controls (skips logout/delete). Evidence: `scripts/falhas/JORNADA.md`. `npm run tour` / `qaagent-tour`.

A tour is **not** proof of every CA. Specs assert the *Then*. The tour records what a user could open by clicking.

## Credentials file

```md
url: https://example.com
autenticacao: email
email: qa@example.com
senha: your-password
```

Tests never read this file. The orchestrator injects `BASE_URL`, `E2E_AUTH_KIND`, `E2E_LOGIN`, `E2E_SENHA` (and `E2E_ACCESS_N_*` / `E2E_USER_<LABEL>_*` for extra accounts).

Copy `.env.example` → `.env`. Never commit `.env` or `data/`.

## HTTP API (optional)

```bash
npm run serve
```

Listens on `127.0.0.1:8787`. `POST /v1/runs` accepts `{ requisitosPath, baseUrl, authKind, login, senha, credentialsMd }`. Passwords are not written to `run.json`.

## What the agent will not do

- It is not a test oracle. Playwright is.
- It will not change product copy so a locator passes.
- It will not Discord-notify TESTE / MASSA / AMBIENTE / INCONCLUSIVO.

## Billing

`CURSOR_API_KEY` / `LLM_API_KEY` bills **your** plan. Script generation and triage consume agent runs. Playwright itself does not.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Security: [SECURITY.md](SECURITY.md). License: [MIT](LICENSE).

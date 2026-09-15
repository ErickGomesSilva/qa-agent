# QA Agent

**Requirements in. Playwright out. The model triages failures — it is not the test oracle.**

Local CLI (TUI + plain mode) that turns user stories / acceptance criteria into Playwright specs, maps the UI per login, generates runtime test data, runs the suite, and classifies the first failure with an LLM.

[Português](README.pt-BR.md) · [Wiki](https://github.com/ErickGomesSilva/qa-agent/wiki)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933)](https://nodejs.org)

## What it does

1. **Reads** markdown requirements (US / CA).
2. **Maps** the UI with Playwright **per F5 login** (menu, controls, HTTP 401/403) and joins that with the requirements → `ROTEIRO.json`.
3. **Generates** Playwright specs from the roteiro (`loginAs` per profile; a page **heading is not** proof of a query), tagged `@executavel`, `@rascunho`, `@massa`, or `@sem-ui`.
4. **Explores** remaining RNs (optional headed **tour**). A single-login crawl no longer drives generate.
5. **Seeds** optional runtime mass from `dados.json` / `dados.md`.
6. **Runs** Playwright (`--max-failures=1`). On failure, an **agent triages**: TESTE / PRODUTO / MASSA / AMBIENTE / INCONCLUSIVO.
7. **TESTE** + locator fix can auto-resume. **PRODUTO** can notify Discord / Slack / Teams.

Your Cursor/OpenAI key stays on your machine. The agent runtime is **local** — it can reach internal URLs that a cloud agent cannot.

Full guide: [GitHub wiki](https://github.com/ErickGomesSilva/qa-agent/wiki).

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

**Update:** run the same one-liner again. It refreshes the code and **keeps** `.env` and `data/`.

Override install folder: `$env:QA_AGENT_HOME="D:\tools\qa-agent"` (Windows) or `QA_AGENT_HOME=~/qa-agent` (Unix) before the one-liner.

**Trust:** piping to `iex` / `bash` runs code from GitHub. Review [`install.ps1`](install.ps1) and [`install.sh`](install.sh) first, or clone the repo and run `node instalar.mjs` instead. See [SECURITY.md](SECURITY.md).

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
| F3 | Reqs | Local folder **or** Git URL (GitHub, Gitea, Azure DevOps, GitLab, Bitbucket) |
| F4 | URL | App under test |
| F5 | Login | 1–10 accounts, or a `.md` / `.json` file |
| F6 | Notify | Webhook (optional; confirmed app bugs, not test errors) |
| F7 | Options | **Run all**, k6, mass, tour, headed, grep, locale, continue after PRODUTO, retest quarantine |
| F8 | Mission | Start the run + live telemetry (**R** = regenerate specs **and** force a fresh map/roteiro) |
| F9 | Consult | **1** reports · **2** matrix · **3** quarantine · **4** journeys · **5** problems |
| F10 | Agent | Live LLM feed (tools, text, rounds) · shows **● SESSION ACTIVE** / **○ SESSION ENDED** with duration · **End** follow live · **C** clear |

When a run ends, F8 telemetry shows **How to resume** (also `RETOMAR.md` / F9).

Enter saves the tab. On F8, Enter starts a run. No TTY: `qaagent --plain`. Reconfigure: `qaagent --plain --reconfigure`.

F3 accepts a **local folder** or a **Git URL**: GitHub, Gitea/Forgejo/Codeberg (`/src/branch/…`), Azure DevOps (`_git/…?path=`), GitLab (`/-/tree/…`), Bitbucket, or `https://host/repo.git docs/requisitos`. Private repo: **Tab** to the second F3 field and paste the token — the tool stores `QA_GIT_TOKEN` in `.env` (do not put the PAT in the URL). The clone lives in `data/cache/git/` and is refreshed each run. **Git must be on PATH.**

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

## Round pipeline (map → roteiro → specs)

1. Sync `requisitos/`
2. **Per-profile map** (Playwright, no LLM) → `scripts/falhas/MAPA-PERFIL.json`
3. Join requirements ∩ map ∩ F5 labels → `scripts/falhas/ROTEIRO.json`
4. **Generate** reads roteiro + map + requirements (unless specs already exist)
5. Audit, mass, Playwright, triage
6. Reports: coverage + **`PROBLEMAS.md`**. On a **fatal** interrupt also writes `FALHA-FATAL.md`. Every terminal outcome writes **`RETOMAR.md`** and prints a **How to resume** block in telemetry (what to reuse + next Enter, usually without **R**). **Pause:** press **P** or **Esc** during a run to stop at the next checkpoint and write `CONTINUAR.md`; Enter on F8 resumes (skips logic/tour per the guide). Esc while idle still quits the TUI.

### Reusing map and roteiro

Both files store an **input fingerprint** (URL, F5, scope, crawl depth; the roteiro also includes CA hashes). Matching fingerprints **reuse** the crawl; requirement-only changes **rebuild the roteiro** from the cached map; **R** regenerate forces map + roteiro + specs. UI-only product changes do not invalidate the cache — press **R**.

## Multiple projects

Each product lives under the tool (specs and mass are not mixed):

`data/projects/<slug>/scripts/` — tests, mass, reports, credentials for that product.

`<slug>` comes from the requirements folder (F3; parent of `requisitos/`), or `qaagent --project Name`, or `QA_PROJECT` in `.env`. List: `qaagent --projects`.

A leftover `data/workspace` is only used for the `default` project if that folder still exists.

## Wipe generated artifacts

`qaagent --clean` (or `qaagent-clean`) deletes specs, `falhas/` reports, generated mass, and the copied requirements **for the current project**. It does **not** delete `.env`, `data/settings.json`, or `credenciais.md`. `--all` cleans every project plus `data/runs`. Without a TTY, pass `--yes`.

## Runtime mass and tour

- **Mass:** `data/projects/<slug>/scripts/massa/dados.json` (or `dados.md`). Specs use `hasMassa()` / `getMassa()` from `helpers/massa`. `npm run generate-massa` / `qaagent-massa`.
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

Copy `.env.example` → `.env`. Never commit `.env`, `data/`, `credenciais.md`, `credenciais.json`, or `mcp.json` (all gitignored). See [SECURITY.md](SECURITY.md).

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

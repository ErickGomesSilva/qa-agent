# QA Agent

**Requirements in. Playwright out. The model triages failures — it is not the test oracle.**

Local CLI (TUI + plain mode) that turns user stories / acceptance criteria into Playwright specs, maps the UI per login, generates runtime test data, runs the suite, and classifies the first failure with an LLM.

[Português](README.pt-BR.md) · [Wiki](https://github.com/ErickGomesSilva/qa-agent/wiki) · [Changelog](CHANGELOG.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.13-339933)](https://nodejs.org)

<!-- TODO: TUI screenshot or GIF (F8 running + F10 agent feed). -->

## What it does

1. **Reads** markdown requirements (US / CA) from a local folder, a Git URL, or a project manager via MCP.
2. **Maps** the UI with Playwright **per F5 login** (menu, controls, HTTP 401/403) and joins that with the requirements → `ROTEIRO.json`.
3. **Generates** Playwright specs from the roteiro (`loginAs` per profile; a page **heading is not** proof of a query), tagged `@executavel`, `@rascunho`, `@massa`, or `@sem-ui`.
4. **Explores** remaining business rules (RN), plus an optional headed **tour** with real clicks.
5. **Seeds** optional runtime test data from `dados.json` / `dados.md`.
6. **Runs** Playwright (`--max-failures=1`). On failure, an **agent triages** it as TESTE, PRODUTO, MASSA, AMBIENTE, or INCONCLUSIVO (see [Glossary](#glossary)).
7. **TESTE** with a locator fix can auto-resume. **PRODUTO** can keep the suite going and notify Discord / Slack / Teams.

Your API key stays on your machine. The agent runtime is **local**, so it can reach internal URLs that a cloud agent cannot.

## What the agent will not do

- It is not a test oracle. Playwright is.
- It will not change product copy so a locator passes.
- It will not mark a spec `@executavel` if the *Then* is not asserted. The audit downgrades stubs.
- It will not notify on TESTE / MASSA / AMBIENTE / INCONCLUSIVO, only on confirmed PRODUTO.

## Quickstart

1. Install (one line, see [Install](#install)), then open a **new** terminal.
2. Run `qaagent`.
3. **F1**: paste your API key. **F2**: pick a model.
4. **F3**: point to the folder (or Git URL) with your requirements, written in the [requirement format](#requirement-format).
5. **F4**: the app URL. **F5**: at least one login.
6. **F8**: press **Enter** to start a full run. Watch telemetry there and the LLM feed on **F10**.
7. When it ends, read **F9 → 5 Problems** (`PROBLEMAS.md`) and the **How to resume** block (`RETOMAR.md`).

## Requirements

- Node.js **≥ 22.13**
- A **user** API key for one of: [Cursor](https://cursor.com/dashboard/settings/api-keys), OpenAI, Claude (Anthropic), OpenRouter, Groq, or any OpenAI-compatible endpoint (Custom). Cursor **Team Admin** keys are **not** accepted.
- An application URL and at least one login for E2E.
- **Git** on PATH, only if F3 points to a Git URL.

## Install

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

Manual dev setup without installer: `npm install`, `npx playwright install chromium`, `npm start`.

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

## Requirement format

The tool reads every `.md` / `.txt` file under the F3 folder (recursively). Minimal example:

```md
# US_LOGIN_001 — Sign in with e-mail

### CA1 (US_LOGIN_001)
**Dado** an active user
**Quando** they enter a valid e-mail and password
**Então** they see the home dashboard

### CA2 (US_LOGIN_001)
**Dado** an active user
**Quando** they enter a wrong password
**Então** they see "Invalid credentials" and stay on the login page
```

Rules the parser relies on:

- **US ID:** `US_` followed by uppercase letters, digits or `_` (e.g. `US_LOGIN_001`).
- **CA ID:** `CA` followed by digits (`CA1`, `CA12`). `CA-1` is **not** recognized.
- **One block per CA**, starting with `### CA<n>` or `**CA<n>`.
- **Repeat the US ID inside each CA block** (heading or `<!-- US_LOGIN_001 -->`). If a file has a single US and no block carries it, the tool still finds the CAs, but cannot extract the *Then*, so change detection is weaker.
- **`**Então**` in bold** is the expected result. Its text is hashed: editing it rebuilds the roteiro and flags the CA as changed.
- **Business rules:** `RN_X` / `RN-X` / `RNX` anywhere in the file; the RN agent explores them.
- *Dado / Quando* are free text read by the LLM, not parsed.

## Keyboard map (TUI)

| Key | Tab | Role |
|---|---|---|
| F1 | Key | API key: Cursor, OpenAI, Claude, OpenRouter, Groq, or Custom (OpenAI-compatible) |
| F2 | Model | Models for that key |
| F3 | Reqs | **Local / Git / MCP** source (keys 1/2/3) |
| F4 | URL | App under test |
| F5 | Login | 1–10 accounts, or a `.md` / `.json` file |
| F6 | Notify | Webhook (optional; confirmed app bugs, not test errors) |
| F7 | Options | **Run all**, k6, mass, tour, headed, grep, locale, continue after PRODUTO, retest quarantine |
| F8 | Mission | Stage via **1–4** (Full, Map+route, Scripts, Tests) + live telemetry. **R** on stage 2 recrawls; on stage 3 rewrites specs without a crawl |
| F9 | Consult | **1** reports · **2** matrix · **3** quarantine · **4** journeys · **5** problems |
| F10 | Agent | Live LLM feed (tools, text, rounds) · shows **● SESSION ACTIVE** / **○ SESSION ENDED** with duration · **End** follow live · **C** clear |

Enter saves the tab. On F8, Enter starts a run. **P** or **Esc** during a run pauses at the next checkpoint; **Esc** while idle quits; **Ctrl+C** kills the process. Without a TTY the tool falls back to `qaagent --plain`.

**F3 — Git:** GitHub, Gitea/Forgejo/Codeberg (`/src/branch/…`), Azure DevOps (`_git/…?path=`), GitLab (`/-/tree/…`), Bitbucket, or `https://host/repo.git docs/requisitos`. Private repo: **Tab** to the second F3 field and paste the token — the tool stores `QA_GIT_TOKEN` in `.env` (do not put the PAT in the URL). The clone lives in `data/cache/git/` and is refreshed each run.

**F3 — MCP:** see [Project managers (MCP)](#project-managers-mcp).

**F7 — Run all = yes** turns on k6, runtime mass, browser tour, and a visible browser (headed + video). Individual toggles stay available. Space flips a switch; Enter persists to `.env` + `data/settings.json`.

## Run pipeline

A **full** run does, in order:

1. Sync `requisitos/` (and write `SYNC-DIFF.json`: new / changed / orphan CAs).
2. **Per-profile map** (Playwright, no LLM) → `MAPA-PERFIL.json`. One crawl per F5 account; records menu, visible/missing controls and same-origin HTTP **401/403** (not only 5xx).
3. **Join** requirements ∩ map ∩ F5 labels → `ROTEIRO.json` (`us`, `ca`, `perfil`, `onde`, `fazer`, `esperado`, `specHint`).
4. **Generate** specs from roteiro + map + requirements. Skipped if specs already exist, unless you press **R**.
5. Audit, runtime mass, Playwright, triage.
6. Reports: `COBERTURA-RESUMO-<slug>.md` + **`PROBLEMAS.md`** (blockers, failures, product bugs, HTTP 4xx from the map, CAs without spec, stubs).
7. On a **fatal** error (agent crashed, loop limit…): `FALHA-FATAL.md` with where it stopped and next steps.
8. On **every** outcome: `RETOMAR.md` + a **How to resume** block in telemetry (what can be reused, what the next Enter does — usually without **R**).
9. **Pause** (P / Esc): stops at the next checkpoint and writes `CONTINUAR.md`. Enter on F8 resumes.

### Stages (F8 keys 1–4)

| Key | Stage | Runs | Stops after |
|---|---|---|---|
| 1 | Full | Everything above | Reports |
| 2 | Map+route | Steps 1–3 | `ROTEIRO.json` |
| 3 | Scripts | Steps 1–4; **R** rewrites specs without a new crawl | Specs written (no Playwright) |
| 4 | Tests | Playwright + triage on existing specs | Reports. Fails if `scripts/tests` is empty |

### Reusing map and roteiro

`MAPA-PERFIL.json` and `ROTEIRO.json` store an **input fingerprint** (URL, F5, scope, crawl depth; the roteiro also includes CA hashes).

| Situation | Behavior |
|---|---|
| Same fingerprints as last run | **Reuse** map and roteiro (no new crawl) |
| Only requirements / CAs changed | **Reuse the map**, rebuild only the roteiro |
| URL, F5, scope or crawl depth changed (or old file without fingerprint) | Rebuild map + roteiro |
| **R** on Full or Map+route | **Force** a new crawl |
| **R** on Scripts | Rewrite specs, **reuse** the map |

A UI-only change in the product (same URL / F5 / requirements) does **not** invalidate the cache — press **R**.

### Focused runs

Full and focused runs use the same engine. Narrow the map/roteiro in `data/projects/<slug>/scripts/escopo.json` (template: [`templates/workspace/escopo.example.json`](templates/workspace/escopo.example.json)) or via env:

```json
{ "modo": "focado", "labels": ["operador"], "paths": ["/app/documentos"] }
```

- `QA_ESCOPO_MODO=geral|focado`
- `QA_ESCOPO_LABELS=operador,visitante`
- `QA_ESCOPO_PATHS=/app/docs,/app/fila`

If F5 has **one** account and the US mention **several** roles, the run writes an incomplete-permission-coverage warning instead of treating the other profiles as covered.

## Generated files

Unless noted, everything lands in `data/projects/<slug>/scripts/falhas/`. F9 opens the main ones.

| File | When | What for |
|---|---|---|
| `SYNC-DIFF.json` | Every run | CAs new / changed / orphan vs. specs |
| `MAPA-PERFIL.json` | Map stage | UI seen per F5 profile, HTTP 401/403 |
| `ROTEIRO.json` | Map stage | US × CA × profile: where, what to do, what to expect |
| `MAPA-UI.json`, `EXPLORACAO.json` | Map / RN exploration | Crawl detail and RN findings |
| `AUDITORIA.json` | Audit | Tag and stub check per spec |
| `COBERTURA-RESUMO-<slug>.md` | End of run | Coverage summary (F9 → 1) |
| `MATRIZ.md` / `.json` | End of run | Traceability US × CA × spec × result (F9 → 2) |
| `QUARENTENA.md` / `.json` | A TESTE case exhausts its retries | Cases skipped in normal runs (F9 → 3) |
| `JORNADA.md` / `.json` | Tour | What a user could open by clicking (F9 → 4) |
| `PROBLEMAS.md` / `.json` | End of run | All blockers in one place (F9 → 5) |
| `TRIAGEM.json` | After a failure | Triage class and reasoning |
| `ULTIMA-FALHA.json` | After a failure | Playwright evidence of the last failure |
| `PRODUTO.json`, `PENDENTE.md` | Triage = PRODUTO | Confirmed app bug |
| `AVISO-AMBIENTE.md` | Triage = AMBIENTE | Why the suite stopped and what to check |
| `FALHA-FATAL.md` / `.json` | Fatal error | Where it stopped, milestones done, next steps |
| `CONTINUAR.md` / `.json` | Pause | How the next Enter resumes |
| `RETOMAR.md` / `.json` | Every outcome | What to reuse and how to resume |
| `BUG-SYNC-PENDENTE.md` / `.json` | MCP Bug sync failed | Pending Bug for idempotent retry |
| `SOURCE-MANIFEST.json` | MCP source (in the materialized requirements folder) | Provenance of each US |

Specs live in `scripts/tests/`, test data in `scripts/massa/`, k6 scripts in `scripts/k6/`.

## Glossary

**Spec tags**

| Tag | Meaning |
|---|---|
| `@executavel` | Asserts the *Then*. Included by the default grep (`PLAYWRIGHT_GREP=@executavel`) |
| `@rascunho` | Incomplete. Never together with `@executavel` |
| `@massa` | Blocked by test data or a missing profile; `test.skip` with a reason |
| `@sem-ui` | No UI and no API to assert |
| `@api` | Asserts via HTTP request |
| `@variante` | Extra variation of a CA |
| `@jornada` | Flow across US |

**Triage classes** (one per failure)

| Class | Meaning | What happens |
|---|---|---|
| TESTE | Wrong locator / assert / script | Agent fixes the spec and re-runs that CA; auto-resume up to `TESTE_RESUME_LIMIT` (default 5), then the case goes to quarantine (F7 **Retest quarantine** runs it again) |
| PRODUTO | Real bug in the app | `PENDENTE.md` + `PRODUTO.json`, webhook notification; suite continues if `CONTINUE_ON_PRODUTO=true` |
| MASSA | Test data / credential missing or invalid | No notification. Fix `dados.json` or run `--unblock-massa` |
| AMBIENTE | URL down, network, Chromium, infra timeout, or a QA Agent tool error | Suite stops, `AVISO-AMBIENTE.md` says what to check |
| INCONCLUSIVO | Not enough evidence | No notification |

## Runtime mass and tour

- **Mass:** `data/projects/<slug>/scripts/massa/dados.json` (or `dados.md`). Specs use `hasMassa()` / `getMassa()` from `helpers/massa`. Fill it with `qaagent-massa` (`npm run generate-massa`).
- **Tour:** headed Chromium that logs in, picks context, clicks visible controls (skips logout/delete). Evidence: `JORNADA.md`. Run with `qaagent-tour` (`npm run tour`).

A tour is **not** proof of every CA, and it does **not** replace the per-profile map. Specs assert the *Then*; the tour records what a user could open by clicking.

## Multiple projects

Each product lives under the tool (specs and mass are not mixed): `data/projects/<slug>/scripts/` holds tests, mass, reports and credentials for that product.

`<slug>` comes from the requirements folder (F3; parent of `requisitos/`), or `qaagent --project Name`, or `QA_PROJECT` in `.env`. List: `qaagent --projects`.

A leftover `data/workspace` is only used for the `default` project if that folder still exists.

**Wipe generated artifacts:** `qaagent --clean` deletes specs, `falhas/` reports, generated mass and the copied requirements **for the current project**. It does **not** delete `.env`, `data/settings.json`, or `credenciais.md`. `--all` cleans every project plus `data/runs`. Without a TTY, pass `--yes`.

## Credentials and secrets

Credentials file (template: [`templates/credenciais.example.md`](templates/credenciais.example.md)), stored at `data/projects/<slug>/scripts/credenciais.md`:

```md
url: https://example.com
autenticacao: email
email: qa@example.com
senha: your-password
```

For CPF login use `autenticacao: cpf` and `cpf: ...`.

The generated login helper (`scripts/helpers/auth.ts`) works with any app: it finds the user and password fields by label, placeholder or input type. Tune it in `.env` when your app differs from the defaults:

| Variable | Default | Use |
|---|---|---|
| `E2E_LOGIN_PATH` | `/login` | Route of the login page |
| `E2E_HOME_PATH` | `/` | A route that requires login (used to check an existing session) |
| `E2E_CONTEXT` | empty | Name of the company / account / workspace to pick after login; empty picks the first one |

Tests never read the credentials file. The orchestrator injects `BASE_URL`, `E2E_AUTH_KIND`, `E2E_LOGIN`, `E2E_SENHA` (and `E2E_ACCESS_N_*` / `E2E_USER_<LABEL>_*` for extra accounts).

Copy `.env.example` → `.env`; every setting is documented there. Never commit `.env`, `data/`, `credenciais.md`, `credenciais.json`, or `mcp.json` (all gitignored). See [SECURITY.md](SECURITY.md).

## Project managers (MCP)

Requirements can also come from a **project manager connected via MCP** (today: Plane). On F3 pick **MCP**, type the server name from `mcp.json`, choose the project, review the Epics and confirm. Only items with the `Requisitos` label count; duplicated US keep the most recent `updated_at`. The requirements are materialized as local Markdown, so the rest of the pipeline is unchanged.

Bugs are created in the manager **only** after triage says PRODUTO, with deduplication and an idempotent retry file if sync fails.

Full details, config file, and what is not implemented yet: [docs/mcp.md](docs/mcp.md).

## CLI reference

| Command | What it does |
|---|---|
| `qaagent` | TUI (F1–F10) |
| `qaagent --plain` | Text wizard (automatic without a TTY) |
| `qaagent --plain --reconfigure` | Ask every setup question again |
| `qaagent --plain --map-roteiro` | Stage 2: map + roteiro only |
| `qaagent --plain --scripts-only` | Stage 3: generate specs, reusing the map |
| `qaagent --plain --tests-only` | Stage 4: Playwright + triage on existing specs |
| `qaagent --plain --audit-only` | Coverage audit only, no Playwright |
| `qaagent --plain --deepen-stubs` | Agent deepens stub specs (`DEEPEN_LIMIT`) |
| `qaagent --plain --unblock-massa` | Prepare mass and try to unblock `@massa` cases (`MASSA_UNBLOCK_LIMIT`) |
| `qaagent --plain --tour` | Headed tour only |
| `qaagent --plain --load-only` | k6 smoke/load only |
| `qaagent --project NAME` | Use / create that project (saved in settings) |
| `qaagent --projects` | List projects |
| `qaagent --clean [--all] [--yes]` | Wipe generated artifacts |
| `qaagent --help` · `--version` (`-v`) | Help (Portuguese only for now) · version |

Shortcuts: `qaagent-audit`, `qaagent-deepen`, `qaagent-unblock`, `qaagent-massa` (generate mass), `qaagent-tour`, `qaagent-k6`, `qaagent-reports` (list reports), `qaagent-clean`.

## HTTP API (optional)

```bash
npm run serve
```

Listens on `127.0.0.1:8787`. `POST /v1/runs` accepts `{ requisitosPath, baseUrl, authKind, login, senha, credentialsMd }`. Passwords are not written to `run.json`. Set `QA_AGENT_TOKEN` in `.env` to require a Bearer token.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `qaagent` not found after install | Open a **new** terminal (PATH is read at startup) |
| F1 rejects a Cursor key | Team Admin keys are not accepted; create a **user** key |
| F3 Git URL fails | Install Git and make sure it is on PATH; for private repos put the token in the second F3 field, not in the URL |
| `ECONNRESET` from the agent on Windows | Keep `CURSOR_USE_HTTP1=true` (default) in `.env` |
| Specs fail at login, or log in but land on the wrong company / account | Set `E2E_LOGIN_PATH`, `E2E_HOME_PATH` and `E2E_CONTEXT` in `.env` (see [Credentials and secrets](#credentials-and-secrets)) |
| App UI changed but the run reuses the old map | Press **R** on stage 1 or 2 |
| Stage 4 says there are no specs | Run stage 3 (Scripts) first |
| `qaagent --clean` fails with "Sem TTY" | Add `--yes` |
| Suite stops with AMBIENTE | Read `AVISO-AMBIENTE.md`; it is an infra / tool problem, not an app bug |

## Billing

`CURSOR_API_KEY` / `LLM_API_KEY` bills **your** plan. Script generation and triage consume agent runs. Playwright itself does not.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Security: [SECURITY.md](SECURITY.md). License: [MIT](LICENSE).
